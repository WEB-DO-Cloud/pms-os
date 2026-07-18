<script setup lang="ts">
import CalendarGrid from '~/components/calendar/CalendarGrid.vue'
import type {
  CalendarBar,
  CalendarDaySummary,
  CalendarLayout,
  CalendarNote,
  CalendarRow,
} from '~/components/calendar/CalendarGrid.vue'
import type {
  CellMenuAction,
  CellMenuContext,
} from '~/components/calendar/CalendarCellMenu.vue'

const { currentNetworkId, properties: shellProperties } = useCurrentNetwork()

/** Large desktop ≥1280 → 31 days; tablet/small desktop → 14; mobile ≤760 → month. */
type RangeMode = 'month' | 14 | 31

const rangeMode = ref<RangeMode>(14)
const rangeStart = ref(new Date().toISOString().slice(0, 10))
const propertyFilter = ref<number | 'all'>('all')
const bars = ref<CalendarBar[]>([])
const rows = ref<CalendarRow[]>([])
const daySummaries = ref<CalendarDaySummary[]>([])
const notes = ref<CalendarNote[]>([])
const flash = ref<string | null>(null)
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
      days: CalendarDaySummary[]
      notes: CalendarNote[]
      roomTypes?: { id: number; propertyId: number; name: string; channexId: string }[]
      ratePlans?: {
        channexId: string
        propertyId: number
        title: string
        roomTypeChannexId: string | null
        currency: string | null
      }[]
      capabilities?: { bookingCrsWrite: boolean; availabilityWrite?: boolean }
      snapshotVersion?: number
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
    daySummaries.value = res.days ?? []
    notes.value = res.notes ?? []
    catalogRoomTypes.value = res.roomTypes ?? []
    catalogRatePlans.value = res.ratePlans ?? []
    bookingCrsWrite.value = Boolean(res.capabilities?.bookingCrsWrite)
    availabilityWrite.value = Boolean(res.capabilities?.availabilityWrite)
    snapshotVersion.value = res.snapshotVersion ?? 0
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load calendar'
    bars.value = []
    rows.value = []
    daySummaries.value = []
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

/** Day-cell actions (U4): PMS-owned tasks and notes; no Channex coupling. */
type DayDialog = {
  kind: 'task' | 'note'
  ctx: CellMenuContext
  /** Set when editing an existing note. */
  noteId?: number
}

const dayDialog = ref<DayDialog | null>(null)
const dayText = ref('')
const dayBusy = ref(false)
const dayError = ref<string | null>(null)
const bookingCrsWrite = ref(false)
const availabilityWrite = ref(false)
const snapshotVersion = ref(0)
const catalogRoomTypes = ref<
  { id: number; propertyId: number; name: string; channexId: string }[]
>([])
const catalogRatePlans = ref<
  {
    channexId: string
    propertyId: number
    title: string
    roomTypeChannexId: string | null
    currency: string | null
  }[]
>([])
const bookingPrefill = ref<{
  propertyId: number
  checkInDate: string
  rateMinor: number | null
} | null>(null)
const availabilityBusy = ref(false)

function notesFor(ctx: CellMenuContext) {
  return notes.value.filter(
    (n) => n.propertyId === ctx.propertyId && n.date === ctx.date,
  )
}

function primaryRoomType(propertyId: number) {
  return catalogRoomTypes.value.find((rt) => rt.propertyId === propertyId) ?? null
}

function buildCellActions(ctx: CellMenuContext): CellMenuAction[] {
  const count = notesFor(ctx).length
  const actions: CellMenuAction[] = [
    { id: 'task', label: 'Add task on this date' },
    { id: 'note', label: count ? `Notes (${count})` : 'Add note' },
  ]
  // AE2: hide create when Booking CRS capability is off.
  if (bookingCrsWrite.value) {
    const disabled = !ctx.hasRoomMapping || !ctx.hasRateMapping
    actions.unshift({
      id: 'direct_booking',
      label: 'Create direct booking',
      disabled,
      hint: disabled
        ? 'Room type or rate plan mapping is missing for this property'
        : undefined,
    })
  }
  // U6: hide close/open when availabilityWrite is off (manager+ also gated server-side).
  if (availabilityWrite.value) {
    const roomType = primaryRoomType(ctx.propertyId)
    const disabled = !roomType || !ctx.hasRoomMapping || ctx.degraded
    actions.push(
      {
        id: 'close_availability',
        label: 'Close availability',
        disabled,
        hint: disabled
          ? ctx.degraded
            ? 'Refresh Channex availability before writing'
            : 'Room type mapping is missing for this property'
          : undefined,
      },
      {
        id: 'open_availability',
        label: 'Open availability',
        disabled,
        hint: disabled
          ? ctx.degraded
            ? 'Refresh Channex availability before writing'
            : 'Room type mapping is missing for this property'
          : undefined,
      },
    )
  }
  return actions
}

