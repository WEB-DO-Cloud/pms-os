<script setup lang="ts">
import type { Component } from 'vue'
import {
  BookMarked,
  CalendarDays,
  LayoutDashboard,
  ListTodo,
  Menu,
} from '@lucide/vue'

const emit = defineEmits<{
  more: []
}>()

const {
  bottomActions,
  activeBottomTo,
  registerPushNotifications,
  lastPushLog,
} = useMobileShell()

onMounted(() => {
  // Permission + token smoke stub; no FCM keys required.
  void registerPushNotifications()
})

const ACTION_ICONS: Record<string, Component> = {
  Dashboard: LayoutDashboard,
  Tasks: ListTodo,
  Reservations: BookMarked,
  Calendar: CalendarDays,
}
</script>

<template>
  <nav class="mobile-bottom" aria-label="Mobile modules">
    <NuxtLink
      v-for="item in bottomActions"
      :key="item.to"
      class="action"
      :class="{ active: activeBottomTo === item.to }"
      :to="item.to"
    >
      <span class="glyph" aria-hidden="true">
        <component :is="ACTION_ICONS[item.label] ?? LayoutDashboard" :size="18" :stroke-width="1.9" />
      </span>
      <span class="label">{{ item.label }}</span>
    </NuxtLink>
    <button class="action more" type="button" @click="emit('more')">
      <span class="glyph" aria-hidden="true">
        <Menu :size="18" :stroke-width="1.9" />
      </span>
      <span class="label">More</span>
    </button>
    <p v-if="lastPushLog" class="sr-only" role="status">{{ lastPushLog }}</p>
  </nav>
</template>

<style scoped>
.mobile-bottom {
  position: fixed;
  z-index: 30;
  right: 0;
  bottom: 0;
  left: 0;
  display: none;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.15rem;
  padding: 0.45rem 0.35rem calc(0.45rem + env(safe-area-inset-bottom));
  border-top: 1px solid var(--line);
  background: rgba(7, 16, 15, 0.94);
  backdrop-filter: blur(16px);
}

.action {
  display: flex;
  min-height: 3rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  border: 0;
  border-radius: 0.55rem;
  color: var(--muted);
  background: transparent;
  font: inherit;
  text-decoration: none;
  cursor: pointer;
}

.action.active {
  color: var(--ink);
  background: var(--accent-soft);
}

.glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.label {
  font-size: 0.58rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

@media (max-width: 980px) {
  .mobile-bottom {
    display: grid;
  }
}
</style>
