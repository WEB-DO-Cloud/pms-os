<script setup lang="ts">
export type RuleRow = {
  id: number
  name: string
  trigger: string
  isActive: boolean
  version: number
  actions: { type: string }[]
  conditions: { propertyIds?: number[]; channel?: string | string[]; status?: string | string[] } | null
}

defineProps<{
  rows: RuleRow[]
  busy?: boolean
}>()

const emit = defineEmits<{
  toggle: [payload: { ruleId: number; isActive: boolean }]
  fire: [payload: { ruleId: number }]
}>()
</script>

<template>
  <div class="table-wrap" role="table" aria-label="Automation rules">
    <div class="head" role="row">
      <span>Rule</span>
      <span>Trigger</span>
      <span>Actions</span>
      <span>Active</span>
      <span />
    </div>
    <div v-for="row in rows" :key="row.id" class="row" role="row">
      <div>
        <strong>{{ row.name }}</strong>
        <p class="meta">v{{ row.version }}</p>
      </div>
      <span class="mono">{{ row.trigger }}</span>
      <span>{{ row.actions.map((a) => a.type).join(', ') || '—' }}</span>
      <label class="toggle">
        <input
          type="checkbox"
          :checked="row.isActive"
          :disabled="busy"
          @change="
            emit('toggle', {
              ruleId: row.id,
              isActive: ($event.target as HTMLInputElement).checked,
            })
          "
        />
        {{ row.isActive ? 'On' : 'Off' }}
      </label>
      <button
        type="button"
        class="ghost"
        :disabled="busy || !row.isActive"
        @click="emit('fire', { ruleId: row.id })"
      >
        Test fire
      </button>
    </div>
    <p v-if="rows.length === 0" class="empty">No automation rules yet.</p>
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
  grid-template-columns: 1.4fr 1.1fr 1.2fr 0.7fr 0.8fr;
  gap: 0.75rem;
  align-items: center;
  padding: 0.85rem 1.1rem;
}
.head {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
}
.row {
  border-top: 1px solid var(--line);
  font-size: 0.8rem;
}
.meta {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: 0.68rem;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.72rem;
}
.toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  color: var(--muted);
}
.ghost {
  justify-self: end;
  padding: 0.35rem 0.65rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: transparent;
  color: var(--fg);
  font-size: 0.68rem;
  cursor: pointer;
}
.ghost:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.empty {
  margin: 0;
  padding: 1.25rem 1.1rem;
  color: var(--muted);
  font-size: 0.75rem;
}
@media (max-width: 720px) {
  .head {
    display: none;
  }
  .row {
    grid-template-columns: 1fr;
    gap: 0.35rem;
  }
  .ghost {
    justify-self: start;
  }
}
</style>
