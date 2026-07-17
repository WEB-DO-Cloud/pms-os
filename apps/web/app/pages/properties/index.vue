<script setup lang="ts">
import type { PropertyListRow } from '~/components/properties/PropertyTable.vue'

const { currentNetworkId } = useCurrentNetwork()
const includeArchived = ref(false)
const rows = ref<PropertyListRow[]>([])
const error = ref<string | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{ properties: PropertyListRow[] }>('/api/properties', {
      query: {
        networkId: currentNetworkId.value,
        includeArchived: includeArchived.value ? '1' : '0',
      },
    })
    rows.value = res.properties
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load properties'
    rows.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([currentNetworkId, includeArchived], () => {
  void load()
})
</script>

<template>
  <div class="page-shell">
    <header class="head">
      <div>
        <p class="eyebrow">Portfolio</p>
        <h1>Properties</h1>
        <p class="page-intro">
          Synced Channex properties with PMS-owned check-in times, notes, and archive state.
        </p>
      </div>
    </header>

    <div class="section-rule" />

    <div class="toolbar">
      <label class="check">
        <input v-model="includeArchived" type="checkbox" />
        Show archived
      </label>
    </div>

    <p v-if="error" class="gate" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="muted">Loading properties…</p>

    <PropertiesPropertyTable :rows="rows" />
  </div>
</template>

<style scoped>
.head {
  margin-bottom: 0.25rem;
}
.toolbar {
  margin-bottom: 1.25rem;
}
.check {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--muted);
  font-size: 0.72rem;
}
.gate {
  margin: 0 0 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(244, 127, 122, 0.35);
  border-radius: var(--radius);
  color: var(--danger);
  font-size: 0.72rem;
}
.muted {
  margin: 0 0 0.85rem;
  color: var(--muted);
  font-size: 0.66rem;
}
</style>
