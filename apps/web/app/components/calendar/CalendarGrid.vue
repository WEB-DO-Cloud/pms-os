<script setup lang="ts">
import CalendarCellMenu from './CalendarCellMenu.vue'
import type {
  CellMenuAction,
  CellMenuContext,
} from './CalendarCellMenu.vue'

export type CalendarBar = {
  id: number
  propertyId: number
  propertyName: string
  roomId?: number | null
  roomLabel?: string | null
  rowKey: string
  guestName: string | null
  checkInDate: string
  checkOutDate: string
  status: string
  operationalStatus: string | null
  pendingSyncReason: string | null
  channel: string | null
}

export type CalendarRow = {
  key: string
  kind: 'property' | 'room' | 'unassigned'
  propertyId: number
  propertyName: string
  roomTypeId: number | null
  roomTypeName: string | null
  roomId: number | null
  label: string
  sortOrder: number
}

export type CalendarLayout = 'horizon' | 'month'

export type CalendarNote = {
  id: number
  propertyId: number
  date: string
  body: string
}

export type CalendarDaySummary = {
  propertyId: number
  date: string
  capacity: number
  booked: number
  pendingSync: number
  vacancy: number
  vacancySource: 'channex' | 'reservations'
  degraded: boolean
  rateMinor: number | null
  currency: string | null
  minStay: number | null
  stopSell: boolean
  closedToArrival: boolean
  closedToDeparture: boolean
  hasRoomMapping: boolean
  hasRateMapping: boolean
}

const props = defineProps<{
  bars: CalendarBar[]
  rows: CalendarRow[]
  rangeStart: string
  days: number
  layout?: CalendarLayout
  daySummaries?: CalendarDaySummary[]
  notes?: CalendarNote[]
  /** Day-cell menu actions; absent/empty = read-only shell. */
  buildActions?: (ctx: CellMenuContext) => CellMenuAction[]
}>()

const emit = defineEmits<{
  cellAction: [id: string, ctx: CellMenuContext]
}>()

const propertyNameById = computed(
  () => new Map(props.rows.map((r) => [r.propertyId, r.propertyName])),
)

const summaryByKey = computed(() => {
  const map = new Map<string, CalendarDaySummary>()
  for (const s of props.daySummaries ?? []) {
    map.set(`${s.propertyId}:${s.date}`, s)
  }
  return map
})

function summaryFor(propertyId: number, date: string) {
  return summaryByKey.value.get(`${propertyId}:${date}`) ?? null
}

function hasNote(propertyId: number, date: string) {
  return (props.notes ?? []).some(
    (n) => n.propertyId === propertyId && n.date === date,
  )
}

const menuContext = ref<CellMenuContext | null>(null)
const menuActions = ref<CellMenuAction[]>([])
let menuTrigger: HTMLElement | null = null

function openCellMenu(propertyId: number, date: string, event: Event) {
  const summary = summaryFor(propertyId, date)
  if (!summary) return
  menuTrigger = event.currentTarget as HTMLElement
  const ctx: CellMenuContext = {
    ...summary,
    propertyName:
      propertyNameById.value.get(propertyId) ?? `Property ${propertyId}`,
  }
  menuActions.value = props.buildActions?.(ctx) ?? []
  menuContext.value = ctx
}

function closeCellMenu() {
  menuContext.value = null
  menuTrigger?.focus()
  menuTrigger = null
}

function onCellAction(id: string, ctx: CellMenuContext) {
  menuContext.value = null
  menuTrigger = null
  emit('cellAction', id, ctx)
}

function shortMoney(minor: number | null, currency: string | null) {
  if (minor == null) return null
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency ?? 'USD',
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100)
}

const activeLayout = computed(() => props.layout ?? 'horizon')

