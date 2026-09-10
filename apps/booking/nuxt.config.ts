export default defineNuxtConfig({
  compatibilityDate: '2025-07-16',
  future: {
    compatibilityVersion: 4,
  },
  srcDir: 'app',
  app: {
    head: {
      title: 'Book a stay — PMS.do',
      htmlAttrs: { lang: 'en' },
      meta: [
        {
          name: 'description',
          content: 'Check dates and book a room directly with the property.',
        },
        { name: 'theme-color', content: '#0b3d36' },
      ],
    },
  },
  runtimeConfig: {
    public: {
      pmsApiBase:
        process.env.NUXT_PUBLIC_PMS_API_BASE || 'https://app.pms.do',
    },
  },
  routeRules: {
    '/**': {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  },
  typescript: {
    typeCheck: false,
  },
})
