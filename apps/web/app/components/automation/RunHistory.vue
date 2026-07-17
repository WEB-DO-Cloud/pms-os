<script setup lang="ts">
export type RunRow = {
  id: number
  ruleId: number
  status: string
  conditionMatched: boolean
  conditionDetail: string | null
  idempotencyKey: string
  dryRun: boolean
  startedAt: string
  finishedAt: string | null
  actionsAttempted: {
    index: number
    type: string
    commandName: string
    status: string
    approvalId?: string
    error?: string
    idempotentReplay?: boolean
  }[]
  inputEvent: { type: string; eventKey: string; propertyId?: number }
}

defineProps<{
  rows: RunRow[]
  ruleNames: Record<number, string>
  busy?: boolean
}>()

const emit = defineEmits<{
  retry: [payload: { runId: number }]
}>()

function canRetry(status: string) {
  return status === 'failed' || status === 'partial_failure'
}
</script>

<template>
  <div class="table-wrap" role="table" aria-label="Automation run history">
    <div class="head" role="row">
      <span>Run</span>
      <span>Rule</span>
      <span>Event</span>
      <span>Condition</span>
      <span>Actions</span>
      <span>Status</span>
      <span />
    </div>
    <div v-for="row in rows" :key="row.id" class="row" role="row">
      <div>
        <strong>#{{ row.id }}</strong>
        <p class="meta">{{ row.dryRun ? 'dry-run · ' : '' }}{{ row.idempotencyKey }}</p>
      </div>
      <span>{{ ruleNames[row.ruleId] ?? `Rule ${row.ruleId}` }}</span>
      <span class="mono">{{ row.inputEvent.type }} / {{ row.inputEvent.eventKey }}</span>
      <span>{{ row.conditionMatched ? 'matched' : 'skipped' }}</span>
      <span class="attempts">
        <template v-if="row.actionsAttempted.length === 0">—</template>
        <span
          v-for="a in row.actionsAttempted"
          :key="`${row.id}-${a.index}`"
          class="chip"
          :data-status="a.status"
        >
          {{ a.type }}:{{ a.status }}{{ a.idempotentReplay ? '↻' : '' }}
        </span>
      </span>
      <span class="status" :data-status="row.status">{{ row.status }}</span>
      <button
        v-if="canRetry(row.status)"
        type="button"
        class="ghost"
        :disabled="busy"
        @click="emit('retry', { runId: row.id })"
      >
        Retry
      </button>
      <span v-else />
    </div>
    <p v-if="rows.length === 0" class="empty">No runs recorded yet.</p>
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
  grid-template-columns: 1.2fr 1fr 1.2fr 0.7fr 1.4fr 0.9fr 0.6fr;
  gap: 0.55rem;
  align-items: center;
  padding: 0.75rem 1rem;
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
  font-size: 0.75rem;
}
.meta {
  margin: 0.15rem 0 0;
  color: var(--muted);
  font-size: 0.62rem;
  word-break: break-all;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.68rem;
}
.attempts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.chip {
  padding: 0.1rem 0.35rem;
  border: 1px solid var(--line);
  border-radius: 0.25rem;
  font-size: 0.62rem;
  color: var(--muted);
}
.chip[data-status='ok'],
.status[data-status='succeeded'] {
  color: var(--accent);
}
.chip[data-status='awaiting_approval'],
.status[data-status='awaiting_approval'] {
  color: #e6b84d;
}
.chip[data-status='rejected'],
.status[data-status='failed'],
.status[data-status='partial_failure'] {
  color: #e07a6a;
}
.ghost {
  justify-self: end;
  padding: 0.3rem 0.55rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: transparent;
  color: var(--fg);
  font-size: 0.65rem;
  cursor: pointer;
}
.empty {
  margin: 0;
  padding: 1.25rem 1.1rem;
  color: var(--muted);
  font-size: 0.75rem;
}
@media (max-width: 900px) {
  .head {
    display: none;
  }
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