const dates = computed(() => {
  const start = new Date(`${props.rangeStart}T12:00:00`)
  return Array.from({ length: props.days }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
})

const gridStyle = computed(() => ({
  gridTemplateColumns: `minmax(9rem, 13rem) repeat(${props.days}, minmax(0, 1fr))`,
}))

/** Group consecutive room rows under property / room-type headers. */
const horizonBlocks = computed(() => {
  const blocks: Array<
    | { type: 'property'; propertyId: number; name: string }
    | { type: 'roomType'; propertyId: number; name: string }
    | { type: 'row'; row: CalendarRow }
  > = []
  let lastPropertyId: number | null = null
  let lastRoomTypeId: number | null = null

  for (const row of props.rows) {
    if (row.propertyId !== lastPropertyId) {
      blocks.push({
        type: 'property',
        propertyId: row.propertyId,
        name: row.propertyName,
      })
      lastPropertyId = row.propertyId
      lastRoomTypeId = null
    }
    if (
      row.kind === 'room' &&
      row.roomTypeId != null &&
      row.roomTypeId !== lastRoomTypeId
    ) {
      blocks.push({
        type: 'roomType',
        propertyId: row.propertyId,
        name: row.roomTypeName ?? 'Rooms',
      })
      lastRoomTypeId = row.roomTypeId
    }
    blocks.push({ type: 'row', row })
  }
  return blocks
})

function overlaps(bar: CalendarBar, day: string) {
  return bar.checkInDate <= day && bar.checkOutDate > day
}

function barsForRow(rowKey: string, day: string) {
  return props.bars.filter((b) => b.rowKey === rowKey && overlaps(b, day))
}

function barsForDay(day: string) {
  return props.bars
    .filter((b) => overlaps(b, day))
    .filter((b) => props.rows.some((r) => r.key === b.rowKey))
    .sort((a, b) => a.propertyId - b.propertyId || a.id - b.id)
}

function chipMeta(bar: CalendarBar) {
  if (bar.roomLabel) return `${bar.propertyName} · ${bar.roomLabel}`
  return bar.propertyName
}

function tone(status: string) {
  if (status === 'pending_sync') return 'pending'
  if (status === 'cancelled') return 'cancelled'
  return 'confirmed'
}

function weekday(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })
}

function dayNum(iso: string) {
  return new Date(`${iso}T12:00:00`).getDate()
}

function isToday(iso: string) {
  return iso === new Date().toISOString().slice(0, 10)
}

function laneLabel(row: CalendarRow) {
  if (row.kind === 'property') return row.propertyName
  if (row.kind === 'unassigned') return row.label
  return row.label
}
</script>

