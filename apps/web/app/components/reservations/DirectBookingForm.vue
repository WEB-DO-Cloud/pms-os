<script setup lang="ts">
const props = defineProps<{
  properties: { id: number; name: string }[]
  busy?: boolean
}>()

const emit = defineEmits<{
  created: [payload: { id: number; status: string; pendingSyncReason: string | null }]
  error: [message: string]
}>()

const { currentNetworkId } = useCurrentNetwork()

const open = ref(false)
const form = reactive({
  propertyId: props.properties[0]?.id ?? 0,
  guestName: '',
  checkInDate: '',
  checkOutDate: '',
  adults: 2,
})
const submitting = ref(false)

watch(
  () => props.properties,
  (list) => {
    if (!list.some((p) => p.id === form.propertyId)) {
      form.propertyId = list[0]?.id ?? 0
    }
  },
  { immediate: true },
)

async function submit() {
  if (!form.propertyId || !form.guestName.trim() || !form.checkInDate || !form.checkOutDate) {
    emit('error', 'Property, guest, and stay dates are required')
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
</script>

<template>
  <div class="direct">
    <button type="button" class="cta" :disabled="busy || properties.length === 0" @click="open = !open">
      {{ open ? 'Cancel' : 'Direct booking' }}
    </button>

    <form v-if="open" class="form" @submit.prevent="submit">
      <p class="hint">
        Direct bookings stay <strong>pending sync</strong> until Channex accepts the write-back.
        They never appear as confirmed beforehand.
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
