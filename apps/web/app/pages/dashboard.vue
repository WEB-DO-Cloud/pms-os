<script setup lang="ts">
import { OTAS, type OtaCode } from '#shared/otas'

type CreatedProperty = {
  id: number
  channexId: string
  name: string
  slug: string
}

const { userName, currentNetwork, ready, properties, refresh } = useCurrentNetwork()
const { data: setup } = await useFetch('/api/setup/status', { key: 'setup-status' })

type OnboardingPhase = 'choose' | 'form' | 'connect'

const phase = ref<OnboardingPhase>('choose')
const pendingChannel = ref<OtaCode | null>(null)
const createdProperty = ref<CreatedProperty | null>(null)
const iframeUrl = ref<string | null>(null)
const connecting = ref(false)
const connectError = ref<string | null>(null)

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

const todayLabel = computed(() =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date()),
)

const firstName = computed(() => {
  const raw = userName.value?.trim() || 'there'
  return raw.split(/\s+/)[0] || 'there'
})

const isCommercial = computed(() => setup.value?.edition === 'commercial')
const showOnboarding = computed(
  () => isCommercial.value && ready.value && properties.value.length === 0,
)
/** Keep the post-create channel iframe visible after refresh populates properties. */
const showOnboardingFlow = computed(
  () =>
    isCommercial.value &&
    ready.value &&
    currentNetwork.value != null &&
    (properties.value.length === 0 || phase.value === 'connect'),
)
const showCommunityEmpty = computed(() => !isCommercial.value && ready.value)

async function startOta(code: OtaCode) {
  if (!currentNetwork.value || connecting.value) return
  connecting.value = true
  connectError.value = null
  pendingChannel.value = code
  try {
    const res = await $fetch<{
      property: CreatedProperty
      url: string
    }>('/api/channex/connect-ota', {
      method: 'POST',
      body: {
        networkId: currentNetwork.value.id,
        channel: code,
      },
    })
    createdProperty.value = res.property
    iframeUrl.value = res.url
    await refresh()
    phase.value = 'connect'
  } catch (err: unknown) {
    const e = err as {
      data?: { statusMessage?: string; message?: string }
      statusMessage?: string
      message?: string
    }
    connectError.value =
      e?.data?.statusMessage ??
      e?.data?.message ??
      e?.statusMessage ??
      e?.message ??
      'Could not connect channel'
    pendingChannel.value = null
  } finally {
    connecting.value = false
  }
}

function startManual() {
  pendingChannel.value = null
  iframeUrl.value = null
  connectError.value = null
  phase.value = 'form'
}

function backToChoose() {
  pendingChannel.value = null
  iframeUrl.value = null
  connectError.value = null
  phase.value = 'choose'
}

async function onPropertyCreated(_property: CreatedProperty) {
  await refresh()
  phase.value = 'choose'
}

const pendingOtaName = computed(
  () => OTAS.find((o) => o.code === pendingChannel.value)?.name ?? null,
)
</script>

