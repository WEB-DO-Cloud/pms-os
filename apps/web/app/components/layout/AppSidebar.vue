<script setup lang="ts">
import type { Component } from 'vue'
import {
  BadgeDollarSign,
  BookMarked,
  Building2,
  CalendarDays,
  Circle,
  CreditCard,
  Home,
  Inbox,
  LayoutDashboard,
  LineChart,
  ListTodo,
  LogOut,
  Settings,
  Star,
  Users,
  Workflow,
} from '@lucide/vue'
import { buildSidebarItems, type SidebarItem } from '../../utils/navigation'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const route = useRoute()
const { principal, userName, brandAccent } = useCurrentNetwork()
const items = computed(() => buildSidebarItems(principal.value))
const settingsOpen = ref(route.path.startsWith('/settings'))

const roleLabel = computed(() => {
  const role = principal.value?.role
  if (!role) return 'Signed in'
  return role
    .split('_')
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ')
})

const initials = computed(() => {
  const source = userName.value || principal.value?.email || '?'
  const parts = source.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
})

const accountLabel = computed(
  () => userName.value || principal.value?.email || 'Account',
)

async function onSignOut() {
  const { authClient } = await import('~/utils/auth-client')
  await authClient.signOut()
  window.location.replace('/login')
}

const NAV_ICONS: Record<string, Component> = {
  Dashboard: LayoutDashboard,
  Calendar: CalendarDays,
  Reservations: BookMarked,
  Inbox,
  Tasks: ListTodo,
  Properties: Building2,
  Rates: BadgeDollarSign,
  Reports: LineChart,
  Automation: Workflow,
  Guests: Users,
  Reviews: Star,
  Payments: CreditCard,
  Settings,
  'Owner portal': Home,
}

const itemIcon = (item: SidebarItem) => NAV_ICONS[item.label] ?? Circle

watch(
  brandAccent,
  (accent) => {
    if (!import.meta.client) return
    document.documentElement.style.setProperty(
      '--brand-accent',
      accent || '',
    )
  },
  { immediate: true },
)

watch(
  () => route.path,
  (path) => {
    if (path.startsWith('/settings')) settingsOpen.value = true
    emit('close')
  },
)

const isActive = (item: SidebarItem) =>
  item.to === '/dashboard'
    ? route.path === '/dashboard' || route.path === '/'
    : route.path === item.to || route.path.startsWith(`${item.to}/`)
</script>

<template>
  <aside id="app-sidebar" class="sidebar" :class="{ open }">
    <LayoutNetworkSwitcher />

    <nav aria-label="Main navigation">
      <template v-for="item in items" :key="item.label">
        <div v-if="item.children" class="settings-group">
          <button
            class="nav-item settings-toggle"
            :class="{ active: route.path.startsWith('/settings') }"
            type="button"
            :aria-expanded="settingsOpen"
            @click="settingsOpen = !settingsOpen"
          >
            <span class="nav-glyph" aria-hidden="true">
              <component :is="itemIcon(item)" :size="15" :stroke-width="1.85" />
            </span>
            <span>{{ item.label }}</span>
            <span class="chevron" :class="{ expanded: settingsOpen }">⌄</span>
          </button>
          <div v-show="settingsOpen" class="subnav">
            <NuxtLink
              v-for="child in item.children"
              :key="child.to"
              class="subnav-item"
              :class="{ active: isActive(child) }"
              :to="child.to"
            >
              {{ child.label }}
            </NuxtLink>
          </div>
        </div>

        <NuxtLink
          v-else
          class="nav-item"
          :class="{ active: isActive(item) }"
          :to="item.to"
        >
          <span class="nav-glyph" aria-hidden="true">
            <component :is="itemIcon(item)" :size="15" :stroke-width="1.85" />
          </span>
          <span>{{ item.label }}</span>
          <span v-if="item.badge" class="badge">{{ item.badge }}</span>
        </NuxtLink>
      </template>
    </nav>

    <div class="sidebar-foot">
      <div class="account">
        <span class="avatar" aria-hidden="true">{{ initials }}</span>
        <span class="account-copy">
          <strong>{{ accountLabel }}</strong>
          <small>{{ roleLabel }}</small>
        </span>
      </div>
      <button
        type="button"
        class="sign-out"
        aria-label="Sign out"
        title="Sign out"
        @click="onSignOut"
      >
        <LogOut :size="17" :stroke-width="1.85" />
      </button>
    </div>
  </aside>
  <button
    v-if="open"
    class="sidebar-scrim"
    type="button"
    aria-label="Close navigation"
    @click="emit('close')"
  />
