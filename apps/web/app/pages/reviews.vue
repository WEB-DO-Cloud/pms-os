<script setup lang="ts">
import type { ReviewRow } from '~/components/reviews/ReviewTable.vue'

const { currentNetworkId, properties: shellProperties } = useCurrentNetwork()

const propertyFilter = ref<number | 'all'>('all')
const statusFilter = ref('all')
const rows = ref<ReviewRow[]>([])
const apiProperties = ref<{ id: number; name: string }[]>([])
const analytics = ref<{ count: number; pending: number; avgRating: number | null } | null>(null)
const selected = ref<ReviewRow | null>(null)
const responseTemplate = ref('')
const error = ref<string | null>(null)
const flash = ref<string | null>(null)
const loading = ref(false)

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
      reviews: ReviewRow[]
      analytics: { count: number; pending: number; avgRating: number | null }
    }>('/api/reviews', {
      query: {
        networkId: currentNetworkId.value,
        ...(propertyFilter.value === 'all' ? {} : { propertyId: propertyFilter.value }),
        ...(statusFilter.value === 'all' ? {} : { status: statusFilter.value }),
      },
    })
    apiProperties.value = res.properties
    rows.value = res.reviews
    analytics.value = res.analytics
    if (selected.value) {
      selected.value = rows.value.find((r) => r.id === selected.value!.id) ?? null
    }
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load reviews'
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function importFixtures() {
  try {
    const propertyId =
      propertyFilter.value === 'all'
        ? (apiProperties.value[0]?.id ?? shellProperties.value[0]?.id)
        : propertyFilter.value
    await $fetch('/api/reviews/sync', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        propertyId,
        seed: true,
      },
    })
    flash.value = 'Imported fixture reviews (Channex sync stub)'
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Import failed'
  }
}

function onSelect(id: number) {
  selected.value = rows.value.find((r) => r.id === id) ?? null
  responseTemplate.value = selected.value?.responseTemplate ?? ''
}

async function markResponded() {
  if (!selected.value) return
  try {
    await $fetch(`/api/reviews/${selected.value.id}/status`, {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        propertyId: selected.value.propertyId,
        status: 'responded',
        responseTemplate: responseTemplate.value,
      },
    })
    flash.value = 'Review marked responded (local only — no channel write-back)'
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Update failed'
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
        <p class="eyebrow">Reputation</p>
        <h1>Reviews</h1>
        <p class="page-intro">
          Local review triage and template responses. Channel write-back is not promised in v1.
        </p>
      </div>
      <button type="button" class="import" :disabled="loading" @click="importFixtures">
        Import fixtures
      </button>
    </header>

    <div class="section-rule" />

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
            <option value="pending">Pending</option>
            <option value="responded">Responded</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </label>
      </div>
      <p v-if="analytics" class="analytics">
        {{ analytics.count }} reviews · {{ analytics.pending }} pending · avg
        {{ analytics.avgRating ?? '—' }}
      </p>
    </div>

    <p v-if="flash" class="flash" role="status">{{ flash }}</p>
    <p v-if="error" class="gate" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading reviews…</p>

    <div class="layout">
      <ReviewsReviewTable
        :rows="rows"
        :property-names="propertyNames"
        :selected-id="selected?.id ?? null"
        @select="onSelect"
      />

      <aside v-if="selected" class="detail">
        <h2>{{ selected.title ?? 'Review' }}</h2>
        <p class="muted">{{ selected.guestName }} · {{ selected.rating ?? '—' }}/5 · {{ selected.source }}</p>
        <p class="comment">{{ selected.comment }}</p>
        <label>
          Response template
          <textarea v-model="responseTemplate" rows="4" />
        </label>
        <button type="button" @click="markResponded">Mark responded</button>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1.5rem;
}
.import,
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
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
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
select,
textarea {
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--ink);
  font-size: 0.72rem;
}
.analytics {
  margin: 0;
  color: var(--muted);
  font-size: 0.66rem;
}
.layout {
  display: grid;
  grid-template-columns: 1.2fr 0.9fr;
  gap: 1.25rem;
  align-items: start;
}
.detail {
  padding: 1.1rem 1.2rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(13, 24, 22, 0.72);
}
.detail h2 {
  margin: 0 0 0.35rem;
  font-size: 0.95rem;
}
.comment {
  margin: 0.75rem 0;
  color: var(--ink);
  font-size: 0.78rem;
  line-height: 1.45;
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
@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
