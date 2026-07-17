<script setup lang="ts">
const sidebarOpen = ref(false)
</script>

<template>
  <div class="app-frame">
    <LayoutImpersonationBanner />
    <LayoutAppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />
    <div class="app-stage">
      <LayoutAppHeader
        :sidebar-open="sidebarOpen"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
      />
      <main>
        <slot />
      </main>
      <MobileBottomNav @more="sidebarOpen = true" />
    </div>
  </div>
</template>

<style scoped>
.app-frame {
  min-height: 100vh;
}

.app-stage {
  min-height: 100vh;
  margin-left: var(--sidebar-width);
}

main {
  min-height: 100vh;
}

@media (max-width: 980px) {
  .app-stage {
    margin-left: 0;
  }

  main {
    min-height: calc(100vh - 3.5rem);
    /* Room for MobileBottomNav + safe area */
    padding-bottom: calc(4.2rem + env(safe-area-inset-bottom));
  }
}
</style>
