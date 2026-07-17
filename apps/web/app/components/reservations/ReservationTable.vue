<script setup lang="ts">
export type ReservationRow = {
  id: number
  propertyId: number
  guestName: string | null
  checkInDate: string
  checkOutDate: string
  status: string
  pendingSyncReason: string | null
  channel?: string | null
  operationalStatus?: string | null
  channexBookingId?: string | null
}

defineProps<{
  rows: ReservationRow[]
  propertyNames: Record<number, string>
}>()
</script>

<template>
  <div class="table-wrap" role="table" aria-label="Reservations">
    <div class="head" role="row">
      <span>Guest</span>
      <span>Property</span>
      <span>Stay</span>
      <span>Channel</span>
      <span>Sync</span>
      <span>Ops</span>
    </div>
    <NuxtLink
      v-for="row in rows"
      :key="row.id"
      class="row"
      role="row"
      :to="`/reservations/${row.id}`"
    >
      <strong>{{ row.guestName ?? 'Guest' }}</strong>
      <span>{{ propertyNames[row.propertyId] ?? `Property ${row.propertyId}` }}</span>
      <span>{{ row.checkInDate }} → {{ row.checkOutDate }}</span>
      <span>{{ row.channel ?? '—' }}</span>
      <ReservationsSyncStatusBadge
        :status="row.status"
        :pending-sync-reason="row.pendingSyncReason"
        compact
      />
      <span class="ops">{{ row.operationalStatus?.replace(/_/g, ' ') ?? '—' }}</span>
    </NuxtLink>
    <p v-if="rows.length === 0" class="empty">No reservations in this scope.</p>
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
  grid-template-columns: 1.2fr 1fr 1.2fr 0.7fr 1fr 0.8fr;
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
  transition: background 160ms ease;
}

.row:first-of-type {
  border-top: 0;
}

.row:hover {
  background: rgba(101, 213, 174, 0.05);
}

.row strong {
  font-size: 0.78rem;
}

.row span,
.ops {
  color: var(--muted);
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
    gap: 0.35rem 1rem;
  }
}
</style>
