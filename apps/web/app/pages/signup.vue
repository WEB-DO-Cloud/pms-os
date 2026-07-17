<script setup lang="ts">
definePageMeta({ layout: 'auth', middleware: [] })

const name = ref('')
const email = ref('')
const password = ref('')
const networkName = ref('')
const error = ref('')
const pending = ref(false)

const { data: setup } = await useFetch('/api/setup/status')
if (setup.value?.needsSetup) {
  await navigateTo('/setup', { replace: true })
} else if (!setup.value?.signupEnabled) {
  await navigateTo('/login', { replace: true })
}

async function onSubmit() {
  error.value = ''
  pending.value = true
  try {
    const res = await $fetch<{ ok: boolean }>('/api/signup', {
      method: 'POST',
      body: {
        name: name.value,
        email: email.value,
        password: password.value,
        networkName: networkName.value,
      },
    })
    if (!res.ok) {
      error.value = 'Signup failed'
      return
    }
    const { authClient } = await import('~/utils/auth-client')
    const signed = await authClient.signIn.email({
      email: email.value.trim(),
      password: password.value,
    })
    if (signed.error) {
      error.value =
        signed.error.message ||
        'Account created, but sign-in failed. Try the login page.'
      return
    }
    window.location.replace('/dashboard')
  } catch (e: unknown) {
    const err = e as {
      data?: { statusMessage?: string }
      statusMessage?: string
      message?: string
    }
    error.value =
      err?.data?.statusMessage ||
      err?.statusMessage ||
      err?.message ||
      'Signup failed'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <form class="auth-form" @submit.prevent="onSubmit">
    <p class="eyebrow">Commercial platform</p>
    <h1>Create your network</h1>
    <p class="lede">
      Sign up for a new operator account and property network on the commercial
      multi-tenant platform.
    </p>

    <label>
      <span>Your name</span>
      <input v-model="name" autocomplete="name" required minlength="2" />
    </label>
    <label>
      <span>Work email</span>
      <input v-model="email" type="email" autocomplete="username" required />
    </label>
    <label>
      <span>Password</span>
      <input
        v-model="password"
        type="password"
        autocomplete="new-password"
        required
        minlength="8"
      />
    </label>
    <label>
      <span>Network name</span>
      <input
        v-model="networkName"
        required
        minlength="2"
        placeholder="e.g. Palm Hills Real Estate"
      />
    </label>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <button type="submit" :disabled="pending">
      {{ pending ? 'Creating…' : 'Create account' }}
    </button>

    <p class="alt">
      Already have an account?
      <NuxtLink to="/login">Sign in</NuxtLink>
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
