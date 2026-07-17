<script setup lang="ts">
type Detail = {
  reservation: {
    id: number
    propertyId: number
    guestName: string | null
    guestEmail?: string | null
    checkInDate: string
    checkOutDate: string
    status: string
    pendingSyncReason: string | null
    channel?: string | null
    currency: string
    paymentCollect?: string | null
    paymentType?: string | null
    totalAmountMinor?: number | null
    staffNotes: string | null
    operationalStatus?: string | null
    checkedInAt?: string | null
    checkedOutAt?: string | null
    channexBookingId: string | null
    adults?: number
    children?: number
    infants?: number
  }
  revisions: Array<{
    id: number
    channexRevisionId: string
    status: string
    appliedAt: string
  }>
  ledger: Array<{
    id: number
    type: string
    amountMinor: number
    currency: string
    note: string | null
  }>
  audit: Array<{
    id: number
    action: string
    createdAt: string
  }>
  sync: {
    status: string
    pendingSyncReason: string | null
    isPendingSync: boolean
  }
}

const props = defineProps<{
  detail: Detail
  propertyName: string
  networkId: number
  busy?: boolean
}>()

const emit = defineEmits<{
  refreshed: []
  error: [message: string]
}>()

const note = ref('')
const acting = ref<string | null>(null)

const r = computed(() => props.detail.reservation)
const canCheckIn = computed(
  () =>
    !props.detail.sync.isPendingSync &&
    r.value.status !== 'cancelled' &&
    r.value.operationalStatus !== 'checked_in' &&
    r.value.operationalStatus !== 'checked_out',
)
const canCheckOut = computed(
  () => r.value.operationalStatus === 'checked_in' || Boolean(r.value.checkedInAt),
)

