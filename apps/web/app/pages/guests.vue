<script setup lang="ts">
import type { GuestRow } from '~/components/guests/GuestTable.vue'

const { currentNetworkId } = useCurrentNetwork()
const rows = ref<GuestRow[]>([])
const selectedKey = ref<string | null>(null)
const detail = ref<{
  guest: GuestRow
  reservations: { id: number; propertyId: number; checkInDate: string; checkOutDate: string; status: string }[]
  messages: { id: number; body: string; status: string; createdAt: string }[]
} | null>(null)

const notes = ref('')
const vip = ref(false)
const error = ref<string | null>(null)
const flash = ref<string | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{ guests: GuestRow[] }>('/api/guests', {
      query: { networkId: currentNetworkId.value },
    })
    rows.value = res.guests
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load guests'
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function select(guestKey: string) {
  selectedKey.value = guestKey
  try {
    const res = await $fetch<NonNullable<typeof detail.value>>(`/api/guests/${encodeURIComponent(guestKey)}`, {
      query: { networkId: currentNetworkId.value },
    })
    detail.value = res
    notes.value = res.guest.notes ?? ''
    vip.value = res.guest.vip
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Unable to load guest'
    detail.value = null
  }
}

async function saveEnrichment() {
  if (!detail.value) return
  const propertyId = detail.value.guest.propertyIds[0]
  if (propertyId == null) {
    error.value = 'No property linked for enrichment scope'
    return
  }
  try {
    await $fetch(`/api/guests/${encodeURIComponent(detail.value.guest.guestKey)}`, {
      method: 'PATCH',
      body: {
        networkId: currentNetworkId.value,
        propertyId,
        notes: notes.value,
        vip: vip.value,
      },
    })
    flash.value = 'Guest enrichment saved'
    await load()
    await select(detail.value.guest.guestKey)
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Save failed'
  }
}

onMounted(load)
watch(currentNetworkId, () => {
  selectedKey.value = null
  detail.value = null
  void load()
})
</script>

<template>
  <div class="page-shell">
    <header class="head">
      <div>
        <p class="eyebrow">Guest records</p>
        <h1>Guests</h1>
        <p class="page-intro">
          Profiles derived from scoped reservations, with local VIP flag and notes.
        </p>
      </div>
    </header>

    <div class="section-rule" />

    <p v-if="flash" class="flash" role="status">{{ flash }}</p>
    <p v-if="error" class="gate" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading guests…</p>

    <div class="layout">
      <GuestsGuestTable :rows="rows" :selected-key="selectedKey" @select="select" />

      <aside v-if="detail" class="detail">
        <h2>{{ detail.guest.displayName }}</h2>
        <p class="muted">{{ detail.guest.email ?? detail.guest.guestKey }}</p>

        <label class="check">
          <input v-model="vip" type="checkbox" />
          VIP
        </label>
        <label>
          Notes
          <textarea v-model="notes" rows="3" />
        </label>
        <button type="button" @click="saveEnrichment">Save enrichments</button>

        <h3>Stays</h3>
        <ul>
          <li v-for="r in detail.reservations" :key="r.id">
            <NuxtLink :to="`/reservations/${r.id}`">
              #{{ r.id }} · {{ r.checkInDate }} → {{ r.checkOutDate }} · {{ r.status }}
            </NuxtLink>
          </li>
        </ul>

        <h3>Messages</h3>
        <ul v-if="detail.messages.length">
          <li v-for="m in detail.messages" :key="m.id">
            <span class="status">{{ m.status }}</span> {{ m.body }}
          </li>
        </ul>
        <p v-else class="muted">No queued messages.</p>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 1.2fr 0.9fr;
  gap: 1.25rem;
  align-items: start;
}
.detail {
  padding: 1.1rem 1.2rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(13, 24, 22, 0.72);
}
.detail h2 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
}
.detail h3 {
  margin: 1.1rem 0 0.45rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--faint);
}
.detail ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.detail li {
  padding: 0.35rem 0;
  border-top: 1px solid var(--line);
  font-size: 0.7rem;
  color: var(--muted);
}
.detail li:first-child {
  border-top: 0;
}
.detail a {
  color: var(--accent-strong);
}
label {
  display: grid;
  gap: 0.3rem;
  margin: 0.75rem 0;
  color: var(--faint);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.check {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.72rem;
  color: var(--muted);
  font-weight: 500;
}
textarea,
button {
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--ink);
  font-size: 0.72rem;
}
button {
  border-color: rgba(101, 213, 174, 0.45);
  color: var(--accent-strong);
  font-weight: 600;
  cursor: pointer;
}
.status {
  color: var(--accent);
  text-transform: uppercase;
  font-size: 0.58rem;
  font-weight: 700;
  margin-right: 0.35rem;
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
  margin: 0 0 0.85rem;
  color: var(--muted);
  font-size: 0.66rem;
}
@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
