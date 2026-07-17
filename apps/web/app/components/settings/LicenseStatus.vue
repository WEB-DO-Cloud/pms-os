<script setup lang="ts">
import type { BillingSnapshot } from '@pms/licensing'

defineProps<{
  billing: BillingSnapshot | null
}>()
</script>

<template>
  <section v-if="billing" class="license" aria-label="License entitlements">
    <div class="edition">
      <span>{{ billing.edition === 'commercial' ? 'Commercial' : 'Community' }}</span>
      <strong>{{ billing.planLabel }}</strong>
    </div>
    <ul>
      <li v-for="f in billing.commercialFeatures" :key="f.id">
        <div>
          <strong>{{ f.label }}</strong>
          <p>{{ f.description }}</p>
        </div>
        <em :class="f.enabled ? 'on' : 'off'">{{ f.enabled ? 'Enabled' : 'Not entitled' }}</em>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.license {
  display: grid;
  gap: 1rem;
}
.edition {
  display: grid;
  gap: 0.25rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}
.edition span {
  color: var(--accent);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}
li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  padding: 0.9rem 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}
li p {
  margin: 0.25rem 0 0;
  color: var(--muted);
  font-size: 0.72rem;
}
em {
  font-style: normal;
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
}
em.on {
  color: var(--accent-strong);
}
em.off {
  color: var(--faint);
}
</style>
