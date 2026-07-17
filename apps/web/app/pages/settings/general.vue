<script setup lang="ts">
import {
  canConfigureMultiNetwork,
  canConfigureWhiteLabel,
} from '@pms/licensing'

const { currentNetworkId, principal, canSwitchNetworks, refresh } =
  useCurrentNetwork()

const whiteLabelEnabled = computed(() =>
  canConfigureWhiteLabel(principal.value?.entitlements),
)
const multiNetworkEnabled = computed(() =>
  canConfigureMultiNetwork(principal.value?.entitlements),
)

const branding = ref<{
  displayName: string | null
  logoUrl: string | null
  accentColor: string | null
} | null>(null)

async function loadBranding() {
  if (!whiteLabelEnabled.value) {
    branding.value = null
    return
  }
  try {
    const res = await $fetch<{
      enabled: boolean
      branding: typeof branding.value
    }>('/api/settings/branding', {
      query: { networkId: currentNetworkId.value },
    })
    branding.value = res.branding
  } catch {
    branding.value = null
  }
}

onMounted(loadBranding)
watch(currentNetworkId, () => {
  void loadBranding()
})
</script>

<template>
  <div class="page-shell module-page">
    <p class="eyebrow">Settings</p>
    <h1>General</h1>
    <p class="page-intro">
      Network defaults and commercial white-label branding. Multi-network switching stays gated by
      entitlement.
    </p>

    <div class="section-rule" />

    <section class="defaults">
      <h2>Network defaults</h2>
      <dl>
        <div>
          <dt>Timezone</dt>
          <dd>America/Santo_Domingo</dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>USD</dd>
        </div>
        <div>
          <dt>Multi-network</dt>
          <dd>
            <span :class="multiNetworkEnabled ? 'on' : 'off'">
              {{ multiNetworkEnabled ? 'Entitled' : 'Community — single network' }}
            </span>
            <small v-if="!canSwitchNetworks">
              Switcher hidden until multi-network is enabled for this network.
            </small>
            <small v-else>
              Use the header network dropdown to switch or add networks.
            </small>
          </dd>
        </div>
      </dl>
    </section>

    <div class="section-rule" />

    <SettingsWhiteLabelForm
      v-if="currentNetworkId != null"
      :enabled="whiteLabelEnabled"
      :network-id="currentNetworkId"
      :display-name="branding?.displayName ?? null"
      :logo-url="branding?.logoUrl ?? null"
      :accent-color="branding?.accentColor ?? null"
      @saved="
        (b) => {
          branding = b
          void refresh()
        }
      "
    />
  </div>
</template>

<style scoped>
.module-page {
  max-width: 72rem;
}
.defaults h2 {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
}
dl {
  margin: 0;
  display: grid;
  gap: 0.65rem;
}
dl > div {
  display: grid;
  gap: 0.2rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}
dt {
  color: var(--muted);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
dd {
  margin: 0;
  display: grid;
  gap: 0.25rem;
  font-size: 0.85rem;
}
.on {
  color: var(--accent-strong);
}
.off {
  color: var(--faint);
}
small {
  color: var(--muted);
  font-size: 0.72rem;
}
</style>
