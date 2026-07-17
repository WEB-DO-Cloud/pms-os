<script setup lang="ts">
import type { TaskRow } from '~/components/tasks/TaskTable.vue'

const { currentNetworkId, properties: shellProperties } = useCurrentNetwork()

const propertyFilter = ref<number | 'all'>('all')
const statusFilter = ref('all')
const rows = ref<TaskRow[]>([])
const apiProperties = ref<{ id: number; name: string }[]>([])
const error = ref<string | null>(null)
const flash = ref<string | null>(null)
const loading = ref(false)
const { enabled, disabledHint } = useAiStatus()
const aiBusy = ref(false)
const aiError = ref<string | null>(null)
const scheduleFrom = ref(new Date().toISOString().slice(0, 10))
const scheduleTo = ref(
  new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
)
const proposalId = ref<string | null>(null)
const proposed = ref<
  {
    propertyId: number
    reservationId?: number | null
    title: string
    category: string
    dueHint?: string | null
    rationale: string
    selected: boolean
  }[]
>([])

const propertyNames = computed(() => {
  const map: Record<number, string> = {}
  for (const p of apiProperties.value.length ? apiProperties.value : shellProperties.value) {
    map[p.id] = p.name
  }
  return map
})

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{
      properties: { id: number; name: string }[]
      tasks: TaskRow[]
    }>('/api/tasks', {
      query: {
        networkId: currentNetworkId.value,
        ...(propertyFilter.value === 'all' ? {} : { propertyId: propertyFilter.value }),
        ...(statusFilter.value === 'all' ? {} : { status: statusFilter.value }),
      },
    })
    apiProperties.value = res.properties
    rows.value = res.tasks
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load tasks'
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function onStatus(payload: { taskId: number; propertyId: number; status: string }) {
  try {
    await $fetch(`/api/tasks/${payload.taskId}/status`, {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        propertyId: payload.propertyId,
        status: payload.status,
      },
    })
    flash.value = `Task #${payload.taskId} → ${payload.status}`
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Status update failed'
  }
}

async function proposeSchedule() {
  aiBusy.value = true
  aiError.value = null
  try {
    const res = await $fetch<{
      proposal: { id: string }
      tasks: {
        propertyId: number
        reservationId?: number | null
        title: string
        category: string
        dueHint?: string | null
        rationale: string
      }[]
    }>('/api/ai/ops/schedule', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        from: scheduleFrom.value,
        to: scheduleTo.value,
        ...(propertyFilter.value === 'all' ? {} : { propertyId: propertyFilter.value }),
      },
    })
    proposalId.value = res.proposal.id
    proposed.value = res.tasks.map((t) => ({ ...t, selected: true }))
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    aiError.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Schedule propose failed'
    proposed.value = []
    proposalId.value = null
  } finally {
    aiBusy.value = false
  }
}

async function approveSelected() {
  if (!proposalId.value) return
  const indexes = proposed.value
    .map((t, i) => (t.selected ? i : -1))
    .filter((i) => i >= 0)
  if (!indexes.length) {
    aiError.value = 'Select at least one task'
    return
  }
  aiBusy.value = true
  aiError.value = null
  try {
    const res = await $fetch<{ tasks: unknown[] }>('/api/ai/ops/schedule/approve', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        proposalId: proposalId.value,
        indexes,
      },
    })
    flash.value = `Created ${res.tasks.length} task(s) from AI schedule`
    proposed.value = []
    proposalId.value = null
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    aiError.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Approve failed'
  } finally {
    aiBusy.value = false
  }
}

onMounted(load)
watch([currentNetworkId, propertyFilter, statusFilter], () => {
  void load()
})
</script>

