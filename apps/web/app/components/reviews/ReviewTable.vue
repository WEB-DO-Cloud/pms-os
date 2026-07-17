<script setup lang="ts">
export type ReviewRow = {
  id: number
  propertyId: number
  guestName: string | null
  rating: number | null
  title: string | null
  comment: string | null
  source: string
  status: string
  responseTemplate: string | null
  createdAt: string
}

defineProps<{
  rows: ReviewRow[]
  propertyNames: Record<number, string>
  selectedId?: number | null
}>()

const emit = defineEmits<{
  select: [id: number]
}>()
</script>

<template>
  <div class="table-wrap" role="table" aria-label="Reviews">
    <div class="head" role="row">
      <span>Guest</span>
      <span>Property</span>
      <span>Rating</span>
      <span>Source</span>
      <span>Status</span>
    </div>
    <button
      v-for="row in rows"
      :key="row.id"
      type="button"
      class="row"
      :class="{ active: selectedId === row.id }"
      @click="emit('select', row.id)"
    >
      <strong>{{ row.guestName ?? 'Guest' }}</strong>
      <span>{{ propertyNames[row.propertyId] ?? row.propertyId }}</span>
      <span>{{ row.rating ?? '—' }}</span>
      <span>{{ row.source }}</span>
      <span>{{ row.status }}</span>
    </button>
    <p v-if="rows.length === 0" class="empty">No reviews yet — import fixtures to get started.</p>
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
  grid-template-columns: 1.1fr 1fr 0.5fr 0.7fr 0.7fr;
  gap: 0.75rem;
  align-items: center;
  padding: 0.85rem 1.1rem;
  width: 100%;
  text-align: left;
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
  border: 0;
  border-top: 1px solid var(--line);
  background: transparent;
  color: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}
.row:hover,
.row.active {
  background: rgba(101, 213, 174, 0.05);
}
.row span {
  color: var(--muted);
  text-transform: capitalize;
}
.empty {
  margin: 0;
  padding: 2rem 1.1rem;
  color: var(--muted);
  font-size: 0.75rem;
}
</style>
