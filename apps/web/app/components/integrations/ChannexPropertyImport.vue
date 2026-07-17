<script setup lang="ts">
type ImportedProperty = {
  id: number
  channexId: string
  name: string
  lastSyncedAt: string | null
}

const props = defineProps<{
  networkId: number
  connected: boolean
}>()

const emit = defineEmits<{
  imported: []
}>()

const busy = ref(false)
const error = ref<string | null>(null)
const summary = ref<string | null>(null)
const properties = ref<ImportedProperty[]>([])

async function runImport() {
  busy.value = true
  error.value = null
  summary.value = null
  try {
    const res = await $fetch<{
      skipped?: true
      properties?: { imported: number; updated: number }
      roomTypes?: { imported: number; updated: number }
      catalog?: ImportedProperty[]
    }>('/api/channex/import', {
      method: 'POST',
      body: { networkId: props.networkId },
    })

    if (res.skipped) {
      summary.value = 'Import already running — try again in a moment.'
    } else {
      properties.value = res.catalog ?? []
      const pStats = res.properties ?? { imported: 0, updated: 0 }
      const rt = res.roomTypes ?? { imported: 0, updated: 0 }
      summary.value = `Imported ${pStats.imported} properties (${pStats.updated} updated), ${rt.imported} room types (${rt.updated} updated).`
      emit('imported')
    }
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Import failed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <div>
        <h2>Property & room type import</h2>
        <p>Pull Channex catalog into local mappings and seed sync-health rows.</p>
      </div>
      <button
        type="button"
        class="btn-secondary"
        :disabled="!connected || busy"
        @click="runImport"
      >
        {{ busy ? 'Importing…' : 'Import catalog' }}
      </button>
    </div>

    <p v-if="!connected" class="hint">Connect an API key before importing inventory.</p>
    <p v-if="summary" class="msg healthy" role="status">{{ summary }}</p>
    <p v-if="error" class="msg failed" role="alert">{{ error }}</p>

    <ul v-if="properties.length" class="prop-list">
      <li v-for="p in properties" :key="p.id">
        <strong>{{ p.name }}</strong>
        <small>{{ p.channexId }}</small>
        <em>{{ p.lastSyncedAt ? 'Synced' : 'Pending' }}</em>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.panel {
  margin-top: 1.6rem;
  padding: 1.25rem 0 0;
  border-top: 1px solid var(--line);
}

.panel-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
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

.btn-secondary {
  flex-shrink: 0;
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--line-strong);
  border-radius: calc(var(--radius) - 0.25rem);
  background: var(--surface-raised);
  color: var(--ink);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.hint {
  margin: 1rem 0 0;
  color: var(--muted);
  font-size: 0.7rem;
}

.msg {
  margin: 0.9rem 0 0;
  font-size: 0.7rem;
}

.healthy {
  color: var(--accent);
}

.failed {
  color: var(--danger);
}

.prop-list {
  list-style: none;
  margin: 1rem 0 0;
  padding: 0;
  border-top: 1px solid var(--line);
}

.prop-list li {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.8rem;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--line);
}

.prop-list strong {
  font-size: 0.78rem;
}

.prop-list small,
.prop-list em {
  color: var(--muted);
  font-size: 0.66rem;
  font-style: normal;
}

@media (max-width: 640px) {
  .panel-head {
    flex-direction: column;
  }

  .prop-list li {
    grid-template-columns: 1fr;
    gap: 0.2rem;
  }
}
</style>