<template>
  <div class="page-shell">
    <header class="head">
      <div>
        <p class="eyebrow">Daily operations</p>
        <h1>Tasks</h1>
        <p class="page-intro">
          Housekeeping, maintenance, and inspection work scoped by property. Housekeeping only
          sees assigned tasks.
        </p>
      </div>
    </header>

    <div class="section-rule" />

    <AiPanel
      title="Ops / HK schedule"
      subtitle="Grok proposes cleaning and maintenance from check-outs. Approve to create real tasks."
      :disabled-hint="disabledHint"
    >
      <div class="ai-filters">
        <label>
          From
          <input v-model="scheduleFrom" type="date" />
        </label>
        <label>
          To
          <input v-model="scheduleTo" type="date" />
        </label>
        <button type="button" :disabled="!enabled || aiBusy" @click="proposeSchedule">
          {{ aiBusy ? 'Working…' : 'Propose schedule' }}
        </button>
      </div>
      <p v-if="aiError" class="gate" role="alert">{{ aiError }}</p>
      <ul v-if="proposed.length" class="proposed">
        <li v-for="(t, i) in proposed" :key="i">
          <label class="check">
            <input v-model="t.selected" type="checkbox" />
            <span>
              <strong>{{ t.title }}</strong>
              · {{ t.category }} · prop {{ t.propertyId }}
              <em>{{ t.rationale }}</em>
            </span>
          </label>
        </li>
      </ul>
      <button
        v-if="proposed.length"
        type="button"
        :disabled="aiBusy"
        @click="approveSelected"
      >
        Approve selected → create tasks
      </button>
    </AiPanel>

    <div class="toolbar">
      <div class="filters">
        <label>
          Property
          <select v-model="propertyFilter">
            <option value="all">All accessible</option>
            <option
              v-for="p in apiProperties.length ? apiProperties : shellProperties"
              :key="p.id"
              :value="p.id"
            >
              {{ p.name }}
            </option>
          </select>
        </label>
        <label>
          Status
          <select v-model="statusFilter">
            <option value="all">All</option>
            <option value="todo">Todo</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>
      <TasksCreateTaskForm
        :properties="apiProperties.length ? apiProperties : shellProperties.map((p) => ({ id: p.id, name: p.name }))"
        :busy="loading"
        @created="() => { flash = 'Task created'; void load() }"
        @error="(msg) => (error = msg)"
      />
    </div>

    <p v-if="flash" class="flash" role="status">{{ flash }}</p>
    <p v-if="error" class="gate" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading tasks…</p>

    <TasksTaskTable
      :rows="rows"
      :property-names="propertyNames"
      :busy="loading"
      @status="onStatus"
    />
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1.5rem;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  justify-content: space-between;
  gap: 1.25rem;
  margin-bottom: 1.25rem;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
}
label {
  display: grid;
  gap: 0.3rem;
  color: var(--faint);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
select {
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--ink);
  font-size: 0.72rem;
}
.flash {
  margin: 0 0 0.85rem;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(241, 185, 111, 0.35);
  border-radius: var(--radius);
  background: rgba(241, 185, 111, 0.08);
  color: var(--warning);
  font-size: 0.72rem;
}
.gate {
  margin: 0 0 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(244, 127, 122, 0.35);
  border-radius: var(--radius);
  color: var(--danger);
  font-size: 0.72rem;
}
.muted {
  margin: 0 0 0.85rem;
  color: var(--muted);
  font-size: 0.66rem;
}
.ai-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: end;
  margin-bottom: 0.75rem;
}
.ai-filters input {
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--ink);
  font-size: 0.72rem;
}
.proposed {
  margin: 0 0 0.75rem;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.45rem;
}
.check {
  display: flex;
  gap: 0.55rem;
  align-items: start;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
  color: var(--ink);
  font-size: 0.72rem;
}
.check em {
  display: block;
  color: var(--muted);
  font-style: normal;
  font-size: 0.66rem;
}
button {
  padding: 0.45rem 0.7rem;
  border: 1px solid rgba(101, 213, 174, 0.45);
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--accent-strong);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
