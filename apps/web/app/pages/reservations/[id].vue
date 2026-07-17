<script setup lang="ts">
type DetailPayload = {
  reservation: {
    id: number
    propertyId: number
    guestName: string | null
    guestEmail?: string | null
    checkInDate: string
    checkOutDate: string
    status: string
    pendingSyncReason: string | null
    channel?: string | null
    currency: string
    paymentCollect?: string | null
    paymentType?: string | null
    totalAmountMinor?: number | null
    staffNotes: string | null
    operationalStatus?: string | null
    checkedInAt?: string | null
    checkedOutAt?: string | null
    channexBookingId: string | null
    adults?: number
    children?: number
    infants?: number
  }
  revisions: Array<{
    id: number
    channexRevisionId: string
    status: string
    appliedAt: string
  }>
  ledger: Array<{
    id: number
    type: string
    amountMinor: number
    currency: string
    note: string | null
  }>
  audit: Array<{
    id: number
    action: string
    createdAt: string
  }>
  sync: {
    status: string
    pendingSyncReason: string | null
    isPendingSync: boolean
  }
}

const route = useRoute()
const { currentNetworkId, properties } = useCurrentNetwork()

const id = computed(() => Number(route.params.id))
const detail = ref<DetailPayload | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)

const propertyName = computed(() => {
  const pid = detail.value?.reservation?.propertyId
  if (pid == null) return 'Property'
  return properties.value.find((p) => p.id === pid)?.name ?? `Property ${pid}`
})

async function load() {
  if (!Number.isFinite(id.value) || id.value < 1) {
    error.value = 'Invalid reservation id'
    return
  }
  loading.value = true
  error.value = null
  try {
    detail.value = await $fetch<DetailPayload>(`/api/reservations/${id.value}`, {
      query: { networkId: currentNetworkId.value },
    })
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load reservation'
    detail.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([id, currentNetworkId], () => {
  void load()
})
</script>

<template>
  <div class="page-shell">
    <p class="back">
      <NuxtLink to="/reservations">← Reservations</NuxtLink>
    </p>
    <p v-if="error" class="gate" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading reservation…</p>
    <ReservationsReservationDetail
      v-else-if="detail"
      :detail="detail"
      :property-name="propertyName"
      :network-id="currentNetworkId"
      @refreshed="load"
      @error="(msg) => (error = msg)"
    />
  </div>
</template>

<style scoped>
.back {
  margin: 0 0 1.25rem;
}

.back a {
  color: var(--muted);
  font-size: 0.72rem;
}

.gate {
  padding: 0.75rem 1rem;
  border: 1px solid rgba(244, 127, 122, 0.35);
  border-radius: var(--radius);
  color: var(--danger);
  font-size: 0.72rem;
}

.muted {
  color: var(--muted);
  font-size: 0.72rem;
}
</style>
