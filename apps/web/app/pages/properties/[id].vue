<script setup lang="ts">
type PhysicalRoomView = {
  id: number
  label: string
  sortOrder: number
  slotIndex: number
  archivedAt: string | null
}

type RoomTypeView = {
  id: number
  name: string
  capacity: number | null
  countOfRooms: number | null
  rooms: PhysicalRoomView[]
}

const route = useRoute()
const { currentNetworkId } = useCurrentNetwork()
const propertyId = computed(() => Number(route.params.id))

const detail = ref<{
  property: {
    id: number
    name: string
    channexId: string
    address: string | null
    city: string | null
    country: string | null
    timezone: string | null
    currency: string | null
  }
  ops: {
    checkInTime: string | null
    checkOutTime: string | null
    notes: string | null
    status: string
    archivedAt: string | null
  }
  roomTypes: RoomTypeView[]
  ownership: { channexOwned: string[]; pmsOwned: string[] }
} | null>(null)

const checkInTime = ref('15:00')
const checkOutTime = ref('11:00')
const notes = ref('')
const roomDrafts = ref<Record<number, string>>({})
const error = ref<string | null>(null)
const flash = ref<string | null>(null)
const loading = ref(false)
const saving = ref(false)
const savingRoomId = ref<number | null>(null)

function syncRoomDrafts(types: RoomTypeView[]) {
  const next: Record<number, string> = {}
  for (const rt of types) {
    for (const room of rt.rooms) {
      if (!room.archivedAt) next[room.id] = room.label
    }
  }
  roomDrafts.value = next
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<NonNullable<typeof detail.value> & { networkId: number }>(
      `/api/properties/${propertyId.value}`,
      { query: { networkId: currentNetworkId.value } },
    )
    detail.value = res
    checkInTime.value = res.ops.checkInTime ?? '15:00'
    checkOutTime.value = res.ops.checkOutTime ?? '11:00'
    notes.value = res.ops.notes ?? ''
    syncRoomDrafts(res.roomTypes)
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load property'
    detail.value = null
  } finally {
    loading.value = false
  }
}

async function save(archive?: boolean) {
  saving.value = true
  error.value = null
  try {
    await $fetch(`/api/properties/${propertyId.value}`, {
      method: 'PATCH',
      body: {
        networkId: currentNetworkId.value,
        checkInTime: checkInTime.value,
        checkOutTime: checkOutTime.value,
        notes: notes.value,
        ...(archive === undefined ? {} : { archive }),
      },
    })
    flash.value =
      archive === true
        ? 'Property soft-archived'
        : archive === false
          ? 'Property restored'
          : 'Operational settings saved'
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Save failed'
  } finally {
    saving.value = false
  }
}

async function saveRoom(roomId: number) {
  savingRoomId.value = roomId
  error.value = null
  try {
    await $fetch(`/api/properties/${propertyId.value}/rooms/${roomId}`, {
      method: 'PATCH',
      body: {
        networkId: currentNetworkId.value,
        label: roomDrafts.value[roomId],
      },
    })
    flash.value = 'Room label saved'
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Room save failed'
  } finally {
    savingRoomId.value = null
  }
}

onMounted(load)
watch([currentNetworkId, propertyId], () => {
  void load()
})
</script>

