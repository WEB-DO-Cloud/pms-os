<script setup lang="ts">
type Policy = {
  collectionType: 'percent' | 'fixed' | 'full' | 'pay_at_hotel'
  percent: number | null
  fixedAmountMinor: number | null
  termsText: string
  stripeConnectAccountId: string | null
  stripeChargesEnabled: boolean
}

const { currentNetworkId, principal } = useCurrentNetwork()

const canManage = computed(
  () =>
    principal.value?.role === 'org_admin' || principal.value?.role === 'manager',
)

const properties = ref<{ id: number; name: string }[]>([])
const propertyId = ref<number | null>(null)
const policy = ref<Policy>({
  collectionType: 'pay_at_hotel',
  percent: 30,
  fixedAmountMinor: null,
  termsText: '',
  stripeConnectAccountId: null,
  stripeChargesEnabled: false,
})
const preview = ref<{ depositMinor: number; collectNowNotReady: boolean } | null>(
  null,
)
const publicBookingUrl = ref<string | null>(null)
const loadError = ref<string | null>(null)
const saveError = ref<string | null>(null)
const saveOk = ref<string | null>(null)
const copied = ref(false)

async function loadProperties() {
  try {
    const res = await $fetch<{ properties: { id: number; name: string }[] }>(
      '/api/properties',
      { query: { networkId: currentNetworkId.value } },
    )
    properties.value = res.properties ?? []
    if (propertyId.value == null && properties.value[0]) {
      propertyId.value = properties.value[0].id
    }
  } catch {
    properties.value = []
  }
}

async function loadPolicy() {
  if (!propertyId.value) return
  loadError.value = null
  try {
    const res = await $fetch<{
      policy: Policy | null
      preview: { depositMinor: number; collectNowNotReady: boolean } | null
      publicBookingUrl: string | null
      collectNowNotReady: boolean
    }>('/api/settings/booking-policy', {
      query: { networkId: currentNetworkId.value, propertyId: propertyId.value },
    })
    if (res.policy) policy.value = { ...res.policy }
    preview.value = res.preview
    publicBookingUrl.value = res.publicBookingUrl
  } catch (err: unknown) {
    const e = err as { statusMessage?: string; message?: string }
    loadError.value = e.statusMessage ?? e.message ?? 'Unable to load policy'
  }
}

async function savePolicy() {
  if (!propertyId.value) return
  saveError.value = null
  saveOk.value = null
  try {
    const res = await $fetch<{
      policy: Policy
      preview: { depositMinor: number; collectNowNotReady: boolean }
    }>('/api/settings/booking-policy', {
      method: 'PUT',
      body: {
        networkId: currentNetworkId.value,
        propertyId: propertyId.value,
        collectionType: policy.value.collectionType,
        percent: policy.value.percent,
        fixedAmountMinor: policy.value.fixedAmountMinor,
        termsText: policy.value.termsText,
      },
    })
    policy.value = { ...res.policy }
    preview.value = res.preview
    saveOk.value = 'Collection policy saved.'
    await loadPolicy()
  } catch (err: unknown) {
    const e = err as { statusMessage?: string; message?: string }
    saveError.value = e.statusMessage ?? e.message ?? 'Save failed'
  }
}

async function startConnect() {
  if (!propertyId.value) return
  const res = await $fetch<{ url: string }>('/api/settings/stripe-connect/onboard', {
    method: 'POST',
    body: { networkId: currentNetworkId.value, propertyId: propertyId.value },
  })
  if (res.url) window.location.href = res.url
}

async function copyUrl() {
  if (!publicBookingUrl.value) return
  await navigator.clipboard.writeText(publicBookingUrl.value)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1500)
}

onMounted(async () => {
  await loadProperties()
  await loadPolicy()
})
watch([currentNetworkId, propertyId], () => {
  void loadPolicy()
})
</script>

<template>
  <div class="page-shell module-page">
    <p class="eyebrow">Settings</p>
    <h1>Public booking</h1>
    <p class="page-intro">
      Set how guests pay in advance and copy the public booking URL. Stripe is
      required only when the live policy collects a card now.
    </p>

    <div class="section-rule" />

    <p v-if="!canManage" class="gate">Only org admins and managers can edit booking policy.</p>

    <template v-else>
      <label>
        Property
        <select v-model.number="propertyId">
          <option v-for="p in properties" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>

      <p v-if="loadError" class="gate failed">{{ loadError }}</p>

      <form class="policy" @submit.prevent="savePolicy">
        <label>
          Collection
          <select v-model="policy.collectionType">
            <option value="pay_at_hotel">Pay at hotel</option>
            <option value="percent">Percent deposit</option>
            <option value="fixed">Fixed deposit</option>
            <option value="full">Full stay</option>
          </select>
        </label>
        <label v-if="policy.collectionType === 'percent'">
          Percent
          <input v-model.number="policy.percent" type="number" min="1" max="100" />
        </label>
        <label v-if="policy.collectionType === 'fixed'">
          Fixed amount (minor units)
          <input v-model.number="policy.fixedAmountMinor" type="number" min="0" />
        </label>
        <label>
          Terms
          <textarea v-model="policy.termsText" rows="5" required />
        </label>
        <p v-if="preview" class="preview">
          Sample $100.00 stay deposit:
          {{ (preview.depositMinor / 100).toFixed(2) }}
        </p>
        <p v-if="preview?.collectNowNotReady" class="gate failed">
          Collect-now is not ready until Stripe charges are enabled, or switch to
          pay at hotel.
        </p>
        <button type="submit">Save policy</button>
        <p v-if="saveOk" class="ok">{{ saveOk }}</p>
        <p v-if="saveError" class="gate failed">{{ saveError }}</p>
      </form>

      <section>
        <h2>Stripe Connect</h2>
        <p>
          Charges enabled:
          <strong>{{ policy.stripeChargesEnabled ? 'yes' : 'no' }}</strong>
        </p>
        <button type="button" class="ghost" @click="startConnect">
          Connect property Stripe
        </button>
      </section>

      <section>
        <h2>Public URL</h2>
        <p v-if="publicBookingUrl">
          <code>{{ publicBookingUrl }}</code>
          <button type="button" class="ghost" @click="copyUrl">
            {{ copied ? 'Copied' : 'Copy' }}
          </button>
        </p>
        <p v-else class="gate">
          A copyable URL appears when CRS write is on, a policy is saved, and
          collect-now properties have charges enabled.
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.module-page {
  max-width: 40rem;
}
.policy,
section {
  display: grid;
  gap: 0.85rem;
  margin: 1.25rem 0;
}
label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.8rem;
}
input,
select,
textarea {
  font: inherit;
}
.preview,
.ok {
  margin: 0;
  font-size: 0.8rem;
}
.ok {
  color: var(--accent);
}
.gate {
  color: var(--muted);
  font-size: 0.78rem;
}
.gate.failed {
  color: var(--danger);
}
.ghost {
  width: fit-content;
}
</style>
