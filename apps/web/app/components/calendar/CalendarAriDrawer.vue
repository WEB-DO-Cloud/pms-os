<script setup lang="ts">
import type { CellMenuContext } from '~/components/calendar/CalendarCellMenu.vue'

export type AriDrawerTab = 'availability' | 'price' | 'restrictions'

export type AriDrawerRatePlan = {
  channexId: string
  title: string
  roomTypeChannexId: string | null
  currency: string | null
  rateMode?: string | null
  parentRatePlanChannexId?: string | null
}

export type AriDrawerRoomType = {
  id: number
  name: string
  channexId: string
}

const props = defineProps<{
  open: boolean
  context: CellMenuContext | null
  networkId: number
  snapshotVersion: number
  roomType: AriDrawerRoomType | null
  ratePlans: AriDrawerRatePlan[]
  availabilityWrite: boolean
  rateRestrictionWrite: boolean
  derivedRateWrite: boolean
}>()

const emit = defineEmits<{
  close: []
  saved: [message: string]
  stale: []
}>()

const tab = ref<AriDrawerTab>('availability')
const busy = ref(false)
const error = ref<string | null>(null)
const panel = ref<HTMLElement | null>(null)

const dateFrom = ref('')
const dateTo = ref('')
const availability = ref(0)
const selectedPlanId = ref('')
const rateMajor = ref('')
const minStayArrival = ref(1)
const minStayThrough = ref(1)
const maxStay = ref(0)
const closedToArrival = ref(false)
const closedToDeparture = ref(false)
const stopSell = ref(false)
const derivedPercent = ref('10')
const derivedOp = ref<'increase_by_percent' | 'decrease_by_percent'>(
  'increase_by_percent',
)
const derivedOccupancy = ref(2)

const selectedPlan = computed(() =>
  props.ratePlans.find((p) => p.channexId === selectedPlanId.value) ?? null,
)

const nightlyEditable = computed(() => {
  const plan = selectedPlan.value
  if (!plan || !props.rateRestrictionWrite) return false
  return (
    (plan.rateMode ?? 'manual') === 'manual' &&
    plan.parentRatePlanChannexId == null
  )
})

const derivedEditable = computed(() => {
  const plan = selectedPlan.value
  return (
    Boolean(props.derivedRateWrite) &&
    plan != null &&
    (plan.rateMode ?? '') === 'derived'
  )
})

watch(
  () => props.open,
  (open) => {
    if (!open || !props.context) return
    error.value = null
    dateFrom.value = props.context.date
    dateTo.value = props.context.date
    availability.value = props.context.vacancy
    rateMajor.value =
      props.context.rateMinor != null
        ? (props.context.rateMinor / 100).toFixed(2)
        : ''
    minStayArrival.value = props.context.minStay ?? 1
    stopSell.value = props.context.stopSell
    closedToArrival.value = props.context.closedToArrival
    closedToDeparture.value = props.context.closedToDeparture
    const first =
      props.ratePlans.find(
        (p) =>
          (p.rateMode ?? 'manual') === 'manual' &&
          p.parentRatePlanChannexId == null,
      ) ?? props.ratePlans[0]
    selectedPlanId.value = first?.channexId ?? ''
    tab.value = props.availabilityWrite
      ? 'availability'
      : props.rateRestrictionWrite
        ? 'price'
        : 'restrictions'
    nextTick(() => panel.value?.focus())
  },
)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
}

