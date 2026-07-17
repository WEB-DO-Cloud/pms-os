<script setup lang="ts">
definePageMeta({ layout: 'auth', middleware: [] })

const route = useRoute()
const email = ref('')
const password = ref('')
const error = ref('')
const pending = ref(false)

const { data: setup } = await useFetch('/api/setup/status')
if (setup.value?.needsSetup) {
  await navigateTo('/setup', { replace: true })
}

async function onSubmit() {
  error.value = ''
  pending.value = true
  try {
    const { authClient } = await import('~/utils/auth-client')
    const result = await authClient.signIn.email({
      email: email.value.trim(),
      password: password.value,
    })
    if (result.error) {
      error.value = result.error.message || 'Sign in failed'
      return
    }
    const redirect =
      typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    // Auth changes must cross a full-page boundary: Nuxt useState/useFetch caches
    // still contain the previously signed-in user's workspace in this browser tab.
    window.location.replace(redirect)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Sign in failed'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <form class="auth-form" @submit.prevent="onSubmit">
    <p class="eyebrow">PMS OS</p>
    <h1>Sign in</h1>
    <p class="lede">Use your operator account for the commercial platform.</p>

    <label>
      <span>Email</span>
      <input v-model="email" type="email" autocomplete="username" required />
    </label>
    <label>
      <span>Password</span>
      <input
        v-model="password"
        type="password"
        autocomplete="current-password"
        required
        minlength="8"
      />
    </label>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <button type="submit" :disabled="pending">
      {{ pending ? 'Signing in…' : 'Sign in' }}
    </button>

    <p v-if="setup?.signupEnabled" class="alt">
      New network?
      <NuxtLink to="/signup">Create an account</NuxtLink>
    </p>
  </form>
</template>

<style scoped>
.auth-form h1 {
  margin: 0 0 0.4rem;
  font-family: Manrope, sans-serif;
  font-size: 1.7rem;
}
.lede {
  margin: 0 0 1.4rem;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.45;
}
label {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 0.9rem;
  color: var(--muted);
  font-size: 0.82rem;
}
input {
  width: 100%;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--line-strong);
  border-radius: 0.55rem;
  background: var(--canvas);
  color: var(--ink);
}
button {
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.8rem 1rem;
  border: 0;
  border-radius: 0.55rem;
  background: var(--accent);
  color: #04201a;
  font-weight: 700;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.error {
  margin: 0 0 0.75rem;
  color: var(--danger);
  font-size: 0.88rem;
}
.alt {
  margin: 1.1rem 0 0;
  color: var(--muted);
  font-size: 0.88rem;
  text-align: center;
}
.alt a {
  color: var(--accent-strong);
  font-weight: 600;
}
</style>
