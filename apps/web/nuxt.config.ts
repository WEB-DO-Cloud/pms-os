export default defineNuxtConfig({
  compatibilityDate: '2025-07-16',
  future: {
    compatibilityVersion: 4,
  },
  srcDir: 'app',
  serverDir: 'server',
  css: ['~/assets/css/tailwind.css'],
  typescript: {
    typeCheck: false,
  },
  modules: [],
  nitro: {
    preset: 'node-server',
  },
})
