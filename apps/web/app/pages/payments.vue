<script setup lang="ts">
import type { LedgerRow } from '~/components/payments/LedgerTable.vue'

const { currentNetworkId, properties: shellProperties } = useCurrentNetwork()

const propertyFilter = ref<number | 'all'>('all')
const rows = ref<LedgerRow[]>([])
const reservations = ref<
  Array<{ id: number; propertyId: number; guestName: string | null; currency: string }>
>([])
const apiProperties = ref<{ id: number; name: string }[]>([])
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
      ledger: LedgerRow[]
      reservations: Array<{
        id: number
        propertyId: number
        guestName: string | null
        currency: string
      }>
    }>('/api/payments', {
      query: {
        networkId: currentNetworkId.value,
        ...(propertyFilter.value === 'all' ? {} : { propertyId: propertyFilter.value }),
      },
    })
    apiProperties.value = res.properties
    rows.value = res.ledger
    reservations.value = res.reservations
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load payments'
    rows.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([currentNetworkId, propertyFilter], () => {
  void load()
})
</script>

<template>
  <div class="page-shell">
    <header class="head">
      <div>
        <p class="eyebrow">Reservation ledger</p>
        <h1>Payments</h1>
        <p class="page-intro">
          Inspect payment, refund, invoice, and receipt events. Channex collection metadata is
          shown alongside ledger rows — this is not a payment gateway.
        </p>
      </div>
    </header>

    <div class="section-rule" />

    <div class="toolbar">
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
      <PaymentsRecordPaymentForm
        :reservations="reservations"
        :busy="loading"
        @recorded="() => { flash = 'Ledger event recorded (no card capture).'; void load() }"
        @error="(msg) => (error = msg)"
      />
    </div>

    <p v-if="flash" class="flash" role="status">{{ flash }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading" class="muted">Loading ledger…</p>

    <PaymentsLedgerTable :rows="rows" :property-names="propertyNames" />
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}
label {
  display: grid;
  gap: 0.3rem;
  color: var(--muted);
  font-size: 0.66rem;
}
select {
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  background: var(--surface);
  color: var(--ink);
  font-size: 0.72rem;
}
.flash {
  margin: 0 0 0.75rem;
  color: var(--accent);
  font-size: 0.72rem;
}
.error {
  margin: 0 0 0.75rem;
  color: #f0a8a8;
  font-size: 0.75rem;
}
.muted {
  margin: 0 0 0.75rem;
  color: var(--muted);
  font-size: 0.72rem;
}
</style>
