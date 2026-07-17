export default defineNuxtConfig({
  compatibilityDate: '2025-07-16',
  future: {
    compatibilityVersion: 4,
  },
  srcDir: 'app',
  app: {
    head: {
      title: 'PMS OS — Property operations for Channex portfolios',
      htmlAttrs: { lang: 'en' },
      meta: [
        {
          name: 'description',
          content:
            'Open-source property management for hotels and vacation rentals. Sync bookings from Channex, run operations, self-host or use the commercial platform.',
        },
        { name: 'theme-color', content: '#0b3d36' },
        { property: 'og:title', content: 'PMS OS' },
        {
          property: 'og:description',
          content: 'Property operations for Channex-connected portfolios.',
        },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: 'https://pms.do/' },
        { property: 'og:image', content: 'https://pms.do/hero-coastal-villa.jpg' },
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
  // Marketing site — never import @pms/* server packages.
  typescript: {
    typeCheck: false,
  },
})