function onCellAction(id: string, ctx: CellMenuContext) {
  if (id === 'direct_booking') {
    bookingPrefill.value = {
      propertyId: ctx.propertyId,
      checkInDate: ctx.date,
      rateMinor: ctx.rateMinor,
    }
    return
  }
  if (id === 'close_availability' || id === 'open_availability') {
    void submitAvailability(id === 'close_availability' ? 0 : ctx.capacity, ctx)
    return
  }
  if (id !== 'task' && id !== 'note') return
  dayDialog.value = { kind: id, ctx }
  dayText.value = ''
  dayError.value = null
}

async function submitAvailability(availability: number, ctx: CellMenuContext) {
  const roomType = primaryRoomType(ctx.propertyId)
  if (!roomType || availabilityBusy.value) return
  availabilityBusy.value = true
  error.value = null
  try {
    await $fetch('/api/calendar/availability', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        propertyId: ctx.propertyId,
        roomTypeId: roomType.id,
        dateFrom: ctx.date,
        dateTo: ctx.date,
        availability,
        baseSnapshotVersion: snapshotVersion.value,
      },
    })
    flash.value =
      availability === 0
        ? `Availability closed for ${ctx.date} — pending sync`
        : `Availability opened (${availability}) for ${ctx.date} — pending sync`
    await load()
  } catch (err: unknown) {
    const e = err as {
      data?: { statusMessage?: string; data?: { error?: { code?: string } } }
      statusMessage?: string
      statusCode?: number
    }
    if (e?.data?.data?.error?.code === 'STALE_SNAPSHOT' || e?.statusCode === 409) {
      flash.value = null
      error.value = 'Calendar changed — refreshed. Retry the availability write.'
      await load()
    } else {
      error.value =
        e?.data?.statusMessage ?? e?.statusMessage ?? 'Availability write failed'
    }
  } finally {
    availabilityBusy.value = false
  }
}

function startNoteEdit(note: CalendarNote) {
  if (!dayDialog.value) return
  dayDialog.value = { ...dayDialog.value, noteId: note.id }
  dayText.value = note.body
}

async function submitDayDialog() {
  const dialog = dayDialog.value
  if (!dialog || !dayText.value.trim()) return
  dayBusy.value = true
  dayError.value = null
  try {
    if (dialog.kind === 'task') {
      await $fetch('/api/tasks', {
        method: 'POST',
        body: {
          networkId: currentNetworkId.value,
          title: dayText.value.trim(),
          propertyId: dialog.ctx.propertyId,
          dueDate: dialog.ctx.date,
        },
      })
      flash.value = `Task created for ${dialog.ctx.date} — see Tasks`
    } else if (dialog.noteId != null) {
      await $fetch(`/api/calendar/notes/${dialog.noteId}`, {
        method: 'PATCH',
        body: {
          networkId: currentNetworkId.value,
          propertyId: dialog.ctx.propertyId,
          body: dayText.value.trim(),
        },
      })
      flash.value = 'Note updated'
    } else {
      await $fetch('/api/calendar/notes', {
        method: 'POST',
        body: {
          networkId: currentNetworkId.value,
          propertyId: dialog.ctx.propertyId,
          date: dialog.ctx.date,
          body: dayText.value.trim(),
        },
      })
      flash.value = 'Note added'
    }
    dayDialog.value = null
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    dayError.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Action failed'
  } finally {
    dayBusy.value = false
  }
}

