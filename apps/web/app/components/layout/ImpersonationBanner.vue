<script setup lang="ts">
const { data: session } = await useFetch('/api/auth/get-session', {
  key: 'auth-session-impersonation',
})

const impersonating = computed(() => {
  const s = session.value as {
    session?: { impersonatedBy?: string | null }
    user?: { name?: string; email?: string }
  } | null
  return Boolean(s?.session?.impersonatedBy)
})

const targetLabel = computed(() => {
  const s = session.value as {
    user?: { name?: string; email?: string }
  } | null
  return s?.user?.name || s?.user?.email || 'user'
})

const stopping = ref(false)

async function stop() {
  stopping.value = true
  try {
    await $fetch('/api/super-admin/impersonate/stop', { method: 'POST' })
    await navigateTo('/super_admin/users', { replace: true })
    window.location.assign('/super_admin/users')
  } finally {
    stopping.value = false
  }
}
</script>

<template>
  <div v-if="impersonating" class="impersonation-banner" role="status">
    <span>
      Support mode — viewing as <strong>{{ targetLabel }}</strong>
    </span>
    <button type="button" :disabled="stopping" @click="stop">
      {{ stopping ? 'Restoring…' : 'Stop impersonating' }}
    </button>
  </div>
</template>

<style scoped>
.impersonation-banner {
  position: sticky;
  z-index: 50;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.55rem 1rem;
  color: #07100f;
  background: #f0c674;
  font-size: 0.8rem;
}
button {
  padding: 0.35rem 0.7rem;
  border: 0;
  border-radius: 0.4rem;
  color: #07100f;
  background: rgba(7, 16, 15, 0.12);
  font-weight: 700;
  cursor: pointer;
}
</style>