async function run(path: string, body: Record<string, unknown> = {}) {
  acting.value = path
  try {
    await $fetch(path, {
      method: 'POST',
      body: { networkId: props.networkId, ...body },
    })
    note.value = ''
    emit('refreshed')
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    emit('error', e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Action failed')
  } finally {
    acting.value = null
  }
}

function money(minor: number | null | undefined, currency: string) {
  if (minor == null) return '—'
  return `${(minor / 100).toFixed(2)} ${currency}`
}
</script>

<template>
  <div class="detail">
    <header class="hero">
      <div>
        <p class="eyebrow">Reservation · {{ propertyName }}</p>
        <h1>{{ r.guestName ?? 'Guest' }}</h1>
        <p class="page-intro">
          {{ r.checkInDate }} → {{ r.checkOutDate }}
          <span v-if="r.channel"> · {{ r.channel }}</span>
        </p>
      </div>
      <ReservationsSyncStatusBadge
        :status="detail.sync.status"
        :pending-sync-reason="detail.sync.pendingSyncReason"
      />
    </header>

    <p v-if="detail.sync.isPendingSync" class="pending-banner" role="status">
      This booking is not confirmed. Channex write-back is still open
      <template v-if="detail.sync.pendingSyncReason">
        ({{ detail.sync.pendingSyncReason.replace(/_/g, ' ') }}).
      </template>
    </p>

    <div class="section-rule" />

    <div class="grid">
      <section>
        <h2>Guest & stay</h2>
        <dl>
          <div><dt>Email</dt><dd>{{ r.guestEmail ?? '—' }}</dd></div>
          <div><dt>Party</dt><dd>{{ r.adults ?? 1 }} adults · {{ r.children ?? 0 }} children · {{ r.infants ?? 0 }} infants</dd></div>
          <div><dt>Channex id</dt><dd>{{ r.channexBookingId ?? '—' }}</dd></div>
          <div><dt>Operational</dt><dd>{{ r.operationalStatus?.replace(/_/g, ' ') ?? 'Not checked in' }}</dd></div>
        </dl>
      </section>

      <section>
        <h2>Payment metadata</h2>
        <dl>
          <div><dt>Collect</dt><dd>{{ r.paymentCollect ?? '—' }}</dd></div>
          <div><dt>Type</dt><dd>{{ r.paymentType ?? '—' }}</dd></div>
          <div><dt>Total</dt><dd>{{ money(r.totalAmountMinor, r.currency) }}</dd></div>
        </dl>
        <ul v-if="detail.ledger.length" class="list">
          <li v-for="entry in detail.ledger" :key="entry.id">
            {{ entry.type }} · {{ money(entry.amountMinor, entry.currency) }}
            <small v-if="entry.note">{{ entry.note }}</small>
          </li>
        </ul>
      </section>
    </div>

    <section class="actions">
      <h2>Front desk</h2>
      <div class="buttons">
        <button type="button" :disabled="!canCheckIn || Boolean(acting)" @click="run(`/api/reservations/${r.id}/check-in`)">
          Check in
        </button>
        <button type="button" :disabled="!canCheckOut || Boolean(acting)" @click="run(`/api/reservations/${r.id}/check-out`)">
          Check out
        </button>
      </div>
      <form class="note-form" @submit.prevent="run(`/api/reservations/${r.id}/notes`, { note })">
        <label>
          Staff note
          <textarea v-model="note" rows="3" placeholder="Late arrival, VIP, etc." />
        </label>
        <button type="submit" :disabled="!note.trim() || Boolean(acting)">Attach note</button>
      </form>
      <pre v-if="r.staffNotes" class="notes">{{ r.staffNotes }}</pre>
    </section>

    <section>
      <h2>Booking revisions</h2>
      <ul v-if="detail.revisions.length" class="list">
        <li v-for="rev in detail.revisions" :key="rev.id">
          <strong>{{ rev.status }}</strong>
          <span>{{ rev.channexRevisionId }}</span>
          <time>{{ rev.appliedAt }}</time>
        </li>
      </ul>
      <p v-else class="muted">No Channex revisions applied yet.</p>
    </section>

    <section>
      <h2>Audit</h2>
      <ul v-if="detail.audit.length" class="list">
        <li v-for="a in detail.audit" :key="a.id">
          <strong>{{ a.action }}</strong>
          <time>{{ a.createdAt }}</time>
        </li>
      </ul>
      <p v-else class="muted">No local audit rows for this reservation.</p>
    </section>
  </div>
</template>

<style scoped>
.hero {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1.5rem;
}

.pending-banner {
  margin: 1.25rem 0 0;
  padding: 0.85rem 1rem;
  border: 1px solid rgba(241, 185, 111, 0.35);
  border-radius: var(--radius);
  background: rgba(241, 185, 111, 0.08);
  color: var(--warning);
  font-size: 0.72rem;
  line-height: 1.5;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--line);
}

section {
  margin-top: 2rem;
}

.grid section {
  margin: 0;
  padding: 1.25rem 1.4rem;
  background: rgba(13, 24, 22, 0.76);
}

h2 {
  margin: 0 0 1rem;
  font-size: 0.78rem;
}

dl {
  display: grid;
  gap: 0.75rem;
  margin: 0;
}

dl div {
  display: grid;
  gap: 0.2rem;
}

dt {
  color: var(--faint);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

dd {
  margin: 0;
  font-size: 0.78rem;
}

.actions {
  padding: 1.25rem 1.4rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(13, 24, 22, 0.72);
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

button {
  padding: 0.55rem 0.95rem;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--accent-strong);
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 600;
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.note-form {
  display: grid;
  gap: 0.6rem;
  margin-top: 1rem;
}

label {
  display: grid;
  gap: 0.35rem;
  color: var(--faint);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

textarea {
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 0.78rem;
  resize: vertical;
}

.notes {
  margin: 1rem 0 0;
  padding: 0.85rem;
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--muted);
  font-family: inherit;
  font-size: 0.72rem;
  white-space: pre-wrap;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.list li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0.7rem 0;
  border-top: 1px solid var(--line);
  font-size: 0.72rem;
}

.list time,
.list span,
.muted,
.list small {
  color: var(--muted);
}

.muted {
  font-size: 0.72rem;
}

@media (max-width: 760px) {
  .hero {
    display: block;
  }

  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
