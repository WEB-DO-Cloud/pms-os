<script setup lang="ts">
export type PropertyListRow = {
  id: number
  name: string
  city: string | null
  country: string | null
  lastSyncedAt: string | null
  ops: {
    status: string
    checkInTime: string | null
    checkOutTime: string | null
    notes: string | null
    archivedAt: string | null
  }
}

defineProps<{
  rows: PropertyListRow[]
}>()
</script>

<template>
  <div class="table-wrap" role="table" aria-label="Properties">
    <div class="head" role="row">
      <span>Property</span>
      <span>Location</span>
      <span>Check-in / out</span>
      <span>Status</span>
      <span>Synced</span>
    </div>
    <NuxtLink
      v-for="row in rows"
      :key="row.id"
      class="row"
      role="row"
      :to="`/properties/${row.id}`"
    >
      <strong>{{ row.name }}</strong>
      <span>{{ [row.city, row.country].filter(Boolean).join(', ') || '—' }}</span>
      <span>{{ row.ops.checkInTime ?? '—' }} / {{ row.ops.checkOutTime ?? '—' }}</span>
      <span :class="{ archived: row.ops.status === 'archived' }">{{ row.ops.status }}</span>
      <span>{{ row.lastSyncedAt ? row.lastSyncedAt.slice(0, 10) : 'Never' }}</span>
    </NuxtLink>
    <p v-if="rows.length === 0" class="empty">No synced properties in scope.</p>
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
  grid-template-columns: 1.3fr 1fr 1fr 0.7fr 0.8fr;
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
.row:hover {
  background: rgba(101, 213, 174, 0.05);
}
.row span {
  color: var(--muted);
}
.archived {
  color: var(--warning) !important;
}
.empty {
  margin: 0;
  padding: 2rem 1.1rem;
  color: var(--muted);
  font-size: 0.75rem;
}
</style>
