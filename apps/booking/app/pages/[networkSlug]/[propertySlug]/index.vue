<script setup lang="ts">
const route = useRoute()
const config = useRuntimeConfig()
const api = config.public.pmsApiBase.replace(/\/$/, '')

const checkInDate = ref('')
const checkOutDate = ref('')
const adults = ref(1)
const loading = ref(false)
const error = ref<string | null>(null)
const catalog = ref<{
  status: string
  reason?: string
  propertyName?: string
  termsText?: string
  offers?: Array<{
    roomTypeId: number
    roomTypeName: string
    ratePlanChannexId: string
    stayTotalMinor: number
    depositMinor: number
    currency: string
    quoteToken: string
    remaining: number
    nights: { date: string; rateMinor: number }[]
  }> | null
} | null>(null)

async function loadCatalog() {
  loading.value = true
  error.value = null
  try {
    catalog.value = await $fetch(`${api}/api/public/booking/catalog`, {
      query: {
        networkSlug: route.params.networkSlug,
        propertySlug: route.params.propertySlug,
        checkInDate: checkInDate.value || undefined,
        checkOutDate: checkOutDate.value || undefined,
        adults: adults.value,
      },
    })
  } catch (err: unknown) {
    const e = err as { statusCode?: number; statusMessage?: string }
    if (e.statusCode === 404) error.value = 'This booking page was not found.'
    else error.value = e.statusMessage ?? 'Unable to load availability. Try again.'
  } finally {
    loading.value = false
  }
}

function choose(offer: {
  quoteToken: string
  roomTypeName: string
  stayTotalMinor: number
  depositMinor: number
  currency: string
}) {
  sessionStorage.setItem(
    'pms-quote',
    JSON.stringify({
      ...offer,
      checkInDate: checkInDate.value,
      checkOutDate: checkOutDate.value,
      adults: adults.value,
      networkSlug: route.params.networkSlug,
      propertySlug: route.params.propertySlug,
      termsText: catalog.value?.termsText ?? '',
    }),
  )
  navigateTo(`/${route.params.networkSlug}/${route.params.propertySlug}/checkout`)
}

onMounted(loadCatalog)
</script>

<template>
  <main class="wrap">
    <p class="eyebrow">Public booking</p>
    <h1>{{ catalog?.propertyName || 'Check dates' }}</h1>

    <form class="dates" @submit.prevent="loadCatalog">
      <label>
        Check-in
        <input v-model="checkInDate" type="date" required />
      </label>
      <label>
        Check-out
        <input v-model="checkOutDate" type="date" required />
      </label>
      <label>
        Adults
        <input v-model.number="adults" type="number" min="1" max="16" />
      </label>
      <button type="submit" :disabled="loading">{{ loading ? 'Checking…' : 'Show rooms' }}</button>
    </form>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="catalog?.status === 'not_ready'" class="empty">
      This property is not ready for online booking yet.
    </p>
    <p v-else-if="catalog && checkInDate && catalog.offers && catalog.offers.length === 0" class="empty">
      Nothing available for those dates. Refresh dates to try again.
    </p>

    <ul v-if="catalog?.offers?.length" class="offers">
      <li v-for="offer in catalog.offers" :key="offer.quoteToken">
        <h2>{{ offer.roomTypeName }}</h2>
        <p>
          {{ (offer.stayTotalMinor / 100).toFixed(2) }} {{ offer.currency }}
          <span v-if="offer.depositMinor">
            · due now {{ (offer.depositMinor / 100).toFixed(2) }}
          </span>
        </p>
        <button type="button" @click="choose(offer)">Continue</button>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.wrap {
  max-width: 36rem;
  margin: 0 auto;
  padding: 1.5rem 1.1rem 3rem;
}
.eyebrow {
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-size: 0.7rem;
  color: var(--muted);
}
.dates {
  display: grid;
  gap: 0.75rem;
  margin: 1.25rem 0;
}
label {
  display: grid;
  gap: 0.3rem;
  font-size: 0.85rem;
}
input,
button {
  font: inherit;
}
.error {
  color: var(--danger);
}
.empty {
  color: var(--muted);
}
.offers {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 1rem;
}
.offers li {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 1rem;
}
</style>
