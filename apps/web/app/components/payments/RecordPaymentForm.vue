<script setup lang="ts">
import type { LedgerType } from '@pms/domain'

const props = defineProps<{
  reservations: Array<{
    id: number
    propertyId: number
    guestName: string | null
    currency: string
  }>
  busy?: boolean
}>()

const emit = defineEmits<{
  recorded: []
  error: [message: string]
}>()

const { currentNetworkId } = useCurrentNetwork()

const reservationId = ref<number | ''>('')
const type = ref<LedgerType>('payment')
const amount = ref('100.00')
const note = ref('')
const submitting = ref(false)

const selected = computed(() =>
  props.reservations.find((r) => r.id === reservationId.value),
)

async function submit() {
  if (!selected.value) {
    emit('error', 'Select a reservation')
    return
  }
  const parts = amount.value.trim().split('.')
  const whole = Number(parts[0] || '0')
  const frac = Number((parts[1] || '0').padEnd(2, '0').slice(0, 2))
  if (!Number.isFinite(whole) || !Number.isFinite(frac) || whole < 0) {
    emit('error', 'Invalid amount')
    return
  }
  const amountMinor = whole * 100 + frac
  if (amountMinor <= 0) {
    emit('error', 'Amount must be positive')
    return
  }

  submitting.value = true
  try {
    await $fetch('/api/payments', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        reservationId: selected.value.id,
        propertyId: selected.value.propertyId,
        type: type.value,
        amountMinor,
        currency: selected.value.currency,
        note: note.value.trim() || undefined,
      },
    })
    note.value = ''
    emit('recorded')
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    emit('error', e?.data?.statusMessage ?? e?.statusMessage ?? 'Ledger write failed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="form" @submit.prevent="submit">
    <p class="eyebrow">Record ledger event</p>
    <label>
      Reservation
      <select v-model="reservationId" required>
        <option disabled value="">Select…</option>
        <option v-for="r in reservations" :key="r.id" :value="r.id">
          #{{ r.id }} · {{ r.guestName ?? 'Guest' }}
        </option>
      </select>
    </label>
    <label>
      Type
      <select v-model="type">
        <option value="payment">Payment</option>
        <option value="refund">Refund</option>
        <option value="invoice">Invoice</option>
        <option value="receipt">Receipt</option>
        <option value="charge">Charge</option>
        <option value="adjustment">Adjustment</option>
      </select>
    </label>
    <label>
      Amount
      <input v-model="amount" type="text" inputmode="decimal" required />
    </label>
    <label>
      Note
      <input v-model="note" type="text" placeholder="Optional" />
    </label>
    <button type="submit" :disabled="busy || submitting || !reservationId">
      Append to ledger
    </button>
    <p class="hint">Does not charge a card — append-only accounting event only.</p>
  </form>
</template>

<style scoped>
.form {
  display: grid;
  gap: 0.65rem;
  min-width: min(18rem, 100%);
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(13, 24, 22, 0.55);
}
.eyebrow {
  margin: 0;
  color: var(--accent);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
label {
  display: grid;
  gap: 0.3rem;
  color: var(--muted);
  font-size: 0.66rem;
}
select,
input {
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  background: var(--surface);
  color: var(--ink);
  font-size: 0.72rem;
}
button {
  margin-top: 0.25rem;
  padding: 0.5rem 0.75rem;
  border: 0;
  border-radius: 0.4rem;
  background: var(--accent);
  color: #04110e;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hint {
  margin: 0;
  color: var(--faint);
  font-size: 0.62rem;
  line-height: 1.45;
}
</style>
