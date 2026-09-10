<script setup lang="ts">
const route = useRoute()
const config = useRuntimeConfig()
const api = config.public.pmsApiBase.replace(/\/$/, '')

const quote = ref<null | {
  quoteToken: string
  roomTypeName: string
  stayTotalMinor: number
  depositMinor: number
  currency: string
  checkInDate: string
  checkOutDate: string
  adults: number
  networkSlug: string
  propertySlug: string
  termsText: string
}>(null)

const guestName = ref('')
const guestEmail = ref('')
const termsAccepted = ref(false)
const error = ref<string | null>(null)
const submitting = ref(false)

onMounted(() => {
  const raw = sessionStorage.getItem('pms-quote')
  quote.value = raw ? JSON.parse(raw) : null
})

async function submit() {
  if (!quote.value || !termsAccepted.value) return
  submitting.value = true
  error.value = null
  try {
    const res = await $fetch<{ confirmationToken: string; checkoutUrl: string | null }>(
      `${api}/api/public/booking/book`,
      {
        method: 'POST',
        body: {
          networkSlug: quote.value.networkSlug,
          propertySlug: quote.value.propertySlug,
          quoteToken: quote.value.quoteToken,
          guestName: guestName.value,
          guestEmail: guestEmail.value,
          adults: quote.value.adults,
          termsAccepted: true,
          idempotencyKey: crypto.randomUUID(),
        },
      },
    )
    if (res.checkoutUrl) {
      window.location.href = res.checkoutUrl
      return
    }
    await navigateTo(`/confirmation/${res.confirmationToken}`)
  } catch (err: unknown) {
    const e = err as { statusMessage?: string }
    error.value = e.statusMessage ?? 'Booking failed. Please re-quote.'
    if (error.value.toLowerCase().includes('re-quote')) {
      await navigateTo(`/${route.params.networkSlug}/${route.params.propertySlug}`)
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="wrap">
    <h1>Guest details</h1>
    <p v-if="!quote">Your quote expired. Return to dates and try again.</p>
    <form v-else class="form" @submit.prevent="submit">
      <p>
        {{ quote.roomTypeName }} · {{ quote.checkInDate }} to {{ quote.checkOutDate }} ·
        {{ (quote.stayTotalMinor / 100).toFixed(2) }} {{ quote.currency }}
      </p>
      <label>
        Full name
        <input v-model="guestName" type="text" required autocomplete="name" />
      </label>
      <label>
        Email
        <input v-model="guestEmail" type="email" required autocomplete="email" />
      </label>
      <fieldset>
        <legend>Terms</legend>
        <p class="terms">{{ quote.termsText }}</p>
        <label class="check">
          <input v-model="termsAccepted" type="checkbox" required />
          I agree to these terms
        </label>
      </fieldset>
      <button type="submit" :disabled="submitting || !termsAccepted">
        {{ submitting ? 'Booking…' : 'Confirm booking' }}
      </button>
      <p v-if="error" class="error">{{ error }}</p>
    </form>
  </main>
</template>

<style scoped>
.wrap {
  max-width: 36rem;
  margin: 0 auto;
  padding: 1.5rem 1.1rem 3rem;
}
.form {
  display: grid;
  gap: 0.85rem;
}
label,
.check {
  display: grid;
  gap: 0.3rem;
  font-size: 0.85rem;
}
.check {
  grid-template-columns: auto 1fr;
  align-items: center;
}
.terms {
  white-space: pre-wrap;
  border: 1px solid var(--line);
  padding: 0.75rem;
  border-radius: 8px;
  font-size: 0.85rem;
}
.error {
  color: var(--danger);
}
</style>
