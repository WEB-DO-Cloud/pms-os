<script setup lang="ts">
export type ReportSummaryView = {
  occupancyPct: number
  revenueMinor: number
  adrMinor: number
  revparMinor: number
  occupiedNights: number
  availableNights: number
  bookingCount: number
  currency: string
  byProperty: Array<{
    propertyId: number
    propertyName: string
    occupancyPct: number
    revenueMinor: number
    adrMinor: number
    revparMinor: number
  }>
  byChannel: Array<{
    channel: string
    revenueMinor: number
    occupiedNights: number
    bookingCount: number
  }>
}

defineProps<{
  summary: ReportSummaryView | null
}>()

function money(minor: number, currency: string) {
  const whole = Math.floor(minor / 100)
  const frac = String(minor % 100).padStart(2, '0')
  return `${whole}.${frac} ${currency}`
}
</script>

<template>
  <div v-if="summary" class="report">
    <div class="metrics" aria-label="Report metrics">
      <div>
        <span>Occupancy</span>
        <strong>{{ summary.occupancyPct }}%</strong>
        <small>{{ summary.occupiedNights }} / {{ summary.availableNights }} nights</small>
      </div>
      <div>
        <span>Revenue</span>
        <strong>{{ money(summary.revenueMinor, summary.currency) }}</strong>
        <small>{{ summary.bookingCount }} bookings</small>
      </div>
      <div>
        <span>ADR</span>
        <strong>{{ money(summary.adrMinor, summary.currency) }}</strong>
        <small>avg daily rate</small>
      </div>
      <div>
        <span>RevPAR</span>
        <strong>{{ money(summary.revparMinor, summary.currency) }}</strong>
        <small>per available night</small>
      </div>
    </div>

    <div class="split">
      <section>
        <h2>By property</h2>
        <ul>
          <li v-for="p in summary.byProperty" :key="p.propertyId">
            <strong>{{ p.propertyName }}</strong>
            <span>{{ p.occupancyPct }}% · {{ money(p.revenueMinor, summary.currency) }}</span>
            <small>ADR {{ money(p.adrMinor, summary.currency) }} · RevPAR {{ money(p.revparMinor, summary.currency) }}</small>
          </li>
        </ul>
        <p v-if="summary.byProperty.length === 0" class="empty">No properties in this range.</p>
      </section>
      <section>
        <h2>By channel</h2>
        <ul>
          <li v-for="c in summary.byChannel" :key="c.channel">
            <strong>{{ c.channel }}</strong>
            <span>{{ money(c.revenueMinor, summary.currency) }}</span>
            <small>{{ c.bookingCount }} bookings · {{ c.occupiedNights }} nights</small>
          </li>
        </ul>
        <p v-if="summary.byChannel.length === 0" class="empty">No channel activity in range.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.metrics > div {
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(13, 24, 22, 0.72);
}
.metrics span {
  display: block;
  color: var(--faint);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.metrics strong {
  display: block;
  margin-top: 0.45rem;
  font-size: 1.15rem;
}
.metrics small {
  color: var(--muted);
  font-size: 0.66rem;
}
.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
section {
  padding: 1rem 1.1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(13, 24, 22, 0.55);
}
h2 {
  margin: 0 0 0.75rem;
  font-size: 0.78rem;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
li {
  display: grid;
  gap: 0.15rem;
  padding: 0.55rem 0;
  border-top: 1px solid var(--line);
  font-size: 0.72rem;
}
li:first-child {
  border-top: 0;
  padding-top: 0;
}
li span {
  color: var(--muted);
}
li small {
  color: var(--faint);
  font-size: 0.64rem;
}
.empty {
  margin: 0;
  color: var(--muted);
  font-size: 0.72rem;
}
@media (max-width: 860px) {
  .metrics,
  .split {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 560px) {
  .metrics,
  .split {
    grid-template-columns: 1fr;
  }
}
</style>
