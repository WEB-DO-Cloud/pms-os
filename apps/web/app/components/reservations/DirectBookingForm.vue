<script setup lang="ts">
export type DirectBookingRoomType = {
  id: number
  propertyId: number
  name: string
  channexId: string
}

export type DirectBookingRatePlan = {
  channexId: string
  propertyId: number
  title: string
  roomTypeChannexId: string | null
  currency: string | null
}

export type DirectBookingPrefill = {
  propertyId?: number
  checkInDate?: string
  checkOutDate?: string
  roomTypeId?: number
  ratePlanChannexId?: string
  /** Minor units for first night — used to seed days when empty. */
  rateMinor?: number | null
}

const props = defineProps<{
  properties: { id: number; name: string }[]
  roomTypes?: DirectBookingRoomType[]
  ratePlans?: DirectBookingRatePlan[]
  prefill?: DirectBookingPrefill | null
  /** When false, form CTA stays hidden (AE2). */
  bookingCrsEnabled?: boolean
  /** Calendar/list snapshot — required for stale-gate on create. */
  snapshotVersion?: number
  busy?: boolean
  /** Start open (calendar cell create). */
  startOpen?: boolean
}>()

const emit = defineEmits<{
  created: [payload: { id: number; status: string; pendingSyncReason: string | null }]
  error: [message: string]
  cancel: []
}>()

const { currentNetworkId } = useCurrentNetwork()

const open = ref(Boolean(props.startOpen || props.prefill))
const form = reactive({
  propertyId: props.prefill?.propertyId ?? props.properties[0]?.id ?? 0,
  guestName: '',
  checkInDate: props.prefill?.checkInDate ?? '',
  checkOutDate: props.prefill?.checkOutDate ?? '',
  adults: 2,
  roomTypeId: props.prefill?.roomTypeId ?? 0,
  ratePlanChannexId: props.prefill?.ratePlanChannexId ?? '',
  /** Single nightly rate applied across the stay (simplest CRS path). */
  nightlyRate: '',
})
const submitting = ref(false)

const propertyRoomTypes = computed(() =>
  (props.roomTypes ?? []).filter((r) => r.propertyId === form.propertyId),
)

const selectedRoomType = computed(() =>
  propertyRoomTypes.value.find((r) => r.id === form.roomTypeId),
)

const propertyRatePlans = computed(() => {
  const plans = (props.ratePlans ?? []).filter((p) => p.propertyId === form.propertyId)
  const rt = selectedRoomType.value
  if (!rt) return plans
  return plans.filter(
    (p) => !p.roomTypeChannexId || p.roomTypeChannexId === rt.channexId,
  )
})

function nextDay(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function applyPrefill(p: DirectBookingPrefill | null | undefined) {
  if (!p) return
  if (p.propertyId) form.propertyId = p.propertyId
  if (p.checkInDate) {
    form.checkInDate = p.checkInDate
    form.checkOutDate = p.checkOutDate ?? nextDay(p.checkInDate)
  }
  if (p.roomTypeId) form.roomTypeId = p.roomTypeId
  if (p.ratePlanChannexId) form.ratePlanChannexId = p.ratePlanChannexId
  if (p.rateMinor != null && !form.nightlyRate) {
    form.nightlyRate = (p.rateMinor / 100).toFixed(2)
  }
  open.value = true
}

watch(
  () => props.properties,
  (list) => {
    if (!list.some((p) => p.id === form.propertyId)) {
      form.propertyId = list[0]?.id ?? 0
    }
  },
  { immediate: true },
)

watch(
  () => props.prefill,
  (p) => applyPrefill(p),
  { immediate: true },
)

watch(
  () => form.propertyId,
  () => {
    if (!propertyRoomTypes.value.some((r) => r.id === form.roomTypeId)) {
      form.roomTypeId = propertyRoomTypes.value[0]?.id ?? 0
    }
  },
)

watch(
  [() => form.roomTypeId, propertyRatePlans],
  () => {
    if (!propertyRatePlans.value.some((p) => p.channexId === form.ratePlanChannexId)) {
      form.ratePlanChannexId = propertyRatePlans.value[0]?.channexId ?? ''
    }
  },
)

function buildDays(): Record<string, string> | null {
  if (!form.checkInDate || !form.checkOutDate || !form.nightlyRate.trim()) return null
  const price = form.nightlyRate.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(price)) return null
  const days: Record<string, string> = {}
  const cursor = new Date(`${form.checkInDate}T00:00:00Z`)
  const end = new Date(`${form.checkOutDate}T00:00:00Z`)
  while (cursor < end) {
    days[cursor.toISOString().slice(0, 10)] = price
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return Object.keys(days).length ? days : null
}

async function submit() {
  if (!props.bookingCrsEnabled) {
    emit('error', 'Booking CRS is disabled for this network')
    return
  }
  const days = buildDays()
  if (
    !form.propertyId ||
    !form.guestName.trim() ||
    !form.checkInDate ||
    !form.checkOutDate ||
    !form.roomTypeId ||
    !form.ratePlanChannexId ||
    !days
  ) {
    emit('error', 'Property, guest, stay dates, room type, rate plan, and nightly rate are required')
    return
  }
  submitting.value = true
  try {
    const res = await $fetch<{
      reservation: { id: number; status: string; pendingSyncReason: string | null }
      displayStatus: string
    }>('/api/reservations', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        propertyId: form.propertyId,
        guestName: form.guestName.trim(),
        checkInDate: form.checkInDate,
        checkOutDate: form.checkOutDate,
        adults: form.adults,
        roomTypeId: form.roomTypeId,
        ratePlanChannexId: form.ratePlanChannexId,
        days,
        baseSnapshotVersion: props.snapshotVersion ?? 0,
      },
    })
    open.value = false
    form.guestName = ''
    emit('created', {
      id: res.reservation.id,
      status: res.displayStatus,
      pendingSyncReason: res.reservation.pendingSyncReason,
    })
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    emit('error', e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Booking failed')
  } finally {
    submitting.value = false
  }
}

