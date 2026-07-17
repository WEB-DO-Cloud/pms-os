<script setup lang="ts">
export type LedgerRow = {
  id: number
  reservationId: number
  propertyId: number
  type: string
  amountMinor: number
  currency: string
  note: string | null
  compensatesEntryId: number | null
  createdAt: string
  guestName: string | null
  paymentCollect: string | null
  paymentType: string | null
}

defineProps<{
  rows: LedgerRow[]
  propertyNames: Record<number, string>
}>()

function money(minor: number, currency: string) {
  const whole = Math.floor(minor / 100)
  const frac = String(minor % 100).padStart(2, '0')
  return `${whole}.${frac} ${currency}`
}
</script>

<template>
  <div class="table-wrap" role="table" aria-label="Payment ledger">
    <div class="head" role="row">
      <span>When</span>
      <span>Reservation</span>
      <span>Type</span>
      <span>Amount</span>
      <span>Channex meta</span>
    </div>
    <div v-for="row in rows" :key="row.id" class="row" role="row">
      <span>{{ row.createdAt.slice(0, 19).replace('T', ' ') }}</span>
      <div>
        <strong>#{{ row.reservationId }} · {{ row.guestName ?? 'Guest' }}</strong>
        <p class="desc">
          {{ propertyNames[row.propertyId] ?? `Property ${row.propertyId}` }}
          <template v-if="row.compensatesEntryId"> · compensates #{{ row.compensatesEntryId }}</template>
        </p>
      </div>
      <span class="type">{{ row.type }}</span>
      <span>{{ money(row.amountMinor, row.currency) }}</span>
      <span>
        {{ row.paymentCollect ?? '—' }}
        <template v-if="row.paymentType"> / {{ row.paymentType }}</template>
        <em v-if="row.note" class="note"> · {{ row.note }}</em>
      </span>
    </div>
    <p v-if="rows.length === 0" class="empty">No ledger events in this scope.</p>
  </div>
</template>

<style scoped>
.table-wrap {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(13, 24, 22, 0.72);
}
.head,
.row {
  display: grid;
  grid-template-columns: 1fr 1.3fr 0.7fr 0.9fr 1.2fr;
  gap: 0.75rem;
  align-items: center;
  padding: 0.85rem 1.1rem;
}
.head {
  border-bottom: 1px solid var(--line);
  color: var(--faint);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.row {
  border-top: 1px solid var(--line);
  font-size: 0.72rem;
}
.row strong {
  font-size: 0.78rem;
}
.desc {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: 0.66rem;
}
.row > span {
  color: var(--muted);
}
.type {
  text-transform: capitalize;
}
.note {
  font-style: normal;
  color: var(--faint);
}
.empty {
  margin: 0;
  padding: 2rem 1.1rem;
  color: var(--muted);
  font-size: 0.75rem;
}
@media (max-width: 860px) {
  .head {
    display: none;
  }
  .row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
