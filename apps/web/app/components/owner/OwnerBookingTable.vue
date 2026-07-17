<script setup lang="ts">
export type OwnerBookingRow = {
  id: number
  propertyId: number
  status: string
  checkInDate: string
  checkOutDate: string
  currency: string
  guestName: string | null
  channel: string | null
  totalAmountMinor: number | null
}

const props = defineProps<{
  bookings: OwnerBookingRow[]
  propertyNames?: Record<number, string>
}>()

function money(minor: number | null, currency: string) {
  if (minor == null) return '—'
  const whole = Math.floor(minor / 100)
  const frac = String(Math.abs(minor) % 100).padStart(2, '0')
  return `${whole}.${frac} ${currency}`
}

function propertyLabel(propertyId: number) {
  return props.propertyNames?.[propertyId] ?? `Property ${propertyId}`
}
</script>

<template>
  <section class="bookings" aria-label="Owner bookings">
    <h2>Bookings</h2>
    <p class="hint">Read-only stay and gross revenue fields for your properties.</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Property</th>
            <th>Guest</th>
            <th>Dates</th>
            <th>Channel</th>
            <th>Status</th>
            <th>Gross</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in bookings" :key="b.id">
            <td>{{ propertyLabel(b.propertyId) }}</td>
            <td>{{ b.guestName || '—' }}</td>
            <td>{{ b.checkInDate }} → {{ b.checkOutDate }}</td>
            <td>{{ b.channel || 'direct' }}</td>
            <td>{{ b.status }}</td>
            <td>{{ money(b.totalAmountMinor, b.currency) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="bookings.length === 0" class="empty">No bookings in scope.</p>
    </div>
  </section>
</template>

<style scoped>
.bookings h2 {
  margin: 0 0 0.35rem;
  font-size: 0.95rem;
}
.hint {
  margin: 0 0 0.85rem;
  color: var(--muted);
  font-size: 0.72rem;
}
.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}
th,
td {
  padding: 0.65rem 0.8rem;
  text-align: left;
  border-bottom: 1px solid var(--line);
}
th {
  color: var(--muted);
  font-weight: 600;
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
tr:last-child td {
  border-bottom: 0;
}
.empty {
  margin: 0;
  padding: 1rem;
  color: var(--muted);
  font-size: 0.78rem;
}
</style>