<template>
  <div class="page-shell">
    <header class="head">
      <div>
        <p class="eyebrow">Portfolio</p>
        <h1>{{ detail?.property.name ?? 'Property' }}</h1>
        <p class="page-intro">
          Channex room types stay read-only. Rename generated physical rooms for the calendar.
        </p>
      </div>
      <NuxtLink class="link" to="/properties">← Properties</NuxtLink>
    </header>

    <div class="section-rule" />

    <p v-if="flash" class="flash" role="status">{{ flash }}</p>
    <p v-if="error" class="gate" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading…</p>

    <template v-if="detail">
      <section class="panel">
        <h2>Channex catalog</h2>
        <dl class="meta">
          <div><dt>Channex id</dt><dd>{{ detail.property.channexId }}</dd></div>
          <div>
            <dt>Address</dt>
            <dd>
              {{
                [detail.property.address, detail.property.city, detail.property.country]
                  .filter(Boolean)
                  .join(', ') || '—'
              }}
            </dd>
          </div>
          <div><dt>Timezone</dt><dd>{{ detail.property.timezone ?? '—' }}</dd></div>
          <div><dt>Currency</dt><dd>{{ detail.property.currency ?? '—' }}</dd></div>
        </dl>
        <p class="hint">Owned by Channex: {{ detail.ownership.channexOwned.join(', ') }}</p>
      </section>

      <section class="panel">
        <h2>Room types &amp; rooms</h2>
        <ul v-if="detail.roomTypes.length" class="rooms">
          <li v-for="rt in detail.roomTypes" :key="rt.id" class="rt-block">
            <div class="rt-head">
              <strong>{{ rt.name }}</strong>
              <span>
                {{ rt.countOfRooms ?? '?' }} units · cap {{ rt.capacity ?? '?' }}
              </span>
            </div>
            <ul
              v-if="rt.rooms.filter((r) => !r.archivedAt).length"
              class="physical"
            >
              <li v-for="room in rt.rooms.filter((r) => !r.archivedAt)" :key="room.id">
                <label>
                  Room label
                  <input
                    v-model="roomDrafts[room.id]"
                    type="text"
                    :disabled="savingRoomId === room.id"
                  />
                </label>
                <button
                  type="button"
                  :disabled="savingRoomId === room.id || roomDrafts[room.id] === room.label"
                  @click="saveRoom(room.id)"
                >
                  Save
                </button>
              </li>
            </ul>
            <p v-else class="muted">No physical rooms generated yet.</p>
          </li>
        </ul>
        <p v-else class="muted">No room types synced yet.</p>
      </section>

      <section class="panel">
        <h2>PMS operational settings</h2>
        <form class="ops" @submit.prevent="save()">
          <label>
            Check-in
            <input v-model="checkInTime" type="text" :disabled="saving" />
          </label>
          <label>
            Check-out
            <input v-model="checkOutTime" type="text" :disabled="saving" />
          </label>
          <label class="wide">
            Notes
            <textarea v-model="notes" rows="3" :disabled="saving" />
          </label>
          <div class="actions">
            <button type="submit" :disabled="saving">Save</button>
            <button
              v-if="detail.ops.status !== 'archived'"
              type="button"
              class="warn"
              :disabled="saving"
              @click="save(true)"
            >
              Soft-archive
            </button>
            <button
              v-else
              type="button"
              :disabled="saving"
              @click="save(false)"
            >
              Restore
            </button>
          </div>
        </form>
        <p class="hint">PMS-owned: {{ detail.ownership.pmsOwned.join(', ') }}</p>
      </section>
    </template>
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
.panel {
  margin-bottom: 1.25rem;
  padding: 1.1rem 1.2rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(13, 24, 22, 0.72);
}
.panel h2 {
  margin: 0 0 0.85rem;
  font-size: 0.85rem;
}
.meta {
  display: grid;
  gap: 0.55rem;
  margin: 0;
}
.meta div {
  display: grid;
  grid-template-columns: 7rem 1fr;
  gap: 0.5rem;
  font-size: 0.72rem;
}
dt {
  color: var(--faint);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.58rem;
  font-weight: 700;
}
dd {
  margin: 0;
  color: var(--muted);
}
.rooms {
  margin: 0;
  padding: 0;
  list-style: none;
}
.rt-block {
  padding: 0.55rem 0;
  border-top: 1px solid var(--line);
}
.rt-block:first-child {
  border-top: 0;
  padding-top: 0;
}
.rt-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.72rem;
}
.rt-head span {
  color: var(--muted);
}
.physical {
  margin: 0.55rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.45rem;
}
.physical li {
  display: flex;
  align-items: end;
  gap: 0.55rem;
}
.physical label {
  flex: 1;
}
.ops {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85rem;
}
.wide {
  grid-column: 1 / -1;
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
input,
textarea,
button {
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--ink);
  font-size: 0.72rem;
}
.actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}
button {
  border-color: rgba(101, 213, 174, 0.45);
  color: var(--accent-strong);
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
button.warn {
  border-color: rgba(241, 185, 111, 0.45);
  color: var(--warning);
}
.hint {
  margin: 0.85rem 0 0;
  color: var(--faint);
  font-size: 0.62rem;
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
  margin: 0.35rem 0 0;
  color: var(--muted);
  font-size: 0.66rem;
}
</style>
