<script setup lang="ts">
const props = defineProps<{
  title: string
  subtitle?: string
  disabledHint?: string | null
}>()
</script>

<template>
  <section class="ai-panel">
    <header class="ai-head">
      <div>
        <p class="eyebrow">AI · Grok</p>
        <h2>{{ title }}</h2>
        <p v-if="subtitle" class="sub">{{ subtitle }}</p>
      </div>
      <slot name="actions" />
    </header>
    <p v-if="disabledHint" class="disabled" role="status">{{ disabledHint }}</p>
    <slot />
  </section>
</template>

<style scoped>
.ai-panel {
  margin: 1rem 0 1.25rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(101, 213, 174, 0.28);
  border-radius: var(--radius);
  background: rgba(13, 24, 22, 0.72);
}
.ai-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.eyebrow {
  margin: 0;
  color: var(--faint);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
h2 {
  margin: 0.15rem 0 0;
  font-size: 0.95rem;
}
.sub {
  margin: 0.25rem 0 0;
  color: var(--muted);
  font-size: 0.7rem;
}
.disabled {
  margin: 0 0 0.65rem;
  color: var(--warning);
  font-size: 0.7rem;
}
</style>
