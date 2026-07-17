<script setup lang="ts">
import CalendarGrid from '~/components/calendar/CalendarGrid.vue'
import type {
  CalendarBar,
  CalendarLayout,
  CalendarRow,
} from '~/components/calendar/CalendarGrid.vue'

const { currentNetworkId, properties: shellProperties } = useCurrentNetwork()

/** Large desktop ≥1280 → 31 days; tablet/small desktop → 14; mobile ≤760 → month. */
type RangeMode = 'month' | 14 | 31

const rangeMode = ref<RangeMode>(14)
const rangeStart = ref(new Date().toISOString().slice(0, 10))
const propertyFilter = ref<number | 'all'>('all')
const bars = ref<CalendarBar[]>([])
const rows = ref<CalendarRow[]>([])
const apiProperties = ref<{ id: number; name: string }[]>([])
const error = ref<string | null>(null)
const loading = ref(false)

const layout = computed<CalendarLayout>(() =>
  rangeMode.value === 'month' ? 'month' : 'horizon',
)

const days = computed(() => {
  if (rangeMode.value === 'month') {
    const d = new Date(`${rangeStart.value}T12:00:00`)
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  }
  return rangeMode.value
})

const rangeEnd = computed(() => {
  const d = new Date(`${rangeStart.value}T12:00:00`)
  d.setDate(d.getDate() + days.value)
  return d.toISOString().slice(0, 10)
})

const monthLabel = computed(() =>
  new Date(`${rangeStart.value}T12:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  }),
)

function startOfMonthIso(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function applyViewportMode() {
  if (!import.meta.client) return
  const w = window.innerWidth
  const next: RangeMode = w <= 760 ? 'month' : w < 1280 ? 14 : 31
  if (next === rangeMode.value) return
  rangeMode.value = next
  if (next === 'month') {
    rangeStart.value = startOfMonthIso(rangeStart.value)
  }
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{
      properties: { id: number; name: string }[]
      rows: CalendarRow[]
      bars: CalendarBar[]
    }>('/api/reservations', {
      query: {
        networkId: currentNetworkId.value,
        view: 'calendar',
        from: rangeStart.value,
        to: rangeEnd.value,
        ...(propertyFilter.value === 'all' ? {} : { propertyId: propertyFilter.value }),
      },
    })
    apiProperties.value = res.properties
    rows.value = res.rows
    bars.value = res.bars
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load calendar'
    bars.value = []
    rows.value = []
  } finally {
    loading.value = false
  }
}

function shift(delta: number) {
  const d = new Date(`${rangeStart.value}T12:00:00`)
  if (rangeMode.value === 'month') {
    d.setMonth(d.getMonth() + (delta < 0 ? -1 : 1), 1)
  } else {
    d.setDate(d.getDate() + delta)
  }
  rangeStart.value = d.toISOString().slice(0, 10)
}

function goToday() {
  const today = new Date().toISOString().slice(0, 10)
  rangeStart.value =
    rangeMode.value === 'month' ? startOfMonthIso(today) : today
}

const shiftStep = computed(() =>
  rangeMode.value === 'month' ? 1 : rangeMode.value,
)

let cleanupViewport: (() => void) | undefined

onMounted(() => {
  applyViewportMode()
  window.addEventListener('resize', applyViewportMode)
  cleanupViewport = () => window.removeEventListener('resize', applyViewportMode)
  void load()
})

onUnmounted(() => cleanupViewport?.())

watch([currentNetworkId, rangeStart, propertyFilter, days], () => {
  if (!import.meta.client) return
  void load()
})
</script>

<template>
  <div class="page-shell calendar-page">
    <header class="toolbar">
      <div class="title-block">
        <h1>Calendar</h1>
        <p v-if="layout === 'month'" class="month-label">{{ monthLabel }}</p>
        <p v-else class="range-label">{{ days }}-day view</p>
      </div>
      <div class="controls">
        <div class="nav" role="group" aria-label="Date range">
          <button type="button" :aria-label="layout === 'month' ? 'Previous month' : 'Previous range'" @click="shift(-shiftStep)">
            ←
          </button>
          <button type="button" class="today" @click="goToday">Today</button>
          <input
            v-if="layout !== 'month'"
            v-model="rangeStart"
            type="date"
            aria-label="Range start"
          />
          <button type="button" :aria-label="layout === 'month' ? 'Next month' : 'Next range'" @click="shift(shiftStep)">
            →
          </button>
        </div>
        <label class="property-filter">
          <span class="sr-only">Property</span>
          <select v-model="propertyFilter" aria-label="Property">
            <option value="all">All properties</option>
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
    </header>

    <p v-if="error" class="gate" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading…</p>

    <CalendarGrid
      :bars="bars"
      :rows="rows"
      :range-start="rangeStart"
      :days="days"
      :layout="layout"
    />
  </div>
</template>

<style scoped>
.calendar-page {
  width: min(100%, 100%);
  max-width: none;
  padding-top: 1.25rem;
  padding-bottom: 1.5rem;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem 1.25rem;
  margin-bottom: 1rem;
}

.title-block h1 {
  font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  letter-spacing: -0.03em;
}

.month-label,
.range-label {
  margin: 0.2rem 0 0;
  color: var(--muted);
  font-size: 0.72rem;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
}

.nav {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

button,
select,
input {
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 0.78rem;
}

button {
  cursor: pointer;
  color: var(--accent-strong);
  font-weight: 600;
}

button.today {
  color: var(--ink);
}

.muted {
  margin: 0 0 0.75rem;
  color: var(--muted);
  font-size: 0.72rem;
}

.gate {
  margin: 0 0 0.85rem;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(244, 127, 122, 0.35);
  border-radius: var(--radius);
  color: var(--danger);
  font-size: 0.72rem;
}

@media (max-width: 760px) {
  .toolbar {
    align-items: stretch;
  }

  .controls {
    width: 100%;
  }

  .nav {
    flex: 1;
  }

  .property-filter {
    flex: 1;
  }

  .property-filter select {
    width: 100%;
  }
}
</style>
