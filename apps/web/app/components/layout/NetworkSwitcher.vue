<script setup lang="ts">
import { Check, ChevronsUpDown, Plus } from '@lucide/vue'

const {
  networks,
  currentNetworkId,
  canSwitchNetworks,
  canCreateNetwork,
  switchNetwork,
  createNetwork,
  brandName,
  brandLogoUrl,
  brandAccent,
  brandTagline,
} = useCurrentNetwork()

const menuOpen = ref(false)
const showCreate = ref(false)
const newNetworkName = ref('')
const creating = ref(false)
const createError = ref<string | null>(null)

const brandInitial = computed(() => {
  const source = brandName.value.trim()
  return (source[0] ?? 'P').toUpperCase()
})

function toggleMenu() {
  if (!canSwitchNetworks.value) return
  menuOpen.value = !menuOpen.value
  if (!menuOpen.value) {
    showCreate.value = false
    createError.value = null
  }
}

function closeMenu() {
  menuOpen.value = false
  showCreate.value = false
  createError.value = null
  newNetworkName.value = ''
}

async function pickNetwork(id: number) {
  closeMenu()
  if (id === currentNetworkId.value) return
  await switchNetwork(id)
}

function startCreate() {
  showCreate.value = true
  createError.value = null
  newNetworkName.value = ''
}

async function submitCreate() {
  creating.value = true
  createError.value = null
  try {
    await createNetwork(newNetworkName.value.trim())
    closeMenu()
  } catch (err: unknown) {
    const e = err as {
      data?: { statusMessage?: string }
      statusMessage?: string
      message?: string
    }
    createError.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Could not create network'
  } finally {
    creating.value = false
  }
}

function cancelCreate() {
  showCreate.value = false
  createError.value = null
  newNetworkName.value = ''
}

function onDocPointerDown(event: PointerEvent) {
  const root = (event.target as HTMLElement | null)?.closest?.('.brand-switcher')
  if (!root) closeMenu()
}

onMounted(() => {
  if (!import.meta.client) return
  document.addEventListener('pointerdown', onDocPointerDown)
})
onUnmounted(() => {
  if (!import.meta.client) return
  document.removeEventListener('pointerdown', onDocPointerDown)
})
</script>

