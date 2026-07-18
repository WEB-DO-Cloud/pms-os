<script setup lang="ts">
export type CellMenuAction = {
  id: string
  label: string
  disabled?: boolean
  /** Shown when the action is disabled (e.g. missing room/rate mapping). */
  hint?: string
}

export type CellMenuContext = {
  propertyId: number
  propertyName: string
  date: string
  vacancy: number
  capacity: number
  booked: number
  rateMinor: number | null
  currency: string | null
  minStay: number | null
  stopSell: boolean
  closedToArrival: boolean
  closedToDeparture: boolean
  degraded: boolean
  hasRoomMapping: boolean
  hasRateMapping: boolean
}

const props = defineProps<{
  context: CellMenuContext | null
  actions?: CellMenuAction[]
}>()

const emit = defineEmits<{
  close: []
  action: [id: string, context: CellMenuContext]
}>()

const panel = ref<HTMLElement | null>(null)

watch(
  () => props.context,
  (ctx) => {
    if (ctx) nextTick(() => panel.value?.focus())
  },
)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
}

function money(minor: number | null, currency: string | null) {
  if (minor == null) return null
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency ?? 'USD',
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

function dateLabel(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

const restrictionMarkers = computed(() => {
  const ctx = props.context
  if (!ctx) return []
  const markers: string[] = []
  if (ctx.stopSell) markers.push('Stop sell')
  if (ctx.closedToArrival) markers.push('Closed to arrival')
  if (ctx.closedToDeparture) markers.push('Closed to departure')
  if (ctx.minStay != null && ctx.minStay > 1) markers.push(`Min stay ${ctx.minStay}`)
  return markers
})
</script>

<template>
  <Teleport to="body">
    <div v-if="context" class="cell-menu-backdrop" @click.self="emit('close')">
      <div
        ref="panel"
        class="cell-menu"
        role="dialog"
        aria-modal="true"
        :aria-label="`${context.propertyName} — ${dateLabel(context.date)}`"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <header>
          <div>
            <h2>{{ context.propertyName }}</h2>
            <p class="date">{{ dateLabel(context.date) }}</p>
          </div>
          <button type="button" class="close" aria-label="Close" @click="emit('close')">
            ×
          </button>
        </header>

        <dl class="facts">
          <div>
            <dt>Vacancy</dt>
            <dd>
              {{ context.vacancy }} / {{ context.capacity }}
              <span v-if="context.degraded" class="degraded" title="Channex availability is stale or missing — derived from reservations">
                estimated
              </span>
            </dd>
          </div>
          <div v-if="money(context.rateMinor, context.currency)">
            <dt>Nightly rate</dt>
            <dd>{{ money(context.rateMinor, context.currency) }}</dd>
          </div>
          <div v-if="restrictionMarkers.length">
            <dt>Restrictions</dt>
            <dd>{{ restrictionMarkers.join(' · ') }}</dd>
          </div>
        </dl>

        <ul v-if="actions?.length" class="actions">
          <li v-for="action in actions" :key="action.id">
            <button
              type="button"
              :disabled="action.disabled"
              @click="emit('action', action.id, context)"
            >
              {{ action.label }}
            </button>
            <p v-if="action.disabled && action.hint" class="hint">{{ action.hint }}</p>
          </li>
        </ul>
        <p v-else class="no-actions">No day actions available yet.</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cell-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(4, 10, 9, 0.55);
}

.cell-menu {
  width: min(22rem, 100%);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(13, 24, 22, 0.98);
  padding: 1rem 1.1rem;
  outline: none;
}

header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

h2 {
  margin: 0;
  font-size: 0.95rem;
}

.date {
  margin: 0.15rem 0 0;
  color: var(--muted);
  font-size: 0.7rem;
}

.close {
  padding: 0.1rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  background: transparent;
  color: var(--muted);
  font-size: 1rem;
  cursor: pointer;
}

.facts {
  display: grid;
  gap: 0.5rem;
  margin: 0.85rem 0;
}

.facts dt {
  color: var(--faint);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.facts dd {
  margin: 0.1rem 0 0;
  font-size: 0.82rem;
}

.degraded {
  margin-left: 0.35rem;
  color: var(--warning);
  font-size: 0.62rem;
}

.actions {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.actions button {
  width: 100%;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--accent-strong);
  font: inherit;
  font-size: 0.76rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.actions button:disabled {
  color: var(--faint);
  cursor: not-allowed;
}

.hint {
  margin: 0.2rem 0 0;
  color: var(--faint);
  font-size: 0.62rem;
}

.no-actions {
  margin: 0;
  color: var(--faint);
  font-size: 0.7rem;
}
</style>
