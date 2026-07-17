<script setup lang="ts">
import type { AutomationAction, AutomationTrigger } from '@pms/domain'

defineProps<{
  triggers: readonly string[]
  properties: { id: number; name: string }[]
  busy?: boolean
}>()

const emit = defineEmits<{
  create: [
    payload: {
      name: string
      trigger: AutomationTrigger
      propertyId: number | null
      channel: string
      actionType: AutomationAction['type']
      actionText: string
    },
  ]
}>()

const name = ref('')
const trigger = ref<string>('booking_created')
const propertyId = ref<number | 'all'>('all')
const channel = ref('')
const actionType = ref<AutomationAction['type']>('createTask')
const actionText = ref('Prepare unit for arrival')

function submit() {
  if (!name.value.trim() || !actionText.value.trim()) return
  emit('create', {
    name: name.value.trim(),
    trigger: trigger.value as AutomationTrigger,
    propertyId: propertyId.value === 'all' ? null : Number(propertyId.value),
    channel: channel.value.trim(),
    actionType: actionType.value,
    actionText: actionText.value.trim(),
  })
  name.value = ''
  actionText.value =
    actionType.value === 'queueGuestMessage'
      ? 'Thanks for booking with us'
      : 'Prepare unit for arrival'
}

watch(actionType, (t) => {
  if (t === 'queueGuestMessage' && actionText.value.startsWith('Prepare')) {
    actionText.value = 'Thanks for booking with us'
  }
})
</script>

<template>
  <form class="editor" @submit.prevent="submit">
    <h2>New rule</h2>
    <p class="hint">Deterministic trigger → conditions → domain command actions. No LLM.</p>
    <div class="grid">
      <label>
        Name
        <input v-model="name" required placeholder="Turnover on booking" />
      </label>
      <label>
        Trigger
        <select v-model="trigger">
          <option v-for="t in triggers" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>
      <label>
        Property filter
        <select v-model="propertyId">
          <option value="all">Any accessible</option>
          <option v-for="p in properties" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>
      <label>
        Channel filter
        <input v-model="channel" placeholder="optional, e.g. airbnb" />
      </label>
      <label>
        Action
        <select v-model="actionType">
          <option value="createTask">createTask</option>
          <option value="notifyStaff">notifyStaff</option>
          <option value="queueGuestMessage">queueGuestMessage (approval)</option>
        </select>
      </label>
      <label>
        {{
          actionType === 'createTask'
            ? 'Task title'
            : actionType === 'notifyStaff'
              ? 'Staff message'
              : 'Guest message body'
        }}
        <input v-model="actionText" required />
      </label>
    </div>
    <button type="submit" :disabled="busy">Create rule</button>
  </form>
</template>

<style scoped>
.editor {
  padding: 1.1rem 1.2rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(13, 24, 22, 0.55);
}
.editor h2 {
  margin: 0 0 0.25rem;
  font-size: 0.95rem;
}
.hint {
  margin: 0 0 0.9rem;
  color: var(--muted);
  font-size: 0.72rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
input,
select {
  padding: 0.45rem 0.55rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: rgba(0, 0, 0, 0.25);
  color: var(--fg);
  font-size: 0.8rem;
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
}
button {
  margin-top: 0.9rem;
  padding: 0.5rem 0.9rem;
  border: 0;
  border-radius: var(--radius);
  background: var(--accent);
  color: #06241c;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
@media (max-width: 720px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
