<script setup lang="ts">
definePageMeta({ layout: 'super-admin' })

type SaNetwork = {
  id: number
  name: string
  slug: string
  isActive: boolean
  channexGroupId: string | null
  entitlements: { multiNetwork: boolean; whiteLabel: boolean }
  billing: { edition: string; planLabel: string }
}

const { data, refresh } = await useFetch<{ networks: SaNetwork[] }>(
  '/api/super-admin/subscriptions',
  { key: 'sa-subscriptions' },
)

const error = ref('')
const pendingId = ref<number | null>(null)

async function patch(
  network: SaNetwork,
  body: Partial<{
    multiNetwork: boolean
    whiteLabel: boolean
    isActive: boolean
    channexGroupId: string | null
  }>,
) {
  pendingId.value = network.id
  error.value = ''
  try {
    await $fetch(`/api/super-admin/subscriptions/${network.id}`, {
      method: 'PATCH',
      body,
    })
    await refresh()
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    error.value = err?.data?.statusMessage || err?.message || 'Update failed'
  } finally {
    pendingId.value = null
  }
}
</script>

<template>
  <div class="subs">
    <p class="lede">
      Toggle commercial entitlements per network. White-label unlocks logo
      branding; multi-network unlocks network switching.
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Network</th>
            <th>Plan</th>
            <th>Active</th>
            <th>White-label</th>
            <th>Multi-network</th>
            <th>Channex group</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="n in data?.networks ?? []" :key="n.id">
            <td>
              <strong>{{ n.name }}</strong>
              <small>{{ n.slug }}</small>
            </td>
            <td>
              <span class="pill">{{ n.billing.planLabel }}</span>
            </td>
            <td>
              <label class="switch">
                <input
                  type="checkbox"
                  :checked="n.isActive"
                  :disabled="pendingId === n.id"
                  @change="
                    patch(n, {
                      isActive: ($event.target as HTMLInputElement).checked,
                    })
                  "
                />
                <span>{{ n.isActive ? 'On' : 'Off' }}</span>
              </label>
            </td>
            <td>
              <label class="switch">
                <input
                  type="checkbox"
                  :checked="n.entitlements.whiteLabel"
                  :disabled="pendingId === n.id"
                  @change="
                    patch(n, {
                      whiteLabel: ($event.target as HTMLInputElement).checked,
                    })
                  "
                />
                <span>{{ n.entitlements.whiteLabel ? 'On' : 'Off' }}</span>
              </label>
            </td>
            <td>
              <label class="switch">
                <input
                  type="checkbox"
                  :checked="n.entitlements.multiNetwork"
                  :disabled="pendingId === n.id"
                  @change="
                    patch(n, {
                      multiNetwork: ($event.target as HTMLInputElement).checked,
                    })
                  "
                />
                <span>{{ n.entitlements.multiNetwork ? 'On' : 'Off' }}</span>
              </label>
            </td>
            <td>
              <input
                class="group-input"
                type="text"
                placeholder="Channex group UUID"
                :value="n.channexGroupId ?? ''"
                :disabled="pendingId === n.id"
                @change="
                  patch(n, {
                    channexGroupId: ($event.target as HTMLInputElement).value || null,
                  })
                "
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.lede {
  margin: 0 0 1rem;
  max-width: 40rem;
  color: var(--muted);
  line-height: 1.45;
}
.error {
  color: var(--danger);
}
.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
th,
td {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: middle;
}
th {
  color: var(--faint);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
td strong,
td small {
  display: block;
}
td small {
  margin-top: 0.2rem;
  color: var(--muted);
}
.pill {
  display: inline-block;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 0.68rem;
  font-weight: 700;
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--muted);
  font-size: 0.78rem;
  cursor: pointer;
}
.group-input {
  width: 15rem;
  max-width: 100%;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--line-strong);
  border-radius: calc(var(--radius) - 0.25rem);
  background: var(--surface);
  color: var(--ink);
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
}
</style>
