<script setup lang="ts">
import type { RatePlanRow } from '~/components/rates/RatePlanTable.vue'

type PricingSuggestion = {
  propertyId: number
  ratePlanId: string
  dateFrom: string
  dateTo: string
  amountMinor: number
  currency?: string
  rationale: string
  confidence: number
}

const { currentNetworkId } = useCurrentNetwork()
const { enabled, disabledHint, refresh: refreshAi } = useAiStatus()

const plans = ref<RatePlanRow[]>([])
const freshness = ref<{
  status: string
  lastPullAt: string | null
  updatedAt: string
  stale: boolean
  staleReason: string | null
} | null>(null)
const meta = ref({
  managedInChannex: true,
  readOnly: true,
  ariWriteEnabled: false,
  rateRestrictionWrite: false,
  derivedRateWrite: false,
  aiApply: false,
})
const error = ref<string | null>(null)
const loading = ref(false)

const aiBusy = ref(false)
const aiError = ref<string | null>(null)
const aiFlash = ref<string | null>(null)
const proposalId = ref<string | null>(null)
const suggestions = ref<PricingSuggestion[]>([])
const selectedIndexes = ref<number[]>([])

const canApplyAi = computed(
  () => meta.value.aiApply && meta.value.rateRestrictionWrite,
)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{
      plans: RatePlanRow[]
      freshness: typeof freshness.value
      managedInChannex: boolean
      readOnly: boolean
      ariWriteEnabled: boolean
      rateRestrictionWrite?: boolean
      derivedRateWrite?: boolean
      aiApply?: boolean
    }>('/api/rates', {
      query: { networkId: currentNetworkId.value },
    })
    plans.value = res.plans
    freshness.value = res.freshness
    meta.value = {
      managedInChannex: res.managedInChannex,
      readOnly: res.readOnly,
      ariWriteEnabled: res.ariWriteEnabled,
      rateRestrictionWrite: Boolean(res.rateRestrictionWrite),
      derivedRateWrite: Boolean(res.derivedRateWrite),
      aiApply: Boolean(res.aiApply),
    }
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load rates'
    plans.value = []
  } finally {
    loading.value = false
  }
}

async function suggestYield() {
  aiBusy.value = true
  aiError.value = null
  aiFlash.value = null
  try {
    const res = await $fetch<{
      proposal: { id: string }
      suggestions: PricingSuggestion[]
      note: string
    }>('/api/ai/pricing/suggest', {
      method: 'POST',
      body: { networkId: currentNetworkId.value },
    })
    proposalId.value = res.proposal.id
    suggestions.value = res.suggestions
    selectedIndexes.value = res.suggestions.map((_, i) => i)
    aiFlash.value = res.note
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    aiError.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Yield suggest failed'
  } finally {
    aiBusy.value = false
  }
}

function toggleRow(index: number, checked: boolean) {
  if (checked) {
    if (!selectedIndexes.value.includes(index)) {
      selectedIndexes.value = [...selectedIndexes.value, index].sort((a, b) => a - b)
    }
  } else {
    selectedIndexes.value = selectedIndexes.value.filter((i) => i !== index)
  }
}

async function acceptLocal() {
  if (!proposalId.value) return
  aiBusy.value = true
  aiError.value = null
  try {
    const res = await $fetch<{ note: string }>('/api/ai/pricing/' + proposalId.value + '/accept', {
      method: 'POST',
      body: { networkId: currentNetworkId.value },
    })
    aiFlash.value = res.note
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    aiError.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Accept failed'
  } finally {
    aiBusy.value = false
  }
}

async function approveSelected() {
  if (!proposalId.value) return
  aiBusy.value = true
  aiError.value = null
  try {
    const res = await $fetch<{ note: string }>('/api/ai/pricing/' + proposalId.value + '/accept', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        indexes: selectedIndexes.value,
      },
    })
    aiFlash.value = res.note
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    aiError.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Approve failed'
  } finally {
    aiBusy.value = false
  }
}

async function dismiss() {
  if (!proposalId.value) return
  aiBusy.value = true
  try {
    await $fetch('/api/ai/pricing/' + proposalId.value + '/dismiss', {
      method: 'POST',
      body: { networkId: currentNetworkId.value },
    })
    suggestions.value = []
    proposalId.value = null
    selectedIndexes.value = []
    aiFlash.value = 'Suggestions dismissed'
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    aiError.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Dismiss failed'
  } finally {
    aiBusy.value = false
  }
}

function money(minor: number) {
  return (minor / 100).toFixed(2)
}

onMounted(() => {
  void load()
  void refreshAi()
})
watch(currentNetworkId, () => {
  void load()
  suggestions.value = []
  proposalId.value = null
  selectedIndexes.value = []
})
</script>

