<script setup lang="ts">
export type GuestRow = {
  guestKey: string
  displayName: string
  email: string | null
  stayCount: number
  vip: boolean
  notes: string | null
  propertyIds: number[]
}

defineProps<{
  rows: GuestRow[]
  selectedKey?: string | null
}>()

const emit = defineEmits<{
  select: [guestKey: string]
}>()
</script>

<template>
  <div class="table-wrap" role="table" aria-label="Guests">
    <div class="head" role="row">
      <span>Guest</span>
      <span>Email</span>
      <span>Stays</span>
      <span>VIP</span>
    </div>
    <button
      v-for="row in rows"
      :key="row.guestKey"
      type="button"
      class="row"
      :class="{ active: selectedKey === row.guestKey }"
      role="row"
      @click="emit('select', row.guestKey)"
    >
      <strong>{{ row.displayName }}</strong>
      <span>{{ row.email ?? '—' }}</span>
      <span>{{ row.stayCount }}</span>
      <span>{{ row.vip ? 'VIP' : '—' }}</span>
    </button>
    <p v-if="rows.length === 0" class="empty">No guests derived from scoped reservations.</p>
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
  grid-template-columns: 1.2fr 1.2fr 0.5fr 0.5fr;
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
}
.empty {
  margin: 0;
  padding: 2rem 1.1rem;
  color: var(--muted);
  font-size: 0.75rem;
}
</style>
