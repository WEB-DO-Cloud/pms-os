<script setup lang="ts">
const props = defineProps<{
  properties: { id: number; name: string }[]
  busy?: boolean
}>()

const emit = defineEmits<{
  created: []
  error: [msg: string]
}>()

const title = ref('')
const propertyId = ref<number | null>(null)
const category = ref('cleaning')
const assignedToUserId = ref('')

watch(
  () => props.properties,
  (list) => {
    if (propertyId.value == null && list[0]) propertyId.value = list[0].id
  },
  { immediate: true },
)

async function submit() {
  if (!title.value.trim() || propertyId.value == null) {
    emit('error', 'Title and property are required')
    return
  }
  const { currentNetworkId } = useCurrentNetwork()
  try {
    await $fetch('/api/tasks', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        title: title.value.trim(),
        propertyId: propertyId.value,
        category: category.value,
        assignedToUserId: assignedToUserId.value.trim() || null,
      },
    })
    title.value = ''
    assignedToUserId.value = ''
    emit('created')
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string }
    emit('error', e?.data?.statusMessage ?? e?.statusMessage ?? 'Create failed')
  }
}
</script>

<template>
  <form class="form" @submit.prevent="submit">
    <label>
      New task
      <input v-model="title" type="text" placeholder="Turnover clean" :disabled="busy" />
    </label>
    <label>
      Property
      <select v-model="propertyId" :disabled="busy">
        <option v-for="p in properties" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </label>
    <label>
      Category
      <select v-model="category" :disabled="busy">
        <option value="cleaning">Cleaning</option>
        <option value="maintenance">Maintenance</option>
        <option value="inspection">Inspection</option>
        <option value="other">Other</option>
      </select>
    </label>
    <label>
      Assign to
      <input v-model="assignedToUserId" type="text" placeholder="user id" :disabled="busy" />
    </label>
    <button type="submit" :disabled="busy">Create</button>
  </form>
</template>

<style scoped>
.form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: end;
}
label {
  display: grid;
  gap: 0.3rem;
  color: var(--faint);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
input,
select,
button {
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--ink);
  font-size: 0.72rem;
}
button {
  border-color: rgba(101, 213, 174, 0.45);
  color: var(--accent-strong);
  font-weight: 600;
  cursor: pointer;
}
</style>
