<script setup lang="ts">
import type { ReportSummaryView } from '~/components/reports/ReportSummary.vue'

const { currentNetworkId, properties: shellProperties } = useCurrentNetwork()

const from = ref('2026-07-01')
const to = ref('2026-07-31')
const propertyFilter = ref<number | 'all'>('all')
const summary = ref<ReportSummaryView | null>(null)
const freshness = ref<{
  status: string
  stale: boolean
  staleReason: string | null
  lastPullAt: string | null
} | null>(null)
const apiProperties = ref<{ id: number; name: string }[]>([])
const error = ref<string | null>(null)
const loading = ref(false)

const { enabled, disabledHint } = useAiStatus()
const aiBusy = ref(false)
const aiError = ref<string | null>(null)
const forecast = ref<{
  horizonDays: number
  occupancyPct: number
  revenueMinor: number
  narrative: string
  risks: string[]
} | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{
      report: ReportSummaryView & {
        freshness: NonNullable<typeof freshness.value>
        byProperty: ReportSummaryView['byProperty']
      }
    }>('/api/reports', {
      query: {
        networkId: currentNetworkId.value,
        from: from.value,
        to: to.value,
        ...(propertyFilter.value === 'all' ? {} : { propertyId: propertyFilter.value }),
      },
    })
    summary.value = res.report
    freshness.value = res.report.freshness
    apiProperties.value = res.report.byProperty.map((p) => ({
      id: p.propertyId,
      name: p.propertyName,
    }))
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load reports'
    summary.value = null
  } finally {
    loading.value = false
  }
}

async function runForecast() {
  aiBusy.value = true
  aiError.value = null
  try {
    const res = await $fetch<{
      forecast: NonNullable<typeof forecast.value>
      freshness: { stale: boolean; staleReason: string | null }
    }>('/api/ai/forecast', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        from: from.value,
        to: to.value,
        ...(propertyFilter.value === 'all' ? {} : { propertyId: propertyFilter.value }),
        horizonDays: 30,
      },
    })
    forecast.value = res.forecast
    if (res.freshness.stale) {
      aiError.value = `Sync data may be stale${
        res.freshness.staleReason ? ` (${res.freshness.staleReason.replace(/_/g, ' ')})` : ''
      }`
    }
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    aiError.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Forecast failed'
    forecast.value = null
  } finally {
    aiBusy.value = false
  }
}

onMounted(load)
watch([currentNetworkId, from, to, propertyFilter], () => {
  void load()
  forecast.value = null
})
</script>

<template>
  <div class="page-shell">
    <header class="head">
      <div>
        <p class="eyebrow">Performance</p>
        <h1>Reports</h1>
        <p class="page-intro">
          Occupancy, revenue, ADR, and RevPAR from local reservation projections within your
          property scope.
        </p>
      </div>
    </header>

    <div class="section-rule" />

    <div class="toolbar">
      <label>
        From
        <input v-model="from" type="date" />
      </label>
      <label>
        To
        <input v-model="to" type="date" />
      </label>
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
    </div>

    <p v-if="freshness" class="freshness" :class="{ stale: freshness.stale }">
      Sync {{ freshness.status }}
      <template v-if="freshness.lastPullAt"> · pull {{ freshness.lastPullAt }}</template>
      <template v-if="freshness.stale">
        · stale data{{ freshness.staleReason ? ` (${freshness.staleReason.replace(/_/g, ' ')})` : '' }}
      </template>
    </p>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading" class="muted">Calculating…</p>

    <AiPanel
      title="AI outlook"
      subtitle="Grok forecast from local occupancy and revenue — advisory only."
      :disabled-hint="disabledHint"
    >
      <template #actions>
        <button type="button" :disabled="!enabled || aiBusy" @click="runForecast">
          {{ aiBusy ? 'Working…' : 'Generate outlook' }}
        </button>
      </template>
      <p v-if="aiError" class="error" role="alert">{{ aiError }}</p>
      <div v-if="forecast" class="outlook">
        <p>
          <strong>{{ forecast.horizonDays }}d</strong>
          · occ {{ forecast.occupancyPct.toFixed(1) }}%
          · rev {{ (forecast.revenueMinor / 100).toFixed(0) }}
        </p>
        <p class="narrative">{{ forecast.narrative }}</p>
        <ul v-if="forecast.risks.length">
          <li v-for="(r, i) in forecast.risks" :key="i">{{ r }}</li>
        </ul>
      </div>
    </AiPanel>

    <ReportsReportSummary :summary="summary" />
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  margin-bottom: 1rem;
}
label {
  display: grid;
  gap: 0.3rem;
  color: var(--muted);
  font-size: 0.66rem;
}
input,
select {
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  background: var(--surface);
  color: var(--ink);
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
.outlook {
  display: grid;
  gap: 0.45rem;
  font-size: 0.72rem;
}
.narrative {
  margin: 0;
  color: var(--muted);
}
.outlook ul {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--warning);
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