<template>
  <!-- Mobile: vertical month (day rows) -->
  <div v-if="activeLayout === 'month'" class="calendar calendar-month">
    <div
      v-for="day in dates"
      :key="day"
      class="day-row"
      :class="{ today: isToday(day) }"
    >
      <div class="day-meta">
        <em>{{ weekday(day) }}</em>
        <strong>{{ dayNum(day) }}</strong>
      </div>
      <div class="day-stays">
        <NuxtLink
          v-for="bar in barsForDay(day)"
          :key="`${bar.id}-${day}`"
          class="chip"
          :class="tone(bar.status)"
          :to="`/reservations/${bar.id}`"
        >
          <span class="chip-prop">{{ chipMeta(bar) }}</span>
          <span>{{ bar.guestName ?? 'Guest' }}</span>
          <ReservationsSyncStatusBadge
            v-if="day === bar.checkInDate"
            :status="bar.status"
            :pending-sync-reason="bar.pendingSyncReason"
            compact
          />
        </NuxtLink>
        <p v-if="barsForDay(day).length === 0" class="day-empty">—</p>
        <div v-if="daySummaries?.length" class="day-summaries">
          <button
            v-for="s in (daySummaries ?? []).filter((x) => x.date === day)"
            :key="`${s.propertyId}-${day}`"
            type="button"
            class="summary-chip"
            :class="{ degraded: s.degraded }"
            :aria-label="`Day actions: ${propertyNameById.get(s.propertyId) ?? s.propertyId} ${day}`"
            @click="openCellMenu(s.propertyId, day, $event)"
          >
            <span class="chip-prop">{{ propertyNameById.get(s.propertyId) }}</span>
            <span>
              {{ s.vacancy }} open<template v-if="s.degraded">*</template>
              <template v-if="shortMoney(s.rateMinor, s.currency)">
                · {{ shortMoney(s.rateMinor, s.currency) }}
              </template>
              <template v-if="s.stopSell"> · stop sell</template>
            </span>
          </button>
        </div>
      </div>
    </div>

    <p v-if="rows.length === 0" class="empty">
      No accessible properties yet. Connect an OTA or import from Channex.
    </p>
    <p v-else-if="bars.length === 0" class="empty">
      No reservations in this month.
    </p>
  </div>

  <!-- Tablet / desktop: row × day horizon grid -->
  <div v-else class="calendar calendar-horizon">
    <div class="head" :style="gridStyle">
      <span class="corner">Inventory</span>
      <span v-for="day in dates" :key="day" class="day-head" :class="{ today: isToday(day) }">
        <em>{{ weekday(day) }}</em>
        <strong>{{ dayNum(day) }}</strong>
      </span>
    </div>

    <template v-for="(block, idx) in horizonBlocks" :key="`${block.type}-${idx}`">
      <div
        v-if="block.type === 'property'"
        class="group-head property-group"
        :style="gridStyle"
      >
        <div class="group-label">{{ block.name }}</div>
        <div v-for="day in dates" :key="day" class="group-pad">
          <template v-for="s in [summaryFor(block.propertyId, day)]" :key="`s-${day}`">
            <button
              v-if="s"
              type="button"
              class="summary-cell"
              :class="{ degraded: s.degraded }"
              :aria-label="`Day actions: ${block.name} ${day}`"
              @click="openCellMenu(block.propertyId, day, $event)"
            >
              <strong>{{ s.vacancy }}</strong>
              <span v-if="shortMoney(s.rateMinor, s.currency)" class="rate">
                {{ shortMoney(s.rateMinor, s.currency) }}
              </span>
              <span v-if="s.stopSell" class="marker" title="Stop sell">⛔</span>
              <span
                v-else-if="s.closedToArrival || s.closedToDeparture"
                class="marker"
                title="Arrival/departure restricted"
              >
                ▲
              </span>
              <span v-if="hasNote(block.propertyId, day)" class="marker" title="Note">📝</span>
            </button>
          </template>
        </div>
      </div>
      <div
        v-else-if="block.type === 'roomType'"
        class="group-head room-type-group"
        :style="gridStyle"
      >
        <div class="group-label subtle">{{ block.name }}</div>
        <div v-for="day in dates" :key="day" class="group-pad" />
      </div>
      <div
        v-else
        class="lane"
        :class="{ unassigned: block.row.kind === 'unassigned' }"
        :style="gridStyle"
      >
        <div class="prop">
          <strong>{{ laneLabel(block.row) }}</strong>
        </div>
        <div v-for="day in dates" :key="day" class="cell">
          <NuxtLink
            v-for="bar in barsForRow(block.row.key, day)"
            :key="`${bar.id}-${day}`"
            class="chip"
            :class="tone(bar.status)"
            :to="`/reservations/${bar.id}`"
          >
            <span>{{ bar.guestName ?? 'Guest' }}</span>
            <ReservationsSyncStatusBadge
              v-if="day === bar.checkInDate"
              :status="bar.status"
              :pending-sync-reason="bar.pendingSyncReason"
              compact
            />
          </NuxtLink>
        </div>
      </div>
    </template>

    <p v-if="rows.length === 0" class="empty">
      No accessible properties yet. Connect an OTA or import from Channex.
    </p>
    <p v-else-if="bars.length === 0" class="empty">
      No reservations in this range.
    </p>
  </div>

  <CalendarCellMenu
    :context="menuContext"
    :actions="menuActions"
    @close="closeCellMenu"
    @action="onCellAction"
  />
</template>

<style scoped>
.calendar {
  overflow-x: auto;
  min-height: calc(100vh - 9rem);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(13, 24, 22, 0.72);
}

.head,
.lane,
.group-head {
  display: grid;
  min-width: max(100%, 42rem);
}

.head {
  position: sticky;
  top: 0;
  z-index: 2;
  border-bottom: 1px solid var(--line);
  background: rgba(9, 19, 17, 0.96);
}