function toggle() {
  open.value = !open.value
  if (!open.value) emit('cancel')
}
</script>

<template>
  <div v-if="bookingCrsEnabled !== false" class="direct">
    <button
      v-if="!startOpen"
      type="button"
      class="cta"
      :disabled="busy || properties.length === 0"
      @click="toggle"
    >
      {{ open ? 'Cancel' : 'Direct booking' }}
    </button>

    <form v-if="open" class="form" @submit.prevent="submit">
      <p class="hint">
        Direct bookings stay <strong>pending sync</strong> until a Channex booking revision
        confirms them. HTTP acceptance alone does not confirm.
      </p>
      <label>
        Property
        <select v-model.number="form.propertyId" required>
          <option v-for="p in properties" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>
      <label>
        Guest name
        <input v-model="form.guestName" type="text" required autocomplete="name" />
      </label>
      <div class="dates">
        <label>
          Check-in
          <input v-model="form.checkInDate" type="date" required />
        </label>
        <label>
          Check-out
          <input v-model="form.checkOutDate" type="date" required />
        </label>
        <label>
          Adults
          <input v-model.number="form.adults" type="number" min="1" max="20" />
        </label>
      </div>
      <div class="dates">
        <label>
          Room type
          <select v-model.number="form.roomTypeId" required>
            <option v-if="!propertyRoomTypes.length" :value="0" disabled>
              No room types mapped
            </option>
            <option v-for="rt in propertyRoomTypes" :key="rt.id" :value="rt.id">
              {{ rt.name }}
            </option>
          </select>
        </label>
        <label>
          Rate plan
          <select v-model="form.ratePlanChannexId" required>
            <option v-if="!propertyRatePlans.length" value="" disabled>
              No rate plans mapped
            </option>
            <option v-for="rp in propertyRatePlans" :key="rp.channexId" :value="rp.channexId">
              {{ rp.title }}
            </option>
          </select>
        </label>
        <label>
          Nightly rate
          <input
            v-model="form.nightlyRate"
            type="text"
            inputmode="decimal"
            placeholder="100.00"
            required
          />
        </label>
      </div>
      <button type="submit" class="submit" :disabled="submitting">
        {{ submitting ? 'Queueing…' : 'Queue pending-sync booking' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.cta,
.submit {
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--accent-strong);
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 600;
}

.cta {
  padding: 0.55rem 1rem;
}

.cta:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.form {
  display: grid;
  gap: 0.85rem;
  margin-top: 1rem;
  padding: 1.1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(13, 24, 22, 0.72);
}

.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.7rem;
  line-height: 1.5;
}

.hint strong {
  color: var(--warning);
  font-weight: 600;
}

label {
  display: grid;
  gap: 0.35rem;
  color: var(--faint);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

input,
select {
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--ink);
  font-size: 0.78rem;
}

.dates {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.submit {
  justify-self: start;
  padding: 0.65rem 1.1rem;
  background: var(--accent-soft);
}

@media (max-width: 640px) {
  .dates {
    grid-template-columns: 1fr;
  }
}
</style>
