<script setup lang="ts">
definePageMeta({ layout: 'super-admin' })

const [{ data: users }, { data: subs }] = await Promise.all([
  useFetch('/api/super-admin/users', { key: 'sa-users-overview' }),
  useFetch('/api/super-admin/subscriptions', { key: 'sa-subs-overview' }),
])

const stats = computed(() => ({
  users: users.value?.users.length ?? 0,
  networks: subs.value?.networks.length ?? 0,
  whiteLabel:
    subs.value?.networks.filter((n) => n.entitlements.whiteLabel).length ?? 0,
  multiNetwork:
    subs.value?.networks.filter((n) => n.entitlements.multiNetwork).length ?? 0,
}))
</script>

<template>
  <div class="overview">
    <p class="lede">
      Manage commercial tenants, subscription entitlements, and support
      impersonation.
    </p>

    <div class="cards">
      <article>
        <small>Users</small>
        <strong>{{ stats.users }}</strong>
      </article>
      <article>
        <small>Networks</small>
        <strong>{{ stats.networks }}</strong>
      </article>
      <article>
        <small>White-label</small>
        <strong>{{ stats.whiteLabel }}</strong>
      </article>
      <article>
        <small>Multi-network</small>
        <strong>{{ stats.multiNetwork }}</strong>
      </article>
    </div>

    <div class="links">
      <NuxtLink to="/super_admin/users">Manage users →</NuxtLink>
      <NuxtLink to="/super_admin/subscriptions">Manage subscriptions →</NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.lede {
  margin: 0 0 1.25rem;
  max-width: 40rem;
  color: var(--muted);
  line-height: 1.5;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}
article {
  padding: 1rem 1.1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}
small {
  display: block;
  color: var(--faint);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
strong {
  display: block;
  margin-top: 0.35rem;
  font-family: Manrope, sans-serif;
  font-size: 1.6rem;
}
.links {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}
.links a {
  color: var(--accent-strong);
  font-weight: 600;
  text-decoration: none;
}
</style>