<template>
  <div class="page-shell dashboard">
    <header class="dashboard-head">
      <div>
        <p class="eyebrow">{{ todayLabel }}</p>
        <h1>{{ greeting }}, {{ firstName }}.</h1>
        <p class="page-intro">
          <template v-if="ready && currentNetwork">
            <template v-if="showOnboarding && phase === 'choose'">
              Welcome to <strong>{{ currentNetwork.name }}</strong>. Connect an OTA
              to auto-create your property, or add one manually.
            </template>
            <template v-else-if="showOnboarding && phase === 'form'">
              Add your first property below — we’ll register it with Channex for you.
            </template>
            <template v-else-if="phase === 'connect'">
              Finish connecting
              <strong>{{ pendingOtaName }}</strong> below.
            </template>
            <template v-else-if="isCommercial">
              You are in <strong>{{ currentNetwork.name }}</strong>.
              <template v-if="properties.length">
                {{ properties.length }} propert{{ properties.length === 1 ? 'y' : 'ies' }} in your workspace.
              </template>
            </template>
            <template v-else>
              You are in <strong>{{ currentNetwork.name }}</strong>. Connect
              Channex under Settings → Integrations to import properties and
              reservations.
            </template>
          </template>
          <template v-else>
            Loading your workspace…
          </template>
        </p>
      </div>
      <NuxtLink
        v-if="!showOnboarding && !isCommercial"
        class="quick-action"
        to="/settings/integrations"
      >
        Open integrations <span>→</span>
      </NuxtLink>
      <NuxtLink v-else-if="!showOnboarding && properties.length" class="quick-action" to="/properties">
        View properties <span>→</span>
      </NuxtLink>
    </header>

    <template v-if="showOnboardingFlow && currentNetwork">
      <section v-if="phase === 'choose'" class="ota-chooser" aria-label="Connect channels">
        <header class="chooser-head">
          <p class="eyebrow">Get started</p>
          <h2>Connect a sales channel</h2>
          <p>
            Pick an OTA — we’ll create a property with starter rooms and rates,
            then open the channel connection. Or add a property manually.
          </p>
        </header>

        <p v-if="connectError" class="connect-err" role="alert">{{ connectError }}</p>
        <p v-if="connecting" class="connect-busy" role="status">
          Creating property and opening {{ pendingOtaName }}…
        </p>

        <div class="ota-grid">
          <button
            v-for="ota in OTAS"
            :key="ota.code"
            type="button"
            class="ota-tile"
            :class="{ 'ota-tile--light': ota.code === 'EXP' }"
            :style="{ '--ota-color': ota.color }"
            :disabled="connecting"
            @click="startOta(ota.code)"
          >
            <span class="ota-badge" aria-hidden="true">{{ ota.code }}</span>
            <span class="ota-name">{{ ota.name }}</span>
            <span class="ota-cta">Connect →</span>
          </button>
        </div>

        <div class="manual-row">
          <button type="button" class="btn-manual" :disabled="connecting" @click="startManual">
            Manual property creation
          </button>
        </div>
      </section>

      <div v-else-if="phase === 'form'" class="form-phase">
        <button type="button" class="back-link" @click="backToChoose">
          ← Back to channels
        </button>
        <DashboardPropertyOnboardingWizard
          :network-id="currentNetwork.id"
          :network-name="currentNetwork.name"
          @created="onPropertyCreated"
        />
      </div>

      <section v-else-if="phase === 'connect' && createdProperty" class="connect-phase">
        <IntegrationsChannelConnect
          :network-id="currentNetwork.id"
          :properties="[{ id: createdProperty.id, name: createdProperty.name }]"
          :property-id="createdProperty.id"
          :channel="pendingChannel ?? undefined"
          :initial-url="iframeUrl ?? undefined"
        />
        <div class="actions">
          <NuxtLink class="primary" to="/properties">View property</NuxtLink>
          <NuxtLink class="ghost" to="/settings/integrations">All channels in Settings</NuxtLink>
        </div>
      </section>
    </template>

    <section
      v-else-if="showCommunityEmpty"
      class="empty-panel"
      aria-label="Getting started"
    >
      <p class="eyebrow">Live operations</p>
      <h2>No synced activity yet</h2>
      <p>
        Occupancy, arrivals, and revenue cards appear here once properties and
        booking revisions are imported from Channex. Until then this board stays
        empty on purpose — no demo data.
      </p>
      <div class="actions">
        <NuxtLink class="primary" to="/settings/integrations">Connect Channex</NuxtLink>
        <NuxtLink class="ghost" to="/calendar">Open calendar</NuxtLink>
      </div>
    </section>

    <section
      v-else-if="isCommercial && ready && properties.length > 0 && phase !== 'connect'"
      class="empty-panel ops-ready"
      aria-label="Operations"
    >
      <p class="eyebrow">Live operations</p>
      <h2>Property connected</h2>
      <p>
        Occupancy, arrivals, and revenue cards will populate as booking revisions
        sync from Channex. Open the calendar or reservations to monitor incoming
        stays. Manage OTA connections under Settings → Integrations.
      </p>
      <div class="actions">
        <NuxtLink class="primary" to="/calendar">Open calendar</NuxtLink>
        <NuxtLink class="ghost" to="/settings/integrations">Sales channels</NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.25rem;
  margin-bottom: 1.75rem;
}

.dashboard-head h1 {
  margin: 0;
  font-family: Manrope, sans-serif;
  font-size: clamp(1.8rem, 3vw, 2.4rem);
  letter-spacing: -0.03em;
}

.page-intro {
  max-width: 40rem;
  margin: 0.65rem 0 0;
  color: var(--muted);
  line-height: 1.55;
}

.quick-action {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.7rem 1rem;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  color: var(--accent-strong);
  background: var(--accent-soft);
  font-size: 0.88rem;
  font-weight: 600;
}

.ota-chooser,
.empty-panel,
.connect-phase {
  padding: 1.6rem 1.5rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.chooser-head h2,
.empty-panel h2 {
  margin: 0 0 0.55rem;
  font-family: Manrope, sans-serif;
  font-size: 1.35rem;
}

.chooser-head p,
.empty-panel p {
  max-width: 42rem;
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
  font-size: 0.88rem;
}

.connect-err {
  margin: 1rem 0 0;
  color: var(--danger);
  font-size: 0.82rem;
}

.connect-busy {
  margin: 1rem 0 0;
  color: var(--accent-strong);
  font-size: 0.82rem;
  font-weight: 600;
}

.ota-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
  gap: 0.85rem;
  margin-top: 1.35rem;
}

.ota-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 1rem 0.95rem;
  border: 1px solid var(--line);
  border-radius: calc(var(--radius) - 0.1rem);
  background: var(--surface-raised);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.ota-tile:hover:not(:disabled) {
  border-color: var(--ota-color);
  transform: translateY(-1px);
}

.ota-tile:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ota-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.6rem;
  padding: 0.35rem 0.5rem;
  border-radius: 0.4rem;
  background: var(--ota-color);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.ota-tile--light .ota-badge {
  color: #1a1a1a;
}

.ota-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--ink);
}

.ota-cta {
  margin-top: auto;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
}

.manual-row {
  margin-top: 1.25rem;
  padding-top: 1.1rem;
  border-top: 1px solid var(--line);
}

.btn-manual {
  padding: 0.65rem 1rem;
  border: 1px solid var(--line-strong);
  border-radius: 0.55rem;
  background: transparent;
  color: var(--ink);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-manual:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent-strong);
}

.btn-manual:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.form-phase {
  display: grid;
  gap: 0.75rem;
}

.back-link {
  justify-self: start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.back-link:hover {
  color: var(--accent-strong);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  margin-top: 1.25rem;
}

.actions a {
  display: inline-flex;
  padding: 0.65rem 0.95rem;
  border-radius: 0.55rem;
  font-size: 0.9rem;
  font-weight: 600;
}

.actions .primary {
  background: var(--accent);
  color: #04201a;
}

.actions .ghost {
  border: 1px solid var(--line-strong);
  color: var(--ink);
}

.connect-phase :deep(.channel-connect) {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}
</style>