function parseRateMinor(): number | null {
  const n = Number.parseFloat(rateMajor.value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

async function submitAvailability() {
  if (!props.context || !props.roomType || busy.value) return
  busy.value = true
  error.value = null
  try {
    await $fetch('/api/calendar/availability', {
      method: 'POST',
      body: {
        networkId: props.networkId,
        propertyId: props.context.propertyId,
        roomTypeId: props.roomType.id,
        dateFrom: dateFrom.value,
        dateTo: dateTo.value,
        availability: availability.value,
        baseSnapshotVersion: props.snapshotVersion,
      },
    })
    emit('saved', `Availability queued for ${dateFrom.value}→${dateTo.value}`)
    emit('close')
  } catch (err) {
    handleWriteError(err)
  } finally {
    busy.value = false
  }
}

async function submitPrice() {
  if (!props.context || !selectedPlanId.value || busy.value) return
  if (!nightlyEditable.value) {
    error.value = 'Nightly edits require a parent/manual rate plan'
    return
  }
  const rateMinor = parseRateMinor()
  if (rateMinor == null) {
    error.value = 'Enter a positive nightly rate'
    return
  }
  busy.value = true
  error.value = null
  try {
    await $fetch('/api/calendar/restrictions', {
      method: 'POST',
      body: {
        networkId: props.networkId,
        propertyId: props.context.propertyId,
        ratePlanChannexId: selectedPlanId.value,
        dateFrom: dateFrom.value,
        dateTo: dateTo.value,
        fields: { rateMinor },
        baseSnapshotVersion: props.snapshotVersion,
      },
    })
    emit('saved', `Nightly rate queued for ${selectedPlan.value?.title ?? 'plan'}`)
    emit('close')
  } catch (err) {
    handleWriteError(err)
  } finally {
    busy.value = false
  }
}

async function submitRestrictions() {
  if (!props.context || !selectedPlanId.value || busy.value) return
  busy.value = true
  error.value = null
  try {
    await $fetch('/api/calendar/restrictions', {
      method: 'POST',
      body: {
        networkId: props.networkId,
        propertyId: props.context.propertyId,
        ratePlanChannexId: selectedPlanId.value,
        dateFrom: dateFrom.value,
        dateTo: dateTo.value,
        fields: {
          minStayArrival: minStayArrival.value,
          minStayThrough: minStayThrough.value,
          maxStay: maxStay.value,
          closedToArrival: closedToArrival.value,
          closedToDeparture: closedToDeparture.value,
          stopSell: stopSell.value,
        },
        baseSnapshotVersion: props.snapshotVersion,
      },
    })
    emit('saved', `Restrictions queued for ${selectedPlan.value?.title ?? 'plan'}`)
    emit('close')
  } catch (err) {
    handleWriteError(err)
  } finally {
    busy.value = false
  }
}

async function submitDerived() {
  if (!props.context || !selectedPlanId.value || busy.value) return
  if (!derivedEditable.value) {
    error.value = 'Derived modifier edits require rate_mode=derived'
    return
  }
  busy.value = true
  error.value = null
  try {
    await $fetch('/api/calendar/derived-modifier', {
      method: 'POST',
      body: {
        networkId: props.networkId,
        propertyId: props.context.propertyId,
        ratePlanChannexId: selectedPlanId.value,
        occupancy: derivedOccupancy.value,
        isPrimary: true,
        derivedOption: {
          rate: [[derivedOp.value, derivedPercent.value]],
        },
        baseSnapshotVersion: props.snapshotVersion,
      },
    })
    emit('saved', 'Derived modifier queued')
    emit('close')
  } catch (err) {
    handleWriteError(err)
  } finally {
    busy.value = false
  }
}

function handleWriteError(err: unknown) {
  const e = err as {
    data?: { statusMessage?: string; data?: { error?: { code?: string } } }
    statusMessage?: string
    statusCode?: number
  }
  if (e?.data?.data?.error?.code === 'STALE_SNAPSHOT' || e?.statusCode === 409) {
    error.value = 'Snapshot changed — refresh and retry'
    emit('stale')
    return
  }
  error.value =
    e?.data?.statusMessage ?? e?.statusMessage ?? 'ARI write failed'
}

async function openChannelSession() {
  if (!props.context) return
  try {
    const res = await $fetch<{ url: string }>('/api/channex/channel-session', {
      method: 'POST',
      body: {
        networkId: props.networkId,
        propertyId: props.context.propertyId,
      },
    })
    if (res.url) window.open(res.url, '_blank', 'noopener')
  } catch {
    error.value = 'Could not open Channex channel session'
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open && context" class="drawer-backdrop" @click.self="emit('close')">
      <aside
        ref="panel"
        class="drawer"
        role="dialog"
        aria-modal="true"
        :aria-label="`Edit ARI — ${context.propertyName}`"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <header>
          <div>
            <h2>Edit ARI</h2>
            <p class="sub">{{ context.propertyName }} · {{ context.date }}</p>
          </div>
          <button type="button" class="close" aria-label="Close" @click="emit('close')">
            ×
          </button>
        </header>

        <div class="tabs" role="tablist" aria-label="ARI editor sections">
          <button
            v-if="availabilityWrite"
            type="button"
            role="tab"
            :aria-selected="tab === 'availability'"
            :class="{ active: tab === 'availability' }"
            @click="tab = 'availability'"
          >
            Availability
          </button>
          <button
            v-if="rateRestrictionWrite || derivedRateWrite"
            type="button"
            role="tab"
            :aria-selected="tab === 'price'"
            :class="{ active: tab === 'price' }"
            @click="tab = 'price'"
          >
            Price
          </button>
          <button
            v-if="rateRestrictionWrite"
            type="button"
            role="tab"
            :aria-selected="tab === 'restrictions'"
            :class="{ active: tab === 'restrictions' }"
            @click="tab = 'restrictions'"
          >
            Restrictions
          </button>
        </div>

        <p v-if="error" class="error" role="alert">{{ error }}</p>

        <div class="range">
          <label>
            From
            <input v-model="dateFrom" type="date" />
          </label>
          <label>
            To
            <input v-model="dateTo" type="date" />
          </label>
        </div>

        <section v-if="tab === 'availability'" class="panel">
          <p class="hint">
            Absolute room-type availability for
            {{ roomType?.name ?? 'mapped room type' }}.
          </p>
          <label>
            Desired availability
            <input v-model.number="availability" type="number" min="0" step="1" />
          </label>
          <button type="button" :disabled="busy || !roomType" @click="submitAvailability">
            {{ busy ? 'Saving…' : 'Queue availability' }}
          </button>
        </section>

        <section v-else-if="tab === 'price'" class="panel">
          <label>
            Rate plan
            <select v-model="selectedPlanId">
              <option
                v-for="plan in ratePlans"
                :key="plan.channexId"
                :value="plan.channexId"
              >
                {{ plan.title }}
                <template v-if="plan.rateMode"> ({{ plan.rateMode }})</template>
              </option>
            </select>
          </label>

          <template v-if="nightlyEditable">
            <label>
              Nightly rate ({{ selectedPlan?.currency ?? context.currency ?? 'USD' }})
              <input v-model="rateMajor" type="text" inputmode="decimal" />
            </label>
            <button type="button" :disabled="busy" @click="submitPrice">
              {{ busy ? 'Saving…' : 'Queue nightly rate' }}
            </button>
          </template>
          <template v-else-if="derivedEditable">
            <p class="hint">
              Inherited child nightly prices are read-only. Edit the Channex derived
              modifier instead.
            </p>
            <label>
              Occupancy
              <input v-model.number="derivedOccupancy" type="number" min="1" step="1" />
            </label>
            <label>
              Modifier
              <select v-model="derivedOp">
                <option value="increase_by_percent">Increase by %</option>
                <option value="decrease_by_percent">Decrease by %</option>
              </select>
            </label>
            <label>
              Value
              <input v-model="derivedPercent" type="text" inputmode="decimal" />
            </label>
            <button type="button" :disabled="busy" @click="submitDerived">
              {{ busy ? 'Saving…' : 'Queue derived modifier' }}
            </button>
          </template>
          <p v-else class="hint">
            Nightly editing disabled for this plan mode. Channel mappings stay in Channex.
          </p>

          <button type="button" class="linkish" @click="openChannelSession">
            Open Channex channel mapping
          </button>
        </section>

        <section v-else class="panel">
          <label>
            Rate plan
            <select v-model="selectedPlanId">
              <option
                v-for="plan in ratePlans"
                :key="plan.channexId"
                :value="plan.channexId"
              >
                {{ plan.title }}
              </option>
            </select>
          </label>
          <label>
            Min stay arrival
            <input v-model.number="minStayArrival" type="number" min="0" step="1" />
          </label>
          <label>
            Min stay through
            <input v-model.number="minStayThrough" type="number" min="0" step="1" />
          </label>
          <label>
            Max stay (0 = unlimited)
            <input v-model.number="maxStay" type="number" min="0" step="1" />
          </label>
          <label class="check">
            <input v-model="closedToArrival" type="checkbox" />
            Closed to arrival
          </label>
          <label class="check">
            <input v-model="closedToDeparture" type="checkbox" />
            Closed to departure
          </label>
          <label class="check">
            <input v-model="stopSell" type="checkbox" />
            Stop sell
          </label>
          <button type="button" :disabled="busy || !selectedPlanId" @click="submitRestrictions">
            {{ busy ? 'Saving…' : 'Queue restrictions' }}
          </button>
        </section>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
}
.drawer {
  width: min(420px, 100vw);
  height: 100%;
  overflow: auto;
  background: var(--surface, #0d1816);
  border-left: 1px solid var(--line, #24332f);
  padding: 1rem 1.1rem 2rem;
  color: inherit;
  outline: none;
}
header {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
  margin-bottom: 0.85rem;
}
h2 {
  margin: 0;
  font-size: 1rem;
}
.sub {
  margin: 0.25rem 0 0;
  color: var(--muted);
  font-size: 0.72rem;
}
.close {
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 1.4rem;
  cursor: pointer;
  line-height: 1;
}
.tabs {
  display: flex;
  gap: 0.35rem;
  margin-bottom: 0.85rem;
  flex-wrap: wrap;
}
.tabs button {
  padding: 0.4rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  background: transparent;
  color: var(--muted);
  font-size: 0.7rem;
  cursor: pointer;
}
.tabs button.active {
  color: var(--accent-strong, #65d5ae);
  border-color: rgba(101, 213, 174, 0.45);
}
.range,
.panel {
  display: grid;
  gap: 0.65rem;
}
.range {
  grid-template-columns: 1fr 1fr;
  margin-bottom: 0.85rem;
}
label {
  display: grid;
  gap: 0.25rem;
  font-size: 0.7rem;
  color: var(--muted);
}
label.check {
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.45rem;
}
input,
select {
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  background: rgba(0, 0, 0, 0.25);
  color: inherit;
  font-size: 0.78rem;
}
.panel > button {
  margin-top: 0.25rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid rgba(101, 213, 174, 0.45);
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--accent-strong, #65d5ae);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}
.panel > button:disabled {
  opacity: 0.5;
  cursor: default;
}
.linkish {
  border: none !important;
  background: transparent !important;
  color: var(--muted) !important;
  text-decoration: underline;
  font-weight: 500 !important;
  justify-self: start;
  padding: 0 !important;
}
.hint {
  margin: 0;
  font-size: 0.7rem;
  color: var(--muted);
}
.error {
  margin: 0 0 0.75rem;
  color: #f0a8a8;
  font-size: 0.72rem;
}
</style>