.day-head,
.corner,
.prop,
.group-label {
  padding: 0.55rem 0.5rem;
}

.day-head {
  display: grid;
  gap: 0.1rem;
  border-left: 1px solid var(--line);
  color: var(--muted);
  font-size: 0.58rem;
  text-align: center;
}

.day-head.today strong {
  color: var(--accent-strong);
}

.day-head em {
  color: var(--faint);
  font-style: normal;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.day-head strong {
  color: var(--ink);
  font-family: 'Manrope', sans-serif;
  font-size: 0.85rem;
  font-weight: 700;
}

.corner {
  color: var(--faint);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.group-head {
  border-top: 1px solid var(--line);
  background: rgba(9, 19, 17, 0.55);
}

.group-label {
  font-size: 0.72rem;
  font-weight: 700;
}

.group-label.subtle {
  color: var(--muted);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.group-pad {
  border-left: 1px solid transparent;
  display: flex;
  align-items: stretch;
}

.summary-cell {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.1rem 0.15rem;
  border: none;
  border-radius: 0.3rem;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.58rem;
  cursor: pointer;
}

.summary-cell:hover,
.summary-cell:focus-visible {
  background: rgba(101, 213, 174, 0.12);
}

.summary-cell strong {
  color: var(--accent-strong);
  font-size: 0.68rem;
}

.summary-cell.degraded strong {
  color: var(--warning);
}

.summary-cell .rate {
  color: var(--ink);
}

.summary-cell .marker {
  font-size: 0.55rem;
}

.day-summaries {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.summary-chip {
  display: grid;
  gap: 0.1rem;
  padding: 0.3rem 0.4rem;
  border: 1px dashed var(--line);
  border-radius: 0.35rem;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.62rem;
  text-align: left;
  cursor: pointer;
}

.summary-chip.degraded {
  border-color: rgba(241, 185, 111, 0.4);
}

.lane {
  border-top: 1px solid var(--line);
}

.lane.unassigned {
  background: rgba(241, 185, 111, 0.05);
}

.lane.unassigned .prop strong {
  color: var(--warning);
}

.prop {
  display: flex;
  align-items: center;
}

.prop strong {
  font-size: 0.78rem;
  line-height: 1.25;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-height: 5.25rem;
  padding: 0.3rem;
  border-left: 1px solid var(--line);
}

.chip {
  display: grid;
  gap: 0.12rem;
  padding: 0.35rem 0.4rem;
  border-radius: 0.35rem;
  background: rgba(101, 213, 174, 0.14);
  font-size: 0.62rem;
  transition: background 160ms ease;
}

.chip:hover {
  background: rgba(101, 213, 174, 0.24);
}

.chip.pending {
  background: rgba(241, 185, 111, 0.14);
}

.chip.cancelled {
  background: rgba(244, 127, 122, 0.12);
  opacity: 0.75;
}

.chip-prop {
  color: var(--faint);
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.empty {
  margin: 0;
  padding: 2rem 1.1rem;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 0.75rem;
}

.calendar-month {
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

.day-row {
  display: grid;
  grid-template-columns: 3.4rem 1fr;
  gap: 0.65rem;
  padding: 0.7rem 0.75rem;
  border-bottom: 1px solid var(--line);
}

.day-row.today {
  background: rgba(101, 213, 174, 0.06);
}

.day-meta {
  display: grid;
  align-content: start;
  gap: 0.1rem;
  text-align: center;
}

.day-meta em {
  color: var(--faint);
  font-size: 0.55rem;
  font-style: normal;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.day-meta strong {
  font-family: 'Manrope', sans-serif;
  font-size: 1.05rem;
  font-weight: 700;
}

.day-row.today .day-meta strong {
  color: var(--accent-strong);
}

.day-stays {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-height: 2.4rem;
}

.day-empty {
  margin: 0;
  color: var(--faint);
  font-size: 0.7rem;
}

@media (max-width: 980px) {
  .calendar-horizon {
    min-height: calc(100vh - 11rem);
  }
}
</style>
