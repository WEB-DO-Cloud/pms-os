<script setup lang="ts">
import { canAccessModule } from '@pms/auth'
import { Inbox } from '@lucide/vue'

defineProps<{
  sidebarOpen: boolean
}>()

const emit = defineEmits<{
  toggleSidebar: []
}>()

const { principal, currentNetworkId } = useCurrentNetwork()

const showInbox = computed(() =>
  canAccessModule(principal.value?.role, 'inbox'),
)

const unreadCount = ref(0)

async function loadUnread() {
  if (!showInbox.value || currentNetworkId.value == null) {
    unreadCount.value = 0
    return
  }
  try {
    const res = await $fetch<{ unreadCount: number }>('/api/inbox', {
      query: { networkId: currentNetworkId.value },
    })
    unreadCount.value = res.unreadCount
  } catch {
    unreadCount.value = 0
  }
}

const badgeLabel = computed(() =>
  unreadCount.value > 99 ? '99+' : String(unreadCount.value),
)

onMounted(loadUnread)
watch(currentNetworkId, () => {
  void loadUnread()
})
watch(showInbox, () => {
  void loadUnread()
})
</script>

<template>
  <header class="app-header">
    <button
      class="menu-button"
      type="button"
      :aria-expanded="sidebarOpen"
      aria-controls="app-sidebar"
      @click="emit('toggleSidebar')"
    >
      <span />
      <span />
      <span />
      <span class="sr-only">Toggle navigation</span>
    </button>

    <NuxtLink
      v-if="showInbox"
      class="inbox-button"
      to="/inbox"
      :aria-label="
        unreadCount > 0
          ? `Inbox, ${unreadCount} unread`
          : 'Inbox'
      "
    >
      <Inbox :size="20" :stroke-width="1.9" aria-hidden="true" />
      <span
        v-if="unreadCount > 0"
        class="inbox-badge"
        aria-hidden="true"
      >
        {{ badgeLabel }}
      </span>
    </NuxtLink>
  </header>
</template>

<style scoped>
/* Desktop + landscape tablet: sidebar is always visible — no top bar. */
.app-header {
  display: none;
}

/* Portrait tablet + mobile: hamburger + inbox. */
@media (max-width: 980px) {
  .app-header {
    position: sticky;
    z-index: 20;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 3.5rem;
    padding: 0 0.8rem;
    border-bottom: 1px solid var(--line);
    background: rgba(7, 16, 15, 0.86);
    backdrop-filter: blur(18px);
  }

  .menu-button {
    display: block;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0.65rem;
    border: 1px solid var(--line);
    border-radius: 0.65rem;
    color: var(--ink);
    background: transparent;
  }

  .menu-button > span:not(.sr-only) {
    display: block;
    height: 1px;
    margin: 0.23rem 0;
    background: currentColor;
  }

  .inbox-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    margin-left: auto;
    border: 1px solid var(--line);
    border-radius: 0.65rem;
    color: var(--ink);
    text-decoration: none;
  }

  .inbox-button:hover {
    border-color: var(--accent);
    color: var(--accent-strong);
  }

  .inbox-badge {
    position: absolute;
    top: -0.25rem;
    right: -0.25rem;
    min-width: 1.1rem;
    height: 1.1rem;
    padding: 0 0.28rem;
    border-radius: 999px;
    background: var(--danger, #e11d48);
    color: #fff;
    font-size: 0.58rem;
    font-weight: 800;
    line-height: 1.1rem;
    text-align: center;
    box-shadow: 0 0 0 2px rgba(7, 16, 15, 0.9);
  }
}
</style>