</template>

<style scoped>
.sidebar {
  position: fixed;
  z-index: 40;
  inset: 0 auto 0 0;
  display: flex;
  width: var(--sidebar-width);
  flex-direction: column;
  padding: 1.1rem 0.9rem;
  border-right: 1px solid var(--line);
  background:
    linear-gradient(160deg, rgba(21, 47, 40, 0.27), transparent 35%),
    #091311;
}

nav {
  overflow-y: auto;
  margin-top: 1rem;
  scrollbar-width: thin;
}

.nav-item {
  position: relative;
  display: grid;
  width: 100%;
  min-height: 2.3rem;
  grid-template-columns: 1.5rem 1fr auto;
  align-items: center;
  gap: 0.55rem;
  padding: 0.3rem 0.65rem;
  border: 0;
  border-radius: 0.5rem;
  color: var(--muted);
  background: transparent;
  font-size: 0.78rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease;
}

.nav-item:hover {
  color: var(--ink);
  background: rgba(255, 255, 255, 0.035);
}

.nav-item.active {
  color: var(--ink);
  background: var(--accent-soft);
}

.nav-item.active::before {
  position: absolute;
  left: -0.9rem;
  width: 2px;
  height: 1.2rem;
  border-radius: 2px;
  background: var(--accent);
  content: '';
}

.nav-glyph {
  display: grid;
  place-items: center;
  color: var(--faint);
}

.nav-glyph :deep(svg) {
  display: block;
}

.active .nav-glyph {
  color: var(--accent);
}

.badge {
  min-width: 1.2rem;
  padding: 0.08rem 0.32rem;
  border-radius: 1rem;
  color: var(--accent-strong);
  background: rgba(101, 213, 174, 0.15);
  font-size: 0.6rem;
  text-align: center;
}

.chevron {
  color: var(--faint);
  font-size: 0.9rem;
  transition: transform 150ms ease;
}

.chevron.expanded {
  transform: rotate(180deg);
}

.subnav {
  margin: 0.15rem 0 0.35rem 2.45rem;
  padding-left: 0.8rem;
  border-left: 1px solid var(--line);
}

.subnav-item {
  display: block;
  padding: 0.42rem 0.25rem;
  color: var(--faint);
  font-size: 0.7rem;
  transition: color 150ms ease;
}

.subnav-item:hover,
.subnav-item.active {
  color: var(--ink);
}

.subnav-item.active {
  font-weight: 600;
}

.sidebar-foot {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: auto;
  padding: 0.85rem 0.55rem 0.2rem;
  border-top: 1px solid var(--line);
}

.account {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
  flex: 1;
}

.avatar {
  display: grid;
  width: 2.05rem;
  height: 2.05rem;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(101, 213, 174, 0.35);
  border-radius: 50%;
  color: var(--accent-strong);
  background: var(--accent-soft);
  font-size: 0.66rem;
  font-weight: 700;
}

.account-copy {
  min-width: 0;
}

.account-copy strong,
.account-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-copy strong {
  font-size: 0.78rem;
  font-weight: 650;
}

.account-copy small {
  margin-top: 0.12rem;
  color: var(--faint);
  font-size: 0.62rem;
}

.sign-out {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  padding: 0.45rem;
  border: 0;
  border-radius: 0.45rem;
  color: var(--faint);
  background: transparent;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease;
}

.sign-out :deep(svg) {
  display: block;
}

.sign-out:hover {
  color: var(--danger);
  background: rgba(255, 92, 92, 0.1);
}

.sidebar-scrim {
  position: fixed;
  z-index: 35;
  inset: 0;
  display: none;
  border: 0;
  background: rgba(0, 0, 0, 0.58);
}

@media (max-width: 980px) {
  .sidebar {
    transform: translateX(-102%);
    transition: transform 180ms ease;
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .sidebar-scrim {
    display: block;
  }
}
</style>
