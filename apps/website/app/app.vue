<template>
  <div>
    <NuxtPage />
  </div>
</template>

<style>
:root {
  --ink: #12241f;
  --ink-soft: #3a534c;
  --canvas: #f3f7f5;
  --canvas-deep: #e5eeea;
  --line: rgba(18, 36, 31, 0.12);
  --teal: #0b3d36;
  --teal-mid: #156b5c;
  --mint: #3db892;
  --mint-bright: #65d5ae;
  --sand: #f7f1e8;
  --font-display: 'Syne', sans-serif;
  --font-body: 'Instrument Sans', sans-serif;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  color: var(--ink);
  background: var(--canvas);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

a {
  color: inherit;
}

img {
  max-width: 100%;
  display: block;
}
</style>