<template>
  <div class="brand-switcher">
    <button
      v-if="canSwitchNetworks"
      type="button"
      class="brand brand-trigger"
      :aria-expanded="menuOpen"
      aria-haspopup="listbox"
      aria-label="Current network"
      @click="toggleMenu"
    >
      <span
        class="brand-symbol"
        :style="brandAccent ? { background: brandAccent } : undefined"
      >
        <img
          v-if="brandLogoUrl"
          class="brand-logo"
          :src="brandLogoUrl"
          :alt="brandName"
        />
        <template v-else>{{ brandInitial }}</template>
      </span>
      <span class="brand-name">
        <strong>{{ brandName }}</strong>
        <small>{{ brandTagline }}</small>
      </span>
      <ChevronsUpDown class="brand-chevrons" :size="16" :stroke-width="1.85" aria-hidden="true" />
    </button>

    <div v-else class="brand" aria-label="Current network">
      <span
        class="brand-symbol"
        :style="brandAccent ? { background: brandAccent } : undefined"
      >
        <img
          v-if="brandLogoUrl"
          class="brand-logo"
          :src="brandLogoUrl"
          :alt="brandName"
        />
        <template v-else>{{ brandInitial }}</template>
      </span>
      <span class="brand-name">
        <strong>{{ brandName }}</strong>
        <small>{{ brandTagline }}</small>
      </span>
    </div>

    <div
      v-if="canSwitchNetworks && menuOpen"
      class="brand-menu"
      role="listbox"
      aria-label="Networks"
    >
      <template v-if="!showCreate">
        <button
          v-for="network in networks"
          :key="network.id"
          type="button"
          class="menu-item"
          role="option"
          :aria-selected="network.id === currentNetworkId"
          @click="pickNetwork(network.id)"
        >
          <span class="menu-label">{{ network.name }}</span>
          <Check
            v-if="network.id === currentNetworkId"
            class="menu-check"
            :size="15"
            :stroke-width="2"
            aria-hidden="true"
          />
        </button>
        <button
          v-if="canCreateNetwork"
          type="button"
          class="menu-item menu-add"
          @click="startCreate"
        >
          <Plus :size="15" :stroke-width="1.85" aria-hidden="true" />
          <span>Add network…</span>
        </button>
      </template>

      <div v-else class="create-dialog" role="dialog" aria-label="Create network">
        <label>
          <span>New network name</span>
          <input
            v-model="newNetworkName"
            type="text"
            required
            maxlength="80"
            placeholder="e.g. Palm Hills Group"
            @keydown.enter.prevent="submitCreate"
            @keydown.escape.prevent="cancelCreate"
          />
        </label>
        <p v-if="createError" class="err" role="alert">{{ createError }}</p>
        <div class="create-actions">
          <button type="button" class="ghost" :disabled="creating" @click="cancelCreate">
            Cancel
          </button>
          <button
            type="button"
            class="primary"
            :disabled="creating || newNetworkName.trim().length < 2"
            @click="submitCreate"
          >
            {{ creating ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.brand-switcher {
  position: relative;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  min-height: 3.3rem;
  padding: 0 0.55rem;
  border: 0;
  border-radius: 0.55rem;
  color: inherit;
  background: transparent;
  text-align: left;
}

.brand-trigger {
  cursor: pointer;
  transition: background 150ms ease;
}

.brand-trigger:hover {
  background: rgba(255, 255, 255, 0.035);
}

.brand-symbol {
  display: grid;
  width: 2.1rem;
  height: 2.1rem;
  flex: 0 0 auto;
  place-items: center;
  overflow: hidden;
  border-radius: 0.55rem 0.55rem 0.55rem 0.15rem;
  color: #07100f;
  background: var(--brand-accent, var(--accent));
  font-family: 'Manrope', sans-serif;
  font-weight: 800;
}

.brand-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.brand-name {
  min-width: 0;
  flex: 1;
}

.brand-name strong,
.brand-name small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-name strong {
  font-family: 'Manrope', sans-serif;
  font-size: 0.9rem;
  letter-spacing: -0.02em;
}

.brand-name small {
  margin-top: 0.05rem;
  color: var(--faint);
  font-size: 0.62rem;
}

.brand-chevrons {
  flex: 0 0 auto;
  color: var(--faint);
}

.brand-menu {
  position: absolute;
  z-index: 40;
  top: calc(100% + 0.35rem);
  left: 0;
  right: 0;
  display: grid;
  gap: 0.15rem;
  padding: 0.4rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.55rem 0.6rem;
  border: 0;
  border-radius: 0.4rem;
  color: var(--ink);
  background: transparent;
  font-size: 0.8rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.menu-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-check {
  flex: 0 0 auto;
  color: var(--accent);
}

.menu-add {
  margin-top: 0.15rem;
  border-top: 1px solid var(--line);
  border-radius: 0 0 0.4rem 0.4rem;
  color: var(--muted);
  font-weight: 500;
}

.create-dialog {
  display: grid;
  gap: 0.65rem;
  padding: 0.45rem 0.35rem 0.35rem;
}

.create-dialog label > span {
  display: block;
  margin-bottom: 0.3rem;
  color: var(--faint);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.create-dialog input {
  width: 100%;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--line-strong);
  border-radius: 0.4rem;
  background: var(--surface-raised);
  color: var(--ink);
  font-size: 0.82rem;
}

.create-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.create-actions button {
  padding: 0.4rem 0.75rem;
  border-radius: 0.4rem;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.create-actions .ghost {
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--ink);
}

.create-actions .primary {
  border: 0;
  background: var(--accent);
  color: #04201a;
}

.create-actions button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.err {
  margin: 0;
  color: var(--danger);
  font-size: 0.72rem;
}
</style>
