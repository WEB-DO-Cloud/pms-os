<script setup lang="ts">
import type { ReportSummaryView } from '~/components/reports/ReportSummary.vue'
import type { OwnerPropertyRow } from '~/components/owner/OwnerPortfolio.vue'
import type { OwnerBookingRow } from '~/components/owner/OwnerBookingTable.vue'

const { currentNetworkId, principal } = useCurrentNetwork()

const from = ref('2026-07-01')
const to = ref('2026-07-31')
const properties = ref<OwnerPropertyRow[]>([])
const bookings = ref<OwnerBookingRow[]>([])
const summary = ref<ReportSummaryView | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)

const propertyNames = computed(() =>
  Object.fromEntries(properties.value.map((p) => [p.id, p.name])),
)

const isOwner = computed(() => principal.value?.role === 'property_owner')

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{
      properties: OwnerPropertyRow[]
      bookings: OwnerBookingRow[]
      summary: ReportSummaryView
      readOnly: boolean
    }>('/api/owner', {
      query: {
        networkId: currentNetworkId.value,
        from: from.value,
        to: to.value,
      },
    })
    properties.value = res.properties
    bookings.value = res.bookings
    summary.value = res.summary
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load owner portal'
    properties.value = []
    bookings.value = []
    summary.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([currentNetworkId, from, to], () => {
  void load()
})
</script>

<template>
  <div class="page-shell">
    <header class="head">
      <div>
        <p class="eyebrow">Owner portal</p>
        <h1>Portfolio overview</h1>
        <p class="page-intro">
          Read-only occupancy, bookings, and gross revenue for properties assigned to you.
        </p>
      </div>
    </header>

    <div class="section-rule" />

    <p v-if="!isOwner" class="gate" role="status">
      Signed in as staff preview — owner APIs still enforce property_owner scope server-side.
    </p>

    <div class="toolbar">
      <label>
        From
        <input v-model="from" type="date" />
      </label>
      <label>
        To
        <input v-model="to" type="date" />
      </label>
    </div>

    <p v-if="error" class="gate failed" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading portfolio…</p>

    <template v-else>
      <OwnerPortfolio :properties="properties" />
      <ReportsReportSummary :summary="summary" />
      <OwnerBookingTable :bookings="bookings" :property-names="propertyNames" />
    </template>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-end;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  margin-bottom: 1.25rem;
}
label {
  display: grid;
  gap: 0.3rem;
  font-size: 0.72rem;
  color: var(--muted);
}
input {
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  color: var(--ink);
  background: var(--surface);
  font: inherit;
}
.gate {
  margin: 0 0 1rem;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 0.75rem;
  background: var(--surface);
}
.gate.failed {
  color: var(--danger);
}
.muted {
  color: var(--muted);
  font-size: 0.78rem;
}
</style>
