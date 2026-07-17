<script setup lang="ts">
const { currentNetworkId, principal } = useCurrentNetwork()
const healthPanel = ref<{ refresh: () => Promise<void> } | null>(null)

const apiKeyConfigured = ref(false)
const webhookConfigured = ref(false)
const apiKeyMasked = ref<string | null>(null)
const webhookMasked = ref<string | null>(null)
const managed = ref(false)
const loadError = ref<string | null>(null)

const properties = ref<{ id: number; name: string }[]>([])

const canManage = computed(() =>
  principal.value?.role === 'org_admin' || principal.value?.role === 'manager',
)

const connected = computed(() => apiKeyConfigured.value || managed.value)

async function loadCredentials() {
  if (!canManage.value) return
  loadError.value = null
  try {
    const res = await $fetch<{
      managed?: boolean
      apiKey: { configured: boolean; masked: string | null }
      webhookSecret: { configured: boolean; masked: string | null }
    }>('/api/channex/credentials', {
      query: { networkId: currentNetworkId.value },
    })
    managed.value = res.managed === true
    apiKeyConfigured.value = res.apiKey.configured
    webhookConfigured.value = res.webhookSecret.configured
    apiKeyMasked.value = res.apiKey.masked
    webhookMasked.value = res.webhookSecret.masked
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    loadError.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load credentials'
  }
}

async function loadProperties() {
  if (!canManage.value || !currentNetworkId.value) return
  try {
    const res = await $fetch<{
      properties: { id: number; name: string }[]
    }>('/api/properties', {
      query: { networkId: currentNetworkId.value },
    })
    properties.value = res.properties.map((p) => ({ id: p.id, name: p.name }))
  } catch {
    properties.value = []
  }
}

function onSaved(payload: { apiKeyMasked: string | null; webhookMasked: string | null }) {
  apiKeyConfigured.value = true
  apiKeyMasked.value = payload.apiKeyMasked
  if (payload.webhookMasked) {
    webhookConfigured.value = true
    webhookMasked.value = payload.webhookMasked
  }
  void healthPanel.value?.refresh()
}

async function loadAll() {
  await loadCredentials()
  await loadProperties()
}

onMounted(loadAll)
watch(currentNetworkId, () => {
  void loadAll()
})
</script>

<template>
  <div class="page-shell module-page">
    <p class="eyebrow">Settings</p>
    <h1>Integrations</h1>
    <p class="page-intro">
      Connect Channex, link sales channels, and monitor credential, webhook, pull, and acknowledgement health.
    </p>

    <div class="section-rule" />

    <p v-if="!canManage" class="gate" role="alert">
      Integrations are limited to organization admins and managers.
    </p>

    <template v-else>
      <p v-if="loadError" class="gate failed" role="alert">{{ loadError }}</p>

      <p v-if="managed" class="managed-note" role="status">
        Channex is connected and managed by the platform. Your properties are
        provisioned for you — no API key needed. Use “Import catalog” to sync
        your inventory, or connect OTAs under Sales channels.
      </p>

      <IntegrationsChannexConnectForm
        v-else
        :network-id="currentNetworkId"
        :api-key-configured="apiKeyConfigured"
        :webhook-configured="webhookConfigured"
        :api-key-masked="apiKeyMasked"
        :webhook-masked="webhookMasked"
        @saved="onSaved"
      />

      <IntegrationsChannelConnect
        v-if="connected"
        :network-id="currentNetworkId"
        :properties="properties"
      />

      <IntegrationsChannexPropertyImport
        :network-id="currentNetworkId"
        :connected="connected"
        @imported="
          () => {
            healthPanel?.refresh()
            loadProperties()
          }
        "
      />

      <IntegrationsSyncHealthPanel
        ref="healthPanel"
        :network-id="currentNetworkId"
        :connected="connected"
      />
    </template>
  </div>
</template>

<style scoped>
.module-page {
  max-width: 72rem;
}

.gate {
  margin: 0;
  padding: 1rem 0;
  color: var(--muted);
  font-size: 0.78rem;
}

.gate.failed {
  color: var(--danger);
}

.managed-note {
  margin: 1.1rem 0 0;
  padding: 0.85rem 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-raised);
  color: var(--muted);
  font-size: 0.78rem;
  line-height: 1.5;
}
</style>
