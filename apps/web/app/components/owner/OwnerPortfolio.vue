<script setup lang="ts">
export type OwnerPropertyRow = {
  id: number
  name: string
  city: string | null
  country: string | null
  currency: string | null
}

defineProps<{
  properties: OwnerPropertyRow[]
}>()
</script>

<template>
  <section class="portfolio" aria-label="Owner properties">
    <h2>Your properties</h2>
    <ul v-if="properties.length">
      <li v-for="p in properties" :key="p.id">
        <strong>{{ p.name }}</strong>
        <span>
          {{ [p.city, p.country].filter(Boolean).join(', ') || 'Location unset' }}
        </span>
        <small v-if="p.currency">{{ p.currency }}</small>
      </li>
    </ul>
    <p v-else class="empty">No properties assigned to your owner account.</p>
  </section>
</template>

<style scoped>
.portfolio h2 {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}
li {
  display: grid;
  gap: 0.15rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}
strong {
  font-size: 0.9rem;
}
span,
small {
  color: var(--muted);
  font-size: 0.72rem;
}
.empty {
  color: var(--muted);
  font-size: 0.78rem;
}
</style>
