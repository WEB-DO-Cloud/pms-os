<script setup lang="ts">
import type { RuleRow } from '~/components/automation/RuleList.vue'
import type { RunRow } from '~/components/automation/RunHistory.vue'
import type { AutomationAction, AutomationTrigger } from '@pms/domain'

const { currentNetworkId, properties: shellProperties } = useCurrentNetwork()

const rules = ref<RuleRow[]>([])
const runs = ref<RunRow[]>([])
const triggers = ref<string[]>([])
const pendingApprovals = ref<
  { id: string; commandName: string; requestedByPrincipalId: string; createdAt: string }[]
>([])
const apiProperties = ref<{ id: number; name: string }[]>([])
const error = ref<string | null>(null)
const flash = ref<string | null>(null)
const loading = ref(false)

const ruleNames = computed(() => {
  const map: Record<number, string> = {}
  for (const r of rules.value) map[r.id] = r.name
  return map
})

const properties = computed(() =>
  apiProperties.value.length ? apiProperties.value : shellProperties.value,
)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{
      triggers: string[]
      rules: RuleRow[]
      runs: RunRow[]
      pendingApprovals: typeof pendingApprovals.value
    }>('/api/automation', {
      query: { networkId: currentNetworkId.value },
    })
    triggers.value = res.triggers
    rules.value = res.rules
    runs.value = res.runs
    pendingApprovals.value = res.pendingApprovals
    // Properties come from shell; optional hydrate if present later
    apiProperties.value = shellProperties.value.map((p) => ({
      id: p.id,
      name: p.name,
    }))
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load automation'
  } finally {
    loading.value = false
  }
}

async function onCreate(payload: {
  name: string
  trigger: AutomationTrigger
  propertyId: number | null
  channel: string
  actionType: AutomationAction['type']
  actionText: string
}) {
  try {
    const action: AutomationAction =
      payload.actionType === 'createTask'
        ? { type: 'createTask', title: payload.actionText, category: 'cleaning' }
        : payload.actionType === 'notifyStaff'
          ? { type: 'notifyStaff', message: payload.actionText }
          : { type: 'queueGuestMessage', body: payload.actionText, channel: 'email' }

    await $fetch('/api/automation/rules', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        name: payload.name,
        trigger: payload.trigger,
        conditions: {
          ...(payload.propertyId != null ? { propertyIds: [payload.propertyId] } : {}),
          ...(payload.channel ? { channel: payload.channel } : {}),
        },
        actions: [action],
        isActive: true,
      },
    })
    flash.value = `Rule “${payload.name}” created`
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Create failed'
  }
}

async function onToggle(payload: { ruleId: number; isActive: boolean }) {
  try {
    await $fetch(`/api/automation/rules/${payload.ruleId}`, {
      method: 'PATCH',
      body: { networkId: currentNetworkId.value, isActive: payload.isActive },
    })
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Update failed'
  }
}

async function onFire(payload: { ruleId: number }) {
  try {
    const res = await $fetch<{ runs: RunRow[] }>('/api/automation/fire', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        type: rules.value.find((r) => r.id === payload.ruleId)?.trigger ?? 'booking_created',
        eventKey: `manual-${Date.now()}`,
        propertyId: properties.value[0]?.id,
        dryRun: true,
        ruleId: payload.ruleId,
      },
    })
    flash.value = `Dry-run finished (${res.runs[0]?.status ?? 'n/a'})`
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Fire failed'
  }
}

async function onRetry(payload: { runId: number }) {
  try {
    await $fetch(`/api/automation/runs/${payload.runId}/retry`, {
      method: 'POST',
      body: { networkId: currentNetworkId.value },
    })
    flash.value = `Retry queued for run #${payload.runId}`
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Retry failed'
  }
}

async function onApprove(approvalId: string) {
  try {
    await $fetch(`/api/automation/approvals/${approvalId}/approve`, {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        propertyId: properties.value[0]?.id,
      },
    })
    flash.value = `Approved ${approvalId}`
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Approve failed'
  }
}

onMounted(load)
watch(currentNetworkId, () => {
  void load()
})
</script>

<template>
  <div class="page-shell">
    <header class="head">
      <div>
        <p class="eyebrow">Deterministic workflows</p>
        <h1>Automation</h1>
        <p class="page-intro">
          Rules fire domain commands (create task, notify staff, queue guest messages). High-risk
          actions wait for approval. LLM/MCP deferred.
        </p>
      </div>
    </header>

    <div class="section-rule" />

    <p v-if="flash" class="flash">{{ flash }}</p>
    <p v-if="error" class="error">{{ error }}</p>

    <AutomationRuleEditor
      :triggers="triggers.length ? triggers : ['booking_created']"
      :properties="properties"
      :busy="loading"
      @create="onCreate"
    />

    <section class="block">
      <h2>Rules</h2>
      <AutomationRuleList
        :rows="rules"
        :busy="loading"
        @toggle="onToggle"
        @fire="onFire"
      />
    </section>

    <section v-if="pendingApprovals.length" class="block">
      <h2>Awaiting approval</h2>
      <ul class="approvals">
        <li v-for="a in pendingApprovals" :key="a.id">
          <div>
            <strong>{{ a.commandName }}</strong>
            <p class="meta">{{ a.id }} · {{ a.requestedByPrincipalId }}</p>
          </div>
          <button type="button" :disabled="loading" @click="onApprove(a.id)">Approve</button>
        </li>
      </ul>
    </section>

    <section class="block">
      <h2>Run history</h2>
      <AutomationRunHistory
        :rows="runs"
        :rule-names="ruleNames"
        :busy="loading"
        @retry="onRetry"
      />
    </section>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}
.block {
  margin-top: 1.5rem;
}
.block h2 {
  margin: 0 0 0.65rem;
  font-size: 0.85rem;
}
.flash {
  color: var(--accent);
  font-size: 0.75rem;
}
.error {
  color: #e07a6a;
  font-size: 0.75rem;
}
.approvals {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
}
.approvals li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  padding: 0.85rem 1.1rem;
  border-top: 1px solid var(--line);
  font-size: 0.8rem;
}
.approvals li:first-child {
  border-top: 0;
}
.meta {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: 0.68rem;
}
.approvals button {
  padding: 0.4rem 0.75rem;
  border: 0;
  border-radius: var(--radius);
  background: var(--accent);
  color: #06241c;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
}
</style>
