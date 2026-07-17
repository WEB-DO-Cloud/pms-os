<script setup lang="ts">
export type RatePlanRow = {
  propertyId: number
  propertyName: string
  ratePlanName: string
  currency: string
  amountMinor: number | null
  dateFrom: string
  dateTo: string
  minStay: number | null
  stopSell: boolean
  parityWarning: string | null
  state: 'cached' | 'unavailable' | 'cache_miss'
  cachedAt: string | null
}

defineProps<{
  rows: RatePlanRow[]
}>()

function money(minor: number | null, currency: string) {
  if (minor == null) return '—'
  const whole = Math.floor(minor / 100)
  const frac = String(minor % 100).padStart(2, '0')
  return `${whole}.${frac} ${currency}`
}
</script>

<template>
  <div class="table-wrap" role="table" aria-label="Rate plans">
    <div class="head" role="row">
      <span>Property / plan</span>
      <span>Nightly</span>
      <span>Window</span>
      <span>Restrictions</span>
      <span>State</span>
    </div>
    <div v-for="(row, idx) in rows" :key="`${row.propertyId}-${row.ratePlanName}-${idx}`" class="row" role="row">
      <div>
        <strong>{{ row.propertyName }}</strong>
        <p class="desc">{{ row.ratePlanName }}</p>
      </div>
      <span>{{ money(row.amountMinor, row.currency) }}</span>
      <span>
        <template v-if="row.dateFrom && row.dateTo">{{ row.dateFrom }} → {{ row.dateTo }}</template>
        <template v-else>—</template>
      </span>
      <span>
        <template v-if="row.minStay != null">min {{ row.minStay }}</template>
        <template v-else>—</template>
        <em v-if="row.stopSell" class="warn"> · stop-sell</em>
        <em v-if="row.parityWarning" class="warn"> · {{ row.parityWarning }}</em>
      </span>
      <span :class="['state', row.state]">{{ row.state.replace('_', ' ') }}</span>
    </div>
    <p v-if="rows.length === 0" class="empty">No properties in scope for rates.</p>
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
  grid-template-columns: 1.4fr 0.9fr 1.1fr 1.2fr 0.8fr;
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
.warn {
  color: #e8b86d;
  font-style: normal;
}
.state.cached {
  color: var(--accent);
  text-transform: capitalize;
}
.state.unavailable,
.state.cache_miss {
  color: #e8b86d;
  text-transform: capitalize;
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
