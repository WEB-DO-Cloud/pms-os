<script setup lang="ts">
const props = defineProps<{
  enabled: boolean
  networkId: number
  displayName: string | null
  logoUrl: string | null
  accentColor: string | null
}>()

const emit = defineEmits<{
  saved: [payload: { displayName: string | null; logoUrl: string | null; accentColor: string | null }]
}>()

const displayName = ref(props.displayName ?? '')
const logoUrl = ref(props.logoUrl ?? '')
const accentColor = ref(props.accentColor ?? '#65d5ae')
const error = ref<string | null>(null)
const saving = ref(false)

watch(
  () => [props.displayName, props.logoUrl, props.accentColor] as const,
  ([name, logo, accent]) => {
    displayName.value = name ?? ''
    logoUrl.value = logo ?? ''
    accentColor.value = accent ?? '#65d5ae'
  },
)

async function save() {
  if (!props.enabled) {
    error.value = 'Commercial entitlement required: white-label'
    return
  }
  saving.value = true
  error.value = null
  try {
    const res = await $fetch<{
      branding: {
        displayName: string | null
        logoUrl: string | null
        accentColor: string | null
      }
    }>('/api/settings/branding', {
      method: 'PATCH',
      body: {
        networkId: props.networkId,
        displayName: displayName.value,
        logoUrl: logoUrl.value,
        accentColor: accentColor.value,
      },
    })
    emit('saved', res.branding)
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to save branding'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="branding" aria-label="White-label branding">
    <h2>White-label branding</h2>
    <p v-if="!enabled" class="gate" role="status">
      Network logo and branding require a commercial entitlement. Community
      deployments keep the default PMS OS brand.
    </p>
    <fieldset :disabled="!enabled || saving">
      <label>
        Display name
        <input v-model="displayName" type="text" placeholder="Your brand name" />
      </label>
      <label>
        Logo URL
        <input v-model="logoUrl" type="url" placeholder="https://…" />
      </label>
      <label>
        Accent color
        <input v-model="accentColor" type="text" placeholder="#65d5ae" />
      </label>
      <button type="button" @click="save">Save branding</button>
    </fieldset>
    <p v-if="error" class="gate failed" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.branding {
  display: grid;
  gap: 0.85rem;
}
h2 {
  margin: 0;
  font-size: 0.95rem;
}
.gate {
  margin: 0;
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--muted);
  font-size: 0.75rem;
  background: var(--surface);
}
.gate.failed {
  color: var(--danger);
  border-color: rgba(244, 127, 122, 0.35);
}
fieldset {
  margin: 0;
  padding: 0;
  border: 0;
  display: grid;
  gap: 0.75rem;
  max-width: 28rem;
}
label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.72rem;
  color: var(--muted);
}
input {
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.55rem;
  color: var(--ink);
  background: var(--surface-raised);
  font: inherit;
}
button {
  justify-self: start;
  padding: 0.55rem 0.9rem;
  border: 0;
  border-radius: 0.55rem;
  color: #07100f;
  background: var(--accent);
  font-weight: 600;
  cursor: pointer;
}
fieldset:disabled button {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
