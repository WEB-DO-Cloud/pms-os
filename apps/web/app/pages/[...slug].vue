<script setup lang="ts">
const route = useRoute()

const pageCopy: Record<string, { title: string; eyebrow: string; description: string }> = {
  // owner + core modules → dedicated pages (U8–U12)
}

const settingCopy: Record<string, { title: string; description: string }> = {
  // general + billing + integrations + team → dedicated pages
  notifications: { title: 'Notifications', description: 'Choose operational alert categories, delivery channels, and quiet hours.' },
  security: { title: 'Security', description: 'Sessions, two-factor authentication, login history, and security audit context.' },
  'api-webhooks': { title: 'API & Webhooks', description: 'API keys, webhook subscriptions, developer logs, and documentation links.' },
}

const segments = computed(() => route.path.split('/').filter(Boolean))
const isSettings = computed(() => segments.value[0] === 'settings')
const copy = computed(() => {
  if (isSettings.value) {
    const setting = settingCopy[segments.value[1] ?? ''] ?? {
      title: 'Settings',
      description: 'Workspace configuration for the remaining settings surfaces.',
    }
    return { ...setting, eyebrow: 'Settings' }
  }
  return pageCopy[segments.value[0] ?? ''] ?? {
    title: 'Module',
    eyebrow: 'PMS OS',
    description: 'This operational workspace is ready for its feature unit.',
  }
})
</script>

<template>
  <div class="page-shell module-page">
    <p class="eyebrow">{{ copy.eyebrow }}</p>
    <h1>{{ copy.title }}</h1>
    <p class="page-intro">{{ copy.description }}</p>

    <div class="section-rule" />
    <section class="module-empty">
      <span>U6 scaffold</span>
      <h2>The workspace is in place.</h2>
      <p>
        Feature workflows arrive in their dedicated implementation unit.
        Navigation, access scope, and responsive shell behavior are available now.
      </p>
    </section>
  </div>
</template>

<style scoped>
.module-page {
  max-width: 72rem;
}

.module-empty {
  min-height: 17rem;
  padding: clamp(1.5rem, 5vw, 3rem);
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius);
  background: linear-gradient(135deg, rgba(101, 213, 174, 0.05), transparent 55%);
}

.module-empty > span {
  color: var(--accent);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.module-empty h2 {
  margin: 3.5rem 0 0.5rem;
  font-size: 1.1rem;
}

.module-empty p {
  max-width: 36rem;
  margin: 0;
  color: var(--muted);
  font-size: 0.75rem;
  line-height: 1.6;
}
</style>
