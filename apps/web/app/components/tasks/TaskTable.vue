<script setup lang="ts">
export type TaskRow = {
  id: number
  propertyId: number | null
  title: string
  category: string
  status: string
  assignedToUserId: string | null
  description: string | null
}

const props = defineProps<{
  rows: TaskRow[]
  propertyNames: Record<number, string>
  busy?: boolean
}>()

const emit = defineEmits<{
  status: [payload: { taskId: number; propertyId: number; status: string }]
}>()
</script>

<template>
  <div class="table-wrap" role="table" aria-label="Tasks">
    <div class="head" role="row">
      <span>Task</span>
      <span>Property</span>
      <span>Category</span>
      <span>Assignee</span>
      <span>Status</span>
    </div>
    <div v-for="row in rows" :key="row.id" class="row" role="row">
      <div>
        <strong>{{ row.title }}</strong>
        <p v-if="row.description" class="desc">{{ row.description }}</p>
      </div>
      <span>{{
        row.propertyId != null
          ? (propertyNames[row.propertyId] ?? `Property ${row.propertyId}`)
          : '—'
      }}</span>
      <span>{{ row.category }}</span>
      <span>{{ row.assignedToUserId ?? 'Unassigned' }}</span>
      <div class="status">
        <select
          :value="row.status"
          :disabled="busy || row.propertyId == null"
          @change="
            emit('status', {
              taskId: row.id,
              propertyId: row.propertyId!,
              status: ($event.target as HTMLSelectElement).value,
            })
          "
        >
          <option value="todo">Todo</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
    </div>
    <p v-if="rows.length === 0" class="empty">No tasks in this scope.</p>
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
  grid-template-columns: 1.4fr 1fr 0.8fr 1fr 0.9fr;
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
.row span {
  color: var(--muted);
  text-transform: capitalize;
}
select {
  width: 100%;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  background: var(--surface);
  color: var(--ink);
  font-size: 0.68rem;
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
