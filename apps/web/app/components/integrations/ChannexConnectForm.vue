<script setup lang="ts">
const props = defineProps<{
  networkId: number
  apiKeyMasked: string | null
  webhookMasked: string | null
  apiKeyConfigured: boolean
  webhookConfigured: boolean
}>()

const emit = defineEmits<{
  saved: [payload: { apiKeyMasked: string | null; webhookMasked: string | null }]
}>()

const apiKey = ref('')
const webhookSecret = ref('')
const busy = ref(false)
const error = ref<string | null>(null)
const success = ref<string | null>(null)

async function submit() {
  busy.value = true
  error.value = null
  success.value = null
  try {
    const res = await $fetch<{
      apiKey: { configured: boolean; masked: string | null }
      webhookSecret?: { configured: boolean; masked: string | null }
    }>('/api/channex/credentials', {
      method: 'POST',
      body: {
        networkId: props.networkId,
        apiKey: apiKey.value,
        webhookSecret: webhookSecret.value || undefined,
      },
    })
    apiKey.value = ''
    webhookSecret.value = ''
    success.value = 'Credentials saved. Secrets are stored encrypted and never shown in full.'
    emit('saved', {
      apiKeyMasked: res.apiKey.masked,
      webhookMasked: res.webhookSecret?.masked ?? props.webhookMasked,
    })
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Failed to save credentials'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <div>
        <h2>Channex connection</h2>
        <p>API key is validated before save. Stored values are encrypted and masked in responses.</p>
      </div>
    </div>

    <div v-if="apiKeyConfigured || webhookConfigured" class="masked-row">
      <div>
        <span>API key</span>
        <strong>{{ apiKeyMasked ?? '••••••••' }}</strong>
      </div>
      <div>
        <span>Webhook secret</span>
        <strong>{{ webhookConfigured ? (webhookMasked ?? '••••••••') : 'Not set' }}</strong>
      </div>
    </div>

    <form class="connect-form" @submit.prevent="submit">
      <label>
        <span>API key</span>
        <input
          v-model="apiKey"
          type="password"
          autocomplete="off"
          placeholder="Paste Channex user API key"
          required
        />
      </label>
      <label>
        <span>Webhook secret</span>
        <input
          v-model="webhookSecret"
          type="password"
          autocomplete="off"
          placeholder="Optional — rotate anytime"
        />
      </label>
      <div class="actions">
        <button type="submit" class="btn-primary" :disabled="busy || !apiKey.trim()">
          {{ busy ? 'Validating…' : apiKeyConfigured ? 'Rotate credentials' : 'Connect Channex' }}
        </button>
      </div>
      <p v-if="error" class="msg failed" role="alert">{{ error }}</p>
      <p v-if="success" class="msg healthy" role="status">{{ success }}</p>
    </form>
  </section>
</template>

<style scoped>
.panel {
  margin-top: 1.6rem;
  padding: 1.25rem 0 0;
  border-top: 1px solid var(--line);
}

.panel-head h2 {
  margin: 0;
  font-size: 1rem;
}

.panel-head p {
  margin: 0.4rem 0 0;
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.5;
}

.masked-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 1.1rem;
  padding: 0.9rem 0;
  border-bottom: 1px solid var(--line);
}

.masked-row span,
.connect-form label > span {
  display: block;
  color: var(--muted);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.masked-row strong {
  display: block;
  margin-top: 0.35rem;
  font-family: ui-monospace, monospace;
  font-size: 0.78rem;
  font-weight: 500;
}

.connect-form {
  display: grid;
  gap: 0.9rem;
  margin-top: 1.1rem;
  max-width: 32rem;
}

.connect-form input {
  width: 100%;
  margin-top: 0.35rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--line-strong);
  border-radius: calc(var(--radius) - 0.2rem);
  background: var(--surface);
  color: var(--ink);
}

.connect-form input:focus {
  outline: 2px solid var(--accent-soft);
  border-color: var(--accent);
}

.actions {
  display: flex;
  gap: 0.6rem;
}

.btn-primary {
  padding: 0.55rem 1rem;
  border: 0;
  border-radius: calc(var(--radius) - 0.25rem);
  background: var(--accent);
  color: #04110d;
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.msg {
  margin: 0;
  font-size: 0.7rem;
}

.healthy {
  color: var(--accent);
}

.failed {
  color: var(--danger);
}

@media (max-width: 640px) {
  .masked-row {
    grid-template-columns: 1fr;
  }
}
</style>
