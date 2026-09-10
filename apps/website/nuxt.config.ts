export default defineNuxtConfig({
  compatibilityDate: '2025-07-16',
  future: {
    compatibilityVersion: 4,
  },
  srcDir: 'app',
  app: {
    head: {
      title: 'PMS.do — Open-source PMS for hotels and vacation rentals',
      htmlAttrs: { lang: 'en' },
      meta: [
        {
          name: 'description',
          content:
            'Open-source property management for hotels and vacation rentals in the US, UK, EU, Canada, and the Caribbean. Self-host free under AGPL-3.0, or let us host it. Labeled in USD. No per-room feature fees.',
        },
        { name: 'theme-color', content: '#0b3d36' },
        { property: 'og:title', content: 'PMS.do' },
        {
          property: 'og:description',
          content:
            'Own the stack. Self-host free, or we host it for you. Hotels and vacation rentals, USD, Western operators.',
        },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: 'https://pms.do/' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Syne:wght@600;700;800&display=swap',
        },
      ],
    },
  },
  // Matches Caddy edge cache rules.
  routeRules: {
    '/**': {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
      },
    },
    '/_nuxt/**': {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
  },
  typescript: {
    typeCheck: false,
  },
})
