<script setup lang="ts">
import type { ReservationRow } from '~/components/reservations/ReservationTable.vue'

const { currentNetworkId, properties: shellProperties } = useCurrentNetwork()

const propertyFilter = ref<number | 'all'>('all')
const statusFilter = ref<string>('all')
const rows = ref<ReservationRow[]>([])
const apiProperties = ref<{ id: number; name: string }[]>([])
const freshness = ref<{ status: string; updatedAt: string } | null>(null)
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
      reservations: ReservationRow[]
      freshness: { status: string; updatedAt: string }
    }>('/api/reservations', {
      query: {
        networkId: currentNetworkId.value,
        ...(propertyFilter.value === 'all' ? {} : { propertyId: propertyFilter.value }),
        ...(statusFilter.value === 'all' ? {} : { status: statusFilter.value }),
      },
    })
    apiProperties.value = res.properties
    rows.value = res.reservations
    freshness.value = res.freshness
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load reservations'
    rows.value = []
  } finally {
    loading.value = false
  }
}

function onCreated(payload: { id: number; status: string; pendingSyncReason: string | null }) {
  flash.value =
    payload.status === 'pending_sync'
      ? `Direct booking #${payload.id} queued as pending sync${payload.pendingSyncReason ? ` (${payload.pendingSyncReason})` : ''}.`
      : `Booking #${payload.id} synced as ${payload.status}.`
  void load()
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
        <p class="eyebrow">Booking desk</p>
        <h1>Reservations</h1>
        <p class="page-intro">
          Synced Channex bookings and direct intents, always with visible sync status.
        </p>
      </div>
      <NuxtLink class="link" to="/calendar">Calendar →</NuxtLink>
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
          Sync status
          <select v-model="statusFilter">
            <option value="all">All</option>
            <option value="pending_sync">Pending sync</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>
      <ReservationsDirectBookingForm
        :properties="apiProperties.length ? apiProperties : shellProperties.map((p) => ({ id: p.id, name: p.name }))"
        :busy="loading"
        @created="onCreated"
        @error="(msg) => (error = msg)"
      />
    </div>

    <p v-if="flash" class="flash" role="status">{{ flash }}</p>
    <p v-if="error" class="gate" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading reservations…</p>
    <p v-if="freshness" class="muted">Data freshness · {{ freshness.status }} · {{ freshness.updatedAt }}</p>

    <ReservationsReservationTable :rows="rows" :property-names="propertyNames" />
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1.5rem;
}

.link {
  color: var(--accent-strong);
  font-size: 0.72rem;
  font-weight: 600;
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

@media (max-width: 760px) {
  .head {
    display: block;
  }

  .link {
    display: inline-block;
    margin-top: 1rem;
  }
}
</style>
