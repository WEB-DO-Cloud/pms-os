<script setup lang="ts">
const route = useRoute()

const tabs = [
  { to: '/super_admin', label: 'Overview', exact: true },
  { to: '/super_admin/users', label: 'Users' },
  { to: '/super_admin/subscriptions', label: 'Subscriptions' },
]

const { data: me, error } = await useFetch('/api/super-admin/me', {
  key: 'super-admin-me',
})

if (error.value || !me.value?.isSuperAdmin) {
  await navigateTo('/dashboard', { replace: true })
}
</script>

<template>
  <div class="sa-shell">
    <header class="sa-top">
      <div>
        <p class="eyebrow">Commercial SaaS</p>
        <h1>Super admin</h1>
      </div>
      <NuxtLink class="back" to="/dashboard">← Back to app</NuxtLink>
    </header>

    <nav class="sa-tabs" aria-label="Super admin sections">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="tab"
        :class="{
          active: tab.exact
            ? route.path === tab.to
            : route.path.startsWith(tab.to),
        }"
      >
        {{ tab.label }}
      </NuxtLink>
    </nav>

    <main>
      <slot />
    </main>
  </div>
</template>

<style scoped>
.sa-shell {
  min-height: 100vh;
  padding: 1.5rem clamp(1rem, 3vw, 2.5rem) 3rem;
  background:
    radial-gradient(circle at 10% 0%, rgba(101, 213, 174, 0.1), transparent 24rem),
    var(--canvas);
}
.sa-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.eyebrow {
  margin: 0 0 0.35rem;
  color: var(--faint);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
h1 {
  margin: 0;
  font-family: Manrope, sans-serif;
  font-size: 1.7rem;
}
.back {
  color: var(--accent-strong);
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
}
.sa-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-bottom: 1.5rem;
}
.tab {
  padding: 0.45rem 0.85rem;
  border: 1px solid var(--line);
  border-radius: 0.55rem;
  color: var(--muted);
  background: var(--surface);
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
}
.tab.active {
  color: var(--ink);
  border-color: rgba(101, 213, 174, 0.45);
  background: var(--accent-soft);
}
</style>
