export default defineNuxtConfig({
  compatibilityDate: '2025-07-16',
  future: {
    compatibilityVersion: 4,
  },
  srcDir: 'app',
  // Public docs — never import @pms/* server packages.
  typescript: {
    typeCheck: false,
  },
})
