<script setup lang="ts">
import type { InboxMessage } from '~/components/inbox/MessageQueue.vue'

const { currentNetworkId, properties: shellProperties } = useCurrentNetwork()

const propertyFilter = ref<number | 'all'>('all')
const messages = ref<InboxMessage[]>([])
const apiProperties = ref<{ id: number; name: string }[]>([])
const reservations = ref<{ id: number; propertyId: number; guestName: string | null }[]>([])
const reservationId = ref<number | null>(null)
const body = ref('')
const error = ref<string | null>(null)
const flash = ref<string | null>(null)
const loading = ref(false)
const brief = ref('')
const aiBusy = ref(false)
const { enabled, disabledHint } = useAiStatus()

const propertyNames = computed(() => {
  const map: Record<number, string> = {}
  for (const p of apiProperties.value.length ? apiProperties.value : shellProperties.value) {
    map[p.id] = p.name
  }
  return map
})

const selectedReservation = computed(() =>
  reservations.value.find((r) => r.id === reservationId.value) ?? null,
)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{
      properties: { id: number; name: string }[]
      reservations: { id: number; propertyId: number; guestName: string | null }[]
      messages: InboxMessage[]
    }>('/api/inbox', {
      query: {
        networkId: currentNetworkId.value,
        ...(propertyFilter.value === 'all' ? {} : { propertyId: propertyFilter.value }),
      },
    })
    apiProperties.value = res.properties
    reservations.value = res.reservations
    messages.value = res.messages
    if (
      reservationId.value != null &&
      !reservations.value.some((r) => r.id === reservationId.value)
    ) {
      reservationId.value = null
    }
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load inbox'
    messages.value = []
  } finally {
    loading.value = false
  }
}

async function queue() {
  if (!selectedReservation.value || !body.value.trim()) {
    error.value = 'Pick a reservation and enter a message'
    return
  }
  try {
    await $fetch('/api/inbox', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        reservationId: selectedReservation.value.id,
        propertyId: selectedReservation.value.propertyId,
        body: body.value.trim(),
        channel: 'channex',
      },
    })
    flash.value = 'Message queued (outbound — not a full email send)'
    body.value = ''
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Queue failed'
  }
}

async function draftWithAi() {
  if (reservationId.value == null) {
    error.value = 'Pick a reservation first'
    return
  }
  aiBusy.value = true
  error.value = null
  try {
    const res = await $fetch<{
      draft: { body: string; tone: string[]; caution?: string | null }
      note: string
    }>('/api/ai/concierge/draft', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        reservationId: reservationId.value,
        brief: brief.value.trim() || undefined,
      },
    })
    body.value = res.draft.body
    flash.value = res.note
    if (res.draft.caution) flash.value += ` · Caution: ${res.draft.caution}`
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'AI draft failed'
  } finally {
    aiBusy.value = false
  }
}

onMounted(load)
watch([currentNetworkId, propertyFilter], () => {
  void load()
})
</script>

<template>
  <div class="page-shell">
    <header class="head">
      <div>
        <p class="eyebrow">Guest communications</p>
        <h1>Inbox</h1>
        <p class="page-intro">
          Reservation-linked outbound message queue. Records attempts via domain commands — not a
          full mailbox product.
        </p>
      </div>
    </header>

    <div class="section-rule" />

    <div class="toolbar">
      <label>
        Property
        <select v-model="propertyFilter">
          <option value="all">All accessible</option>
          <option
            v-for="p in apiProperties.length ? apiProperties : shellProperties"
            :key="p.id"
            :value="p.id"
          >
            {{ p.name }}
          </option>
        </select>
      </label>
    </div>

    <form class="compose" @submit.prevent="queue">
      <label>
        Reservation
        <select v-model="reservationId">
          <option :value="null">Select…</option>
          <option v-for="r in reservations" :key="r.id" :value="r.id">
            #{{ r.id }} · {{ r.guestName ?? 'Guest' }} · property {{ r.propertyId }}
          </option>
        </select>
      </label>
      <label class="wide">
        Message
        <textarea v-model="body" rows="2" placeholder="Guest-facing reply…" />
      </label>
      <button type="submit" :disabled="loading">Queue message</button>
    </form>

    <AiPanel
      title="AI concierge draft"
      subtitle="Grok drafts a reply into the composer. You still queue to send — no auto-send."
      :disabled-hint="disabledHint"
    >
      <label class="brief">
        Staff brief (optional)
        <input v-model="brief" type="text" placeholder="e.g. late checkout ok until 1pm" />
      </label>
      <button
        type="button"
        :disabled="!enabled || aiBusy || reservationId == null"
        @click="draftWithAi"
      >
        {{ aiBusy ? 'Drafting…' : 'Draft with AI' }}
      </button>
    </AiPanel>

    <p v-if="flash" class="flash" role="status">{{ flash }}</p>
    <p v-if="error" class="gate" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading queue…</p>

    <InboxMessageQueue :rows="messages" :property-names="propertyNames" />
  </div>
</template>

<style scoped>
.toolbar {
  margin-bottom: 1rem;
}
label {
  display: grid;
  gap: 0.3rem;
  color: var(--faint);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.compose {
  display: grid;
  grid-template-columns: 1.2fr 2fr auto;
  gap: 0.85rem;
  align-items: end;
  margin-bottom: 1.25rem;
}
.wide {
  /* keep */
}
select,
textarea,
button {
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--ink);
  font-size: 0.72rem;
}
button {
  border-color: rgba(101, 213, 174, 0.45);
  color: var(--accent-strong);
  font-weight: 600;
  cursor: pointer;
  height: fit-content;
}
.flash {
  margin: 0 0 0.85rem;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(241, 185, 111, 0.35);
  border-radius: var(--radius);
  background: rgba(241, 185, 111, 0.08);
  color: var(--warning);
  font-size: 0.72rem;
}
.gate {
  margin: 0 0 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(244, 127, 122, 0.35);
  border-radius: var(--radius);
  color: var(--danger);
  font-size: 0.72rem;
}
.muted {
  margin: 0 0 0.85rem;
  color: var(--muted);
  font-size: 0.66rem;
}
.brief {
  margin-bottom: 0.65rem;
}
.brief input {
  width: 100%;
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--ink);
  font-size: 0.72rem;
}
@media (max-width: 860px) {
  .compose {
    grid-template-columns: 1fr;
  }
}
</style>