async function deleteNote(note: CalendarNote) {
  dayBusy.value = true
  dayError.value = null
  try {
    await $fetch(`/api/calendar/notes/${note.id}`, {
      method: 'DELETE',
      query: {
        networkId: currentNetworkId.value,
        propertyId: note.propertyId,
      },
    })
    flash.value = 'Note deleted'
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    dayError.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Delete failed'
  } finally {
    dayBusy.value = false
  }
}
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
    <p v-if="flash" class="flash" role="status">{{ flash }}</p>

    <CalendarGrid
      :bars="bars"
      :rows="rows"
      :range-start="rangeStart"
      :days="days"
      :layout="layout"
      :day-summaries="daySummaries"
      :notes="notes"
      :build-actions="buildCellActions"
      @cell-action="onCellAction"
    />

    <Teleport to="body">
      <div
        v-if="bookingPrefill"
        class="day-dialog-backdrop"
        @click.self="bookingPrefill = null"
      >
        <div
          class="day-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Create direct booking"
          @keydown.esc="bookingPrefill = null"
        >
          <h2>Create direct booking</h2>
          <ReservationsDirectBookingForm
            :properties="apiProperties.length ? apiProperties : shellProperties"
            :room-types="catalogRoomTypes"
            :rate-plans="catalogRatePlans"
            :prefill="bookingPrefill"
            :booking-crs-enabled="bookingCrsWrite"
            start-open
            @created="
              (payload) => {
                flash =
                  payload.status === 'pending_sync'
                    ? `Direct booking #${payload.id} queued (pending Channex revision)`
                    : `Booking #${payload.id} · ${payload.status}`
                bookingPrefill = null
                void load()
              }
            "
            @error="(msg) => (error = msg)"
            @cancel="bookingPrefill = null"
          />
        </div>
      </div>

      <div v-if="dayDialog" class="day-dialog-backdrop" @click.self="dayDialog = null">
        <form
          class="day-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="dayDialog.kind === 'task' ? 'Add task' : 'Notes'"
          @submit.prevent="submitDayDialog"
          @keydown.esc="dayDialog = null"
        >
          <h2>
            {{ dayDialog.kind === 'task' ? 'Add task' : 'Notes' }}
            — {{ dayDialog.ctx.propertyName }} · {{ dayDialog.ctx.date }}
          </h2>

          <ul v-if="dayDialog.kind === 'note' && notesFor(dayDialog.ctx).length" class="note-list">
            <li v-for="note in notesFor(dayDialog.ctx)" :key="note.id">
              <p>{{ note.body }}</p>
              <span class="note-actions">
                <button type="button" :disabled="dayBusy" @click="startNoteEdit(note)">
                  Edit
                </button>
                <button type="button" :disabled="dayBusy" @click="deleteNote(note)">
                  Delete
                </button>
              </span>
            </li>
          </ul>

          <label>
            <span>{{
              dayDialog.kind === 'task'
                ? 'Task title'
                : dayDialog.noteId != null
                  ? 'Edit note'
                  : 'New note'
            }}</span>
            <textarea
              v-model="dayText"
              rows="2"
              :placeholder="dayDialog.kind === 'task' ? 'e.g. Deep clean before arrival' : 'e.g. Pool maintenance day'"
            />
          </label>
          <p v-if="dayError" class="gate" role="alert">{{ dayError }}</p>
          <div class="dialog-actions">
            <button type="button" :disabled="dayBusy" @click="dayDialog = null">
              Cancel
            </button>
            <button type="submit" :disabled="dayBusy || !dayText.trim()">
              {{
                dayDialog.kind === 'task'
                  ? 'Create task'
                  : dayDialog.noteId != null
                    ? 'Save note'
                    : 'Add note'
              }}
            </button>
          </div>
        </form>
      </div>
    </Teleport>
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

.flash {
  margin: 0 0 0.85rem;
  padding: 0.6rem 1rem;
  border: 1px solid rgba(101, 213, 174, 0.35);
  border-radius: var(--radius);
  color: var(--accent-strong);
  font-size: 0.72rem;
}

.day-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(4, 10, 9, 0.55);
}

.day-dialog {
  display: grid;
  gap: 0.75rem;
  width: min(24rem, 100%);
  padding: 1rem 1.1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(13, 24, 22, 0.98);
}

.day-dialog h2 {
  margin: 0;
  font-size: 0.85rem;
}

.day-dialog label {
  display: grid;
  gap: 0.3rem;
}

.day-dialog label span {
  color: var(--faint);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.day-dialog textarea {
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 0.76rem;
  resize: vertical;
}

.note-list {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.note-list li {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.45rem 0.55rem;
  border: 1px dashed var(--line);
  border-radius: 0.4rem;
}

.note-list p {
  margin: 0;
  font-size: 0.72rem;
}

.note-actions {
  display: flex;
  gap: 0.3rem;
}

.note-actions button {
  padding: 0.2rem 0.45rem;
  font-size: 0.62rem;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
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
