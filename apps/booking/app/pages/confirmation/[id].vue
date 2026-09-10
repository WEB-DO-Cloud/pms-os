<script setup lang="ts">
const route = useRoute()
const config = useRuntimeConfig()
const api = config.public.pmsApiBase.replace(/\/$/, '')
const payload = ref<{
  status: string
  confirming: boolean
  checkInDate: string
  checkOutDate: string
  currency: string
  stayTotalMinor: number | null
  depositMinor: number
  guestEmailMasked: string | null
  message: string
} | null>(null)
const error = ref<string | null>(null)

async function poll() {
  try {
    payload.value = await $fetch(`${api}/api/public/booking/confirmation/${route.params.id}`)
  } catch {
    error.value = 'Confirmation not found.'
  }
}

onMounted(() => {
  let timer: ReturnType<typeof setInterval> | undefined
  const stop = () => {
    if (timer) clearInterval(timer)
  }
  onUnmounted(stop)
  void (async () => {
    await poll()
    if (payload.value && !payload.value.confirming) return
    timer = setInterval(async () => {
      const prev = payload.value?.status
      await poll()
      if (payload.value && !payload.value.confirming) stop()
      else if (payload.value?.status === prev && error.value) stop()
    }, 4000)
  })()
})
</script>

<template>
  <main class="wrap">
    <h1>Booking received</h1>
    <p v-if="error">{{ error }}</p>
    <section v-else-if="payload">
      <p>{{ payload.message }}</p>
      <p>{{ payload.checkInDate }} → {{ payload.checkOutDate }}</p>
      <p v-if="payload.stayTotalMinor != null">
        {{ (payload.stayTotalMinor / 100).toFixed(2) }} {{ payload.currency }}
      </p>
      <p v-if="payload.guestEmailMasked">Confirmation will go to {{ payload.guestEmailMasked }}</p>
      <p class="muted">We do not treat a payment redirect as a confirmed stay.</p>
    </section>
  </main>
</template>

<style scoped>
.wrap {
  max-width: 36rem;
  margin: 0 auto;
  padding: 1.5rem 1.1rem 3rem;
}
.muted {
  color: var(--muted);
  font-size: 0.85rem;
}
</style>