<template>
  <div class="page-shell">
    <header class="head">
      <div>
        <p class="eyebrow">Channex managed</p>
        <h1>Rates</h1>
        <p class="page-intro">
          Rate and restriction context from the cached Channex ARI snapshot. Nightly
          edits apply only to parent/manual plans; channel mappings stay in Channex.
        </p>
      </div>
    </header>

    <div class="section-rule" />

    <p class="banner" role="status">
      Managed in Channex
      <template v-if="meta.readOnly"> · read-only</template>
      <template v-else> · write capabilities enabled</template>
      <template v-if="!meta.ariWriteEnabled"> · ARI write disabled</template>
      <template v-else-if="meta.rateRestrictionWrite"> · rates/restrictions</template>
      <template v-if="meta.derivedRateWrite"> · derived modifiers</template>
      <template v-if="meta.aiApply"> · AI apply</template>
    </p>

    <p v-if="freshness" class="freshness" :class="{ stale: freshness.stale }">
      Sync {{ freshness.status }}
      <template v-if="freshness.lastPullAt"> · pull {{ freshness.lastPullAt }}</template>
      <template v-if="freshness.stale">
        · stale{{ freshness.staleReason ? ` (${freshness.staleReason.replace(/_/g, ' ')})` : '' }}
      </template>
    </p>

    <AiPanel
      title="Yield suggestions"
      :subtitle="
        canApplyAi
          ? 'Grok drafts rate ideas from occupancy and cached plans. Generation never writes; approve selected rows to enqueue the same rate commands as the manual editor.'
          : 'Grok drafts local rate ideas from occupancy and cached plans. Never pushes to Channex.'
      "
      :disabled-hint="disabledHint"
    >
      <template #actions>
        <button type="button" :disabled="!enabled || aiBusy" @click="suggestYield">
          {{ aiBusy ? 'Working…' : 'Suggest rates' }}
        </button>
      </template>
      <p v-if="aiError" class="error" role="alert">{{ aiError }}</p>
      <p v-if="aiFlash" class="flash" role="status">{{ aiFlash }}</p>
      <ul v-if="suggestions.length" class="suggestions">
        <li v-for="(s, i) in suggestions" :key="i">
          <label v-if="canApplyAi" class="row-select">
            <input
              type="checkbox"
              :checked="selectedIndexes.includes(i)"
              :disabled="aiBusy"
              @change="toggleRow(i, ($event.target as HTMLInputElement).checked)"
            />
            <span class="sr-only">Select suggestion {{ i + 1 }}</span>
          </label>
          <strong>{{ money(s.amountMinor) }}</strong>
          <span>
            prop {{ s.propertyId }} · {{ s.ratePlanId }} · {{ s.dateFrom }}→{{ s.dateTo }}
          </span>
          <em>{{ s.rationale }} ({{ Math.round(s.confidence * 100) }}%)</em>
        </li>
      </ul>
      <div v-if="suggestions.length" class="row-actions">
        <button
          v-if="canApplyAi"
          type="button"
          :disabled="aiBusy"
          @click="approveSelected"
        >
          Approve selected ({{ selectedIndexes.length }})
        </button>
        <button
          v-else
          type="button"
          :disabled="aiBusy"
          @click="acceptLocal"
        >
          Accept as local draft
        </button>
        <button type="button" class="muted-btn" :disabled="aiBusy" @click="dismiss">
          Dismiss
        </button>
      </div>
    </AiPanel>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading" class="muted">Loading rates…</p>

    <RatesRatePlanTable :rows="plans" />
  </div>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}
.banner {
  margin: 0 0 0.75rem;
  padding: 0.65rem 0.9rem;
  border: 1px solid rgba(101, 213, 174, 0.35);
  border-radius: var(--radius);
  background: rgba(101, 213, 174, 0.08);
  color: var(--accent);
  font-size: 0.72rem;
}
.freshness,
.muted {
  margin: 0 0 1rem;
  color: var(--muted);
  font-size: 0.72rem;
}
.freshness.stale {
  color: #e8b86d;
}
.error {
  margin: 0 0 1rem;
  color: #f0a8a8;
  font-size: 0.75rem;
}
.flash {
  margin: 0 0 0.65rem;
  color: var(--warning);
  font-size: 0.7rem;
}
.suggestions {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.55rem;
}
.suggestions li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.65rem;
  align-items: flex-start;
  font-size: 0.72rem;
}
.suggestions li > strong,
.suggestions li > span,
.suggestions li > em {
  flex: 1 1 100%;
}
.suggestions .row-select {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  padding-top: 0.1rem;
}
.suggestions .row-select + strong {
  flex: 1 1 calc(100% - 2rem);
}
.suggestions em {
  color: var(--muted);
  font-style: normal;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
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
.muted-btn {
  color: var(--muted);
  border-color: var(--line);
}
</style>
