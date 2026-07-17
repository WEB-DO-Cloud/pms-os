<template>
  <div class="auth-shell">
    <div class="auth-card">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.auth-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem 1rem;
  background:
    radial-gradient(circle at 20% 0%, rgba(101, 213, 174, 0.12), transparent 28rem),
    var(--canvas);
}

.auth-card {
  width: min(100%, 26rem);
  padding: 2rem 1.75rem 1.75rem;
  border: 1px solid var(--line);
  border-radius: calc(var(--radius) + 0.2rem);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
}
</style>
