<script setup lang="ts">
import { OTAS, type OtaCode } from '#shared/otas'

export type ChannelPropertyOption = {
  id: number
  name: string
}

const props = defineProps<{
  networkId: number
  properties: ChannelPropertyOption[]
  propertyId?: number
  channel?: OtaCode
  /** Pre-minted iframe URL from connect-ota — skips a second one-time token. */
  initialUrl?: string
}>()

const selectedPropertyId = ref<number | null>(props.propertyId ?? null)
const busy = ref(false)
const error = ref<string | null>(null)
const iframeUrl = ref<string | null>(props.initialUrl ?? null)

const channelLabel = computed(() => {
  if (!props.channel) return 'channels'
  return OTAS.find((o) => o.code === props.channel)?.name ?? props.channel
})

watch(
  () => props.propertyId,
  (id) => {
    if (id != null) selectedPropertyId.value = id
  },
)

watch(
  () => props.properties,
  (list) => {
    if (selectedPropertyId.value != null) return
    if (list.length === 1) selectedPropertyId.value = list[0]!.id
  },
  { immediate: true },
)

async function openSession() {
  if (selectedPropertyId.value == null) {
    error.value = 'Select a property first'
    return
  }
  busy.value = true
  error.value = null
  iframeUrl.value = null
  try {
    const res = await $fetch<{ url: string }>('/api/channex/channel-session', {
      method: 'POST',
      body: {
        networkId: props.networkId,
        propertyId: selectedPropertyId.value,
        channel: props.channel,
      },
    })
    iframeUrl.value = res.url
  } catch (err: unknown) {
    const e = err as {
      data?: { statusMessage?: string; message?: string }
      statusMessage?: string
      message?: string
    }
    error.value =
      e?.data?.statusMessage ??
      e?.data?.message ??
      e?.statusMessage ??
      e?.message ??
      'Could not open channel session'
  } finally {
    busy.value = false
  }
}

function closeIframe() {
  iframeUrl.value = null
}

onMounted(() => {
  if (props.initialUrl) {
    iframeUrl.value = props.initialUrl
    return
  }
  if (props.propertyId != null && props.channel) {
    void openSession()
  }
})
</script>

<template>
  <section class="channel-connect" aria-label="Sales channels">
    <div class="panel-head">
      <div>
        <h2>Sales channels</h2>
        <p>
          Connect and manage
          <template v-if="channel">{{ channelLabel }}</template>
          <template v-else>Airbnb, Booking.com, Expedia, Vrbo, and Hostelworld</template>
          via Channex. Mapping and OAuth stay in the channel manager UI.
        </p>
      </div>
    </div>

    <p v-if="!properties.length" class="empty" role="status">
      Create a property first, then connect OTAs here.
    </p>

    <template v-else>
      <div class="controls">
        <label v-if="properties.length > 1 || propertyId == null">
          <span>Property</span>
          <select v-model.number="selectedPropertyId">
            <option :value="null" disabled>Select property</option>
            <option v-for="p in properties" :key="p.id" :value="p.id">
              {{ p.name }}
            </option>
          </select>
        </label>
        <button
          type="button"
          class="btn-primary"
          :disabled="busy || selectedPropertyId == null"
          @click="openSession"
        >
          {{ busy ? 'Opening…' : iframeUrl ? 'Refresh session' : 'Connect / manage channels' }}
        </button>
        <button v-if="iframeUrl" type="button" class="btn-ghost" @click="closeIframe">
          Close
        </button>
      </div>

      <p v-if="error" class="msg failed" role="alert">{{ error }}</p>

      <div v-if="iframeUrl" class="iframe-wrap">
        <iframe
          :src="iframeUrl"
          title="Channex channel manager"
          class="channel-iframe"
          allow="clipboard-write"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.channel-connect {
  margin-top: 1.6rem;
  padding: 1.25rem 0 0;
  border-top: 1px solid var(--line);
}

.panel-head h2 {
  margin: 0;
  font-size: 1rem;
}

.panel-head p {
  margin: 0.4rem 0 0;
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.5;
  max-width: 40rem;
}

.empty {
  margin: 1rem 0 0;
  color: var(--muted);
  font-size: 0.78rem;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
  margin-top: 1.1rem;
}

.controls label > span {
  display: block;
  margin-bottom: 0.35rem;
  color: var(--muted);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.controls select {
  min-width: 14rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--line-strong);
  border-radius: calc(var(--radius) - 0.2rem);
  background: var(--surface);
  color: var(--ink);
  font-size: 0.85rem;
}

.btn-primary,
.btn-ghost {
  padding: 0.55rem 1rem;
  border-radius: calc(var(--radius) - 0.25rem);
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
}

.btn-primary {
  border: 0;
  background: var(--accent);
  color: #04110d;
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-ghost {
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--ink);
}

.msg {
  margin: 0.85rem 0 0;
  font-size: 0.7rem;
}

.failed {
  color: var(--danger);
}

.iframe-wrap {
  margin-top: 1.1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--surface-raised);
  min-height: 32rem;
}

.channel-iframe {
  display: block;
  width: 100%;
  height: min(70vh, 40rem);
  border: 0;
}
</style>
