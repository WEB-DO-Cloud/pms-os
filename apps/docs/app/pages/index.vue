<template>
  <div class="docs">
    <p class="eyebrow">Documentation</p>
    <h1>PMS OS Docs</h1>
    <p>
      Public documentation surface for self-host and hosted operators. This app stays isolated from
      PMS server packages and secrets.
    </p>
    <ul>
      <li>Getting started</li>
      <li>Community vs commercial license</li>
      <li>Channex sync overview</li>
    </ul>
  </div>
</template>

<style scoped>
.docs {
  max-width: 42rem;
  margin: 0 auto;
  padding: 3rem 1.25rem;
  font-family: Georgia, 'Times New Roman', serif;
  color: #14201c;
  background:
    radial-gradient(circle at 10% 0%, #d9efe6, transparent 28rem),
    #f7fbf9;
  min-height: 100vh;
}
.eyebrow {
  margin: 0 0 0.5rem;
  color: #2f6b57;
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-family: system-ui, sans-serif;
}
h1 {
  margin: 0 0 0.75rem;
  font-size: clamp(2rem, 4vw, 2.8rem);
}
p {
  line-height: 1.55;
}
ul {
  margin: 1.5rem 0 0;
  padding-left: 1.1rem;
  line-height: 1.8;
}
</style>
