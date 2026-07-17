<script setup lang="ts">
export type InboxMessage = {
  id: number
  propertyId: number
  reservationId: number
  channel: string
  body: string
  status: string
  createdAt: string
}

defineProps<{
  rows: InboxMessage[]
  propertyNames: Record<number, string>
}>()
</script>

<template>
  <div class="table-wrap" role="table" aria-label="Outbound queue">
    <div class="head" role="row">
      <span>When</span>
      <span>Reservation</span>
      <span>Property</span>
      <span>Channel</span>
      <span>Status</span>
      <span>Body</span>
    </div>
    <div v-for="row in rows" :key="row.id" class="row" role="row">
      <span>{{ row.createdAt.slice(0, 16).replace('T', ' ') }}</span>
      <NuxtLink :to="`/reservations/${row.reservationId}`">#{{ row.reservationId }}</NuxtLink>
      <span>{{ propertyNames[row.propertyId] ?? row.propertyId }}</span>
      <span>{{ row.channel }}</span>
      <span class="status">{{ row.status }}</span>
      <span class="body">{{ row.body }}</span>
    </div>
    <p v-if="rows.length === 0" class="empty">No queued guest messages.</p>
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
  grid-template-columns: 0.9fr 0.7fr 1fr 0.7fr 0.6fr 1.4fr;
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
.row span,
.body {
  color: var(--muted);
}
.status {
  text-transform: uppercase;
  font-size: 0.6rem;
  font-weight: 700;
  color: var(--accent) !important;
}
a {
  color: var(--accent-strong);
}
.empty {
  margin: 0;
  padding: 2rem 1.1rem;
  color: var(--muted);
  font-size: 0.75rem;
}
</style>
