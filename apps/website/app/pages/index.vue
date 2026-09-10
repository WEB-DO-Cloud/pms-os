<script setup lang="ts">
const year = new Date().getFullYear()
const github = 'https://github.com/WEB-DO-Cloud/pms-os'
const signup = 'https://app.pms.do/signup'
const login = 'https://app.pms.do/login'
const quoteMail = 'hello@pms.do'

const menuOpen = ref(false)
const quote = reactive({
  name: '',
  email: '',
  phone: '',
  property: '',
  rooms: '',
  city: '',
  country: '',
  currentPms: '',
  interest: '',
})
const quoteErrors = reactive({ name: '', email: '', property: '' })

const featureClusters = [
  {
    title: 'Run the stay',
    items: [
      {
        title: 'Front desk',
        copy: 'Calendar and arrivals so the desk sees who is in, who is due, and which rooms are blocked.',
      },
      {
        title: 'Reservations',
        copy: 'Create, change, and cancel stays in one book. Channel revisions land on the same calendar.',
      },
      {
        title: 'Housekeeping',
        copy: 'Task lists for the floor: assign, claim, and close rooms with arrival context.',
      },
      {
        title: 'Guests',
        copy: 'Guest profiles and stay history on the server you run — not a vendor meter.',
      },
    ],
  },
  {
    title: 'Channels and network',
    items: [
      {
        title: 'Channel sync',
        copy: 'OTA and channel bookings flow through Channex. A Channex account and API key are required for live channels. Without that, this is on-property ops, not a full channel PMS.',
      },
      {
        title: 'Owner portal',
        copy: 'Owners see their units and statements without a second product.',
      },
      {
        title: 'Multi-property',
        copy: 'Commercial hosting adds more than one network and white-label. Community self-host is one network.',
      },
    ],
  },
  {
    title: 'Money and rules',
    items: [
      {
        title: 'Rates & ARI',
        copy: 'Nightly rates, availability, and restrictions you control. Prices come from your rate card, not a model.',
      },
      {
        title: 'Payment ledger',
        copy: 'Charges and payments on the folio. This is a ledger, not a restaurant till.',
      },
      {
        title: 'Reports',
        copy: 'Occupancy and revenue views for the properties you operate.',
      },
      {
        title: 'Rules',
        copy: 'Automation rules for the operations you already run in this build.',
      },
    ],
  },
] as const

const markets = [
  'United States',
  'United Kingdom',
  'European Union',
  'Canada',
  'Caribbean',
] as const

const faqs = [
  {
    q: 'What is PMS.do?',
    a: 'Open-source property management for hotels and vacation rentals. You can self-host it under AGPL-3.0, or we can host it for you. The product is labeled in USD for Western operators.',
  },
  {
    q: 'Is anything locked behind a paid plan?',
    a: 'The operations surface is the same. Community is self-host, one network. Cloud is a quoted hosted plan. Commercial gates are multi-network and white-label — not a per-room feature list. We do not publish a Cloud rate card on this page.',
  },
  {
    q: 'Why don’t you charge per room for features?',
    a: 'Features are not a meter. Cloud hosting is quoted. The hosted meter, when it applies, is properties and hotels plus multi-network and white-label — not a per-room feature gate.',
  },
  {
    q: 'What server do I need to self-host?',
    a: 'A small Ubuntu VPS is enough to start (2 vCPU, 4 GB RAM, 40 GB disk). Follow the GitHub README for secrets, Postgres, the worker, and a reverse proxy. First admin is created at /setup, not /signup.',
  },
  {
    q: 'Can I leave PMS.do Cloud later?',
    a: 'Yes. Export your data and run the same software on your own host. Community first-admin is /setup after you clone WEB-DO-Cloud/pms-os.',
  },
  {
    q: 'Does AI set prices or taxes?',
    a: 'No. There is no AI price or tax engine on this page or in this build. Rates come from your card. Local VAT and sales tax stay in your own books.',
  },
  {
    q: 'Can I host PMS.do as SaaS for other properties?',
    a: 'AGPL-3.0 covers running it for your own property. Offering it as hosted software to third parties needs a commercial license. Write to us.',
  },
]

function closeMenu() {
  menuOpen.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeMenu()
}

function submitQuote(event: Event) {
  event.preventDefault()
  quoteErrors.name = quote.name.trim() ? '' : 'Name is required.'
  // ponytail: naive client-side shape check only; upgrade to a shared validator if server-side quote intake ships.
  quoteErrors.email = /.+@.+\..+/.test(quote.email.trim()) ? '' : 'A valid email is required.'
  quoteErrors.property = quote.property.trim() ? '' : 'Property name is required.'
  if (quoteErrors.name || quoteErrors.email || quoteErrors.property) return

  const lines = [
    `Name: ${quote.name.trim()}`,
    `Email: ${quote.email.trim()}`,
    quote.phone.trim() && `Phone: ${quote.phone.trim()}`,
    `Property: ${quote.property.trim()}`,
    quote.rooms.trim() && `Rooms / units: ${quote.rooms.trim()}`,
    quote.city.trim() && `City: ${quote.city.trim()}`,
    quote.country.trim() && `Country: ${quote.country.trim()}`,
    quote.currentPms.trim() && `Current PMS: ${quote.currentPms.trim()}`,
    quote.interest.trim() && `Interested in: ${quote.interest.trim()}`,
  ].filter(Boolean)
  const subject = encodeURIComponent(`PMS.do enquiry — ${quote.property.trim()}`)
  const body = encodeURIComponent(lines.join('\n'))
  window.location.href = `mailto:${quoteMail}?subject=${subject}&body=${body}`
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="site" @click="menuOpen && closeMenu()">
    <header class="topbar">
      <a class="top-brand" href="/">PMS.do</a>
      <button
        class="menu-toggle"
        type="button"
        :aria-expanded="menuOpen"
        aria-controls="site-nav"
        @click.stop="menuOpen = !menuOpen"
      >
        {{ menuOpen ? 'Close' : 'Menu' }}
      </button>
      <nav id="site-nav" aria-label="Primary" :class="{ open: menuOpen }" @click.stop="closeMenu">
        <a href="#product">Product</a>
        <a href="#pricing">Open source</a>
        <a href="#pricing">Pricing</a>
        <a href="#quote">Get a quote</a>
        <a :href="github">GitHub</a>
        <a :href="login">Sign in</a>
      </nav>
    </header>

    <section class="hero" aria-label="PMS.do">
      <div class="hero-media" aria-hidden="true" />
      <div class="hero-scrim" aria-hidden="true" />
      <div class="hero-copy">
        <p class="brand">PMS.do</p>
        <h1>The open-source PMS for hotels and hospitality groups.</h1>
        <p class="lede">
          Front desk, reservations, housekeeping, rates, reports, and channel sync on software you own.
          Self-host it free under AGPL-3.0, or let us run it for you. Labeled in USD. No per-room feature fees.
        </p>
        <div class="cta">
          <a class="btn-primary" href="#quote">Get a quote</a>
          <a class="btn-ghost" :href="signup">Start hosted</a>
        </div>
        <a class="hero-text" href="#pricing">Explore self-host</a>
      </div>
    </section>

    <section id="product" class="sovereignty" aria-labelledby="sov-title">
      <p class="eyebrow">Data sovereignty</p>
      <h2 id="sov-title">The case for owning the stack</h2>
      <p>
        PMS.do is inspectable AGPL-3.0 software. Guest data lives on the server you choose, not a vendor meter.
        The same operations surface if you self-host or we host it.
      </p>
      <ul class="pillars">
        <li>
          <h3>Absolute privacy</h3>
          <p>Reservations, folios, and guest history stay on the host you pick.</p>
        </li>
        <li>
          <h3>Total data control</h3>
          <p>Your database, your backups, your export. No ransom at renewal.</p>
        </li>
        <li>
          <h3>No vendor lock-in</h3>
          <p>Standard Docker. Move hosts, fork the code, or leave Cloud when you want.</p>
        </li>
      </ul>
      <p class="note">
        Live OTA and channel sync runs through Channex. You need a Channex account and API key for live channels.
      </p>
    </section>

    <section id="stack" class="stack" aria-labelledby="stack-title">
      <p class="eyebrow">One system</p>
      <h2 id="stack-title">What this build actually runs</h2>
      <p>
        Not a trial edition. Hotels and vacation rentals share one codebase. Commercial hosting adds networks and
        white-label — it does not unlock a second product.
      </p>
      <div class="clusters">
        <article v-for="cluster in featureClusters" :key="cluster.title">
          <h3>{{ cluster.title }}</h3>
          <ul>
            <li v-for="item in cluster.items" :key="item.title">
              <strong>{{ item.title }}</strong>
              <p>{{ item.copy }}</p>
            </li>
          </ul>
        </article>
      </div>
    </section>

    <section id="str" class="str" aria-labelledby="str-title">
      <p class="eyebrow">Hotels and vacation rentals</p>
      <h2 id="str-title">Same open codebase</h2>
      <p>
        One install covers hotels and vacation rentals. That is a property catalog and calendar, not a separate
        listing-site product or an add-on licence. Flip nothing to “unlock” villas.
      </p>
    </section>

    <section id="markets" class="markets" aria-labelledby="markets-title">
      <p class="eyebrow">Where we work</p>
      <h2 id="markets-title">English and USD operators in these regions</h2>
      <p>
        We sell and support operators in the United States, United Kingdom, European Union, Canada, and the Caribbean.
        This is willingness to serve, not an in-region tax engine or a local hosting footprint. You run USD books;
        local VAT and sales tax stay with your accountant.
      </p>
      <ul class="market-list">
        <li v-for="market in markets" :key="market">{{ market }}</li>
      </ul>
    </section>

    <section id="done" class="done" aria-labelledby="done-title">
      <p class="eyebrow">Done for you</p>
      <h2 id="done-title">Don’t want to touch a server?</h2>
      <p>
        We can migrate you from another PMS or a spreadsheet, train the desk, and stay on call. We quote the work.
        We do not publish a price list.
      </p>
      <a class="btn-primary" href="#quote">Get a quote</a>
    </section>

    <section id="pricing" class="pricing" aria-labelledby="pricing-title">
      <p class="eyebrow">Pricing</p>
      <h2 id="pricing-title">Free to own. Fair to host.</h2>
      <p>
        You pay for servers, hosting, and people’s time — never a per-room feature fee. Cloud rates are quoted, not
        printed here.
      </p>
      <div class="edition-split">
        <article>
          <h3>Self-host</h3>
          <p class="price">Free to self-host under AGPL-3.0 for your own property</p>
          <ul class="checks">
            <li>The operations surface in this repo, on your iron</li>
            <li>Small VPS to start (2 vCPU · 4 GB RAM · 40 GB)</li>
            <li>Community support via GitHub</li>
            <li>You manage updates, backups, and the server</li>
            <li>First admin at <strong>/setup</strong> — not /signup</li>
          </ul>
          <pre class="snippet" tabindex="0"><code># Illustrative — follow the README for secrets, worker, and reverse proxy
git clone {{ github }}
# compose up, then open /setup</code></pre>
          <a class="text-link" :href="github">Read the GitHub README →</a>
        </article>
        <article>
          <h3>PMS.do Cloud</h3>
          <p class="price">Priced for your property — write to {{ quoteMail }}</p>
          <ul class="checks">
            <li>Same operations surface; we host, back up, and update</li>
            <li>Self-serve hosted trial at app.pms.do/signup</li>
            <li>A written USD quote for ongoing hosting and done-for-you</li>
            <li>Multi-network and white-label when you need them</li>
            <li>Export and self-host later if you want</li>
          </ul>
          <a class="text-link" :href="signup">Start hosted trial →</a>
        </article>
      </div>
    </section>

    <section id="connected" class="connected" aria-labelledby="connected-title">
      <p class="eyebrow">Connected services</p>
      <h2 id="connected-title">Pay for setup, or hand it to us once</h2>
      <p>On request — not feature gates, not metered SKUs we do not run on this page.</p>
      <ul class="service-grid">
        <li>
          <h3>Implementation &amp; training</h3>
          <p>Property setup, rate card, and floor training. Quote on request.</p>
        </li>
        <li>
          <h3>Payment setup</h3>
          <p>Wire payment links to your own gateway account. One-time, on request.</p>
        </li>
        <li>
          <h3>Messaging setup</h3>
          <p>Guest and staff messaging on numbers you own, if you want us to wire it.</p>
        </li>
      </ul>
    </section>

    <section id="quote" class="quote" aria-labelledby="quote-title">
      <p class="eyebrow">Talk to us</p>
      <h2 id="quote-title">Ready to go live?</h2>
      <p>
        Tell us what you run today and how many rooms. We quote go-live, Cloud hosting, or both.
        <a :href="`mailto:${quoteMail}`">{{ quoteMail }}</a>
        is always the fallback — signup is the self-serve hosted trial, not a substitute for a written quote.
      </p>
      <form class="quote-form" novalidate @submit="submitQuote">
        <label>
          Your name *
          <input v-model="quote.name" type="text" name="name" autocomplete="name" required />
          <span v-if="quoteErrors.name" class="err">{{ quoteErrors.name }}</span>
        </label>
        <label>
          Email *
          <input v-model="quote.email" type="email" name="email" autocomplete="email" required />
          <span v-if="quoteErrors.email" class="err">{{ quoteErrors.email }}</span>
        </label>
        <label>
          Phone
          <input v-model="quote.phone" type="tel" name="phone" autocomplete="tel" />
        </label>
        <label>
          Property name *
          <input v-model="quote.property" type="text" name="property" required />
          <span v-if="quoteErrors.property" class="err">{{ quoteErrors.property }}</span>
        </label>
        <label>
          Rooms / units
          <input v-model="quote.rooms" type="text" name="rooms" />
        </label>
        <label>
          City
          <input v-model="quote.city" type="text" name="city" autocomplete="address-level2" />
        </label>
        <label>
          Country
          <input v-model="quote.country" type="text" name="country" autocomplete="country-name" />
        </label>
        <label>
          Current PMS
          <input v-model="quote.currentPms" type="text" name="current-pms" />
        </label>
        <label class="full">
          Interested in
          <select v-model="quote.interest" name="interest">
            <option value="">Choose…</option>
            <option>Self-host</option>
            <option>Cloud hosting</option>
            <option>Implementation</option>
            <option>Both Cloud and implementation</option>
          </select>
        </label>
        <button class="btn-primary" type="submit">Send enquiry</button>
      </form>
      <p class="note">No spam, no drip campaigns. A person replies at {{ quoteMail }}.</p>
    </section>

    <section id="faq" class="faq" aria-labelledby="faq-title">
      <p class="eyebrow">Questions</p>
      <h2 id="faq-title">Fair questions, straight answers</h2>
      <details v-for="item in faqs" :key="item.q">
        <summary>{{ item.q }}</summary>
        <p>{{ item.a }}</p>
      </details>
    </section>

    <footer class="foot">
      <div>
        <strong>PMS.do</strong>
        <p>Open-source hotel and vacation-rental PMS. Free to own, fair to host. AGPL-3.0.</p>
      </div>
      <nav aria-label="Footer">
        <a href="#product">Product</a>
        <a href="#pricing">Self-host</a>
        <a :href="signup">Cloud trial</a>
        <a href="#quote">Talk to us</a>
        <a :href="github">GitHub</a>
        <a :href="login">App</a>
      </nav>
      <span>© {{ year }} PMS.do. AGPL-3.0.</span>
    </footer>
  </div>
</template>

<style scoped>
.site {
  overflow-x: clip;
}

.topbar {
  position: absolute;
  z-index: 4;
  inset: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1.25rem clamp(1.25rem, 4vw, 3rem);
  color: #f4f8f6;
}

.top-brand {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  text-decoration: none;
}

.menu-toggle {
  display: none;
  min-height: 2.5rem;
  padding: 0.4rem 0.85rem;
  border: 1px solid rgba(244, 248, 246, 0.4);
  border-radius: 0.4rem;
  color: #f4f8f6;
  background: transparent;
  font: inherit;
  font-weight: 650;
}

.topbar nav {
  display: flex;
  flex-wrap: wrap;
  gap: 1.1rem;
  font-size: 0.88rem;
  font-weight: 500;
}

.topbar nav a {
  text-decoration: none;
  opacity: 0.88;
}

.topbar nav a:hover {
  opacity: 1;
}

.hero {
  position: relative;
  min-height: 100svh;
  display: grid;
  align-items: end;
  color: #f4f8f6;
}

.hero-media {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 78% 18%, rgba(101, 213, 174, 0.28), transparent 36%),
    radial-gradient(circle at 12% 80%, rgba(21, 107, 92, 0.55), transparent 42%),
    linear-gradient(160deg, #071613 0%, #0b3d36 48%, #12241f 100%);
}

.hero-scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(7, 22, 19, 0.2) 0%, rgba(7, 22, 19, 0.12) 40%, rgba(7, 22, 19, 0.72) 100%);
}

.hero-copy {
  position: relative;
  z-index: 2;
  width: min(42rem, 100%);
  padding: clamp(2rem, 6vw, 5rem) clamp(1.25rem, 4vw, 3rem) clamp(3rem, 8vw, 5.5rem);
}

.brand {
  margin: 0 0 1rem;
  font-family: var(--font-display);
  font-size: clamp(3.2rem, 9vw, 6.5rem);
  font-weight: 800;
  letter-spacing: -0.055em;
  line-height: 0.92;
}

.hero h1 {
  margin: 0;
  max-width: 20ch;
  font-family: var(--font-display);
  font-size: clamp(1.45rem, 3.2vw, 2.15rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.lede {
  margin: 1rem 0 0;
  max-width: 34rem;
  color: rgba(244, 248, 246, 0.84);
  font-size: clamp(1rem, 1.5vw, 1.12rem);
  line-height: 1.55;
}

.cta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.75rem;
}

.hero-text {
  display: inline-block;
  margin-top: 1rem;
  color: var(--mint-bright);
  font-weight: 650;
  text-decoration: none;
}

.hero-text:hover {
  text-decoration: underline;
}

.btn-primary,
.btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.85rem;
  padding: 0.7rem 1.2rem;
  border-radius: 0.45rem;
  font-size: 0.95rem;
  font-weight: 650;
  text-decoration: none;
  border: 0;
  cursor: pointer;
  font-family: inherit;
}

.btn-primary {
  color: #04201a;
  background: var(--mint-bright);
}

.btn-primary:hover {
  background: #7ee0bc;
}

.btn-ghost {
  color: #f4f8f6;
  border: 1px solid rgba(244, 248, 246, 0.35);
  background: transparent;
}

.sovereignty,
.stack,
.str,
.markets,
.done,
.pricing,
.connected,
.quote,
.faq {
  padding: clamp(4rem, 10vw, 7.5rem) clamp(1.25rem, 4vw, 3rem);
}

.eyebrow {
  margin: 0 0 0.85rem;
  color: var(--teal-mid);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 4vw, 3rem);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1.1;
}

.sovereignty,
.str,
.done,
.quote {
  max-width: 52rem;
}

.sovereignty p,
.stack > p,
.str p,
.markets > p,
.done p,
.pricing > p,
.connected > p,
.quote > p,
.faq p {
  margin: 1.1rem 0 0;
  color: var(--ink-soft);
  font-size: 1.05rem;
  line-height: 1.6;
}

.pillars,
.clusters,
.edition-split,
.service-grid,
.market-list {
  display: grid;
  gap: clamp(1.25rem, 3vw, 2rem);
  margin: 2rem 0 0;
  padding: 0;
  list-style: none;
}

.pillars,
.clusters,
.edition-split,
.service-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.market-list {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.pillars li,
.clusters article,
.edition-split article,
.service-grid li,
.market-list li {
  padding-top: 1.1rem;
  border-top: 3px solid var(--teal);
}

.clusters ul {
  margin: 1rem 0 0;
  padding: 0;
  list-style: none;
}

.clusters li + li,
.checks li + li {
  margin-top: 1rem;
}

.clusters strong,
.pillars h3,
.service-grid h3,
.edition-split h3 {
  font-family: var(--font-display);
  font-size: 1.2rem;
  letter-spacing: -0.02em;
}

.note {
  margin-top: 1.5rem;
  font-size: 0.95rem;
}

.stack,
.pricing {
  background: linear-gradient(180deg, var(--canvas-deep), var(--canvas));
}

.str,
.connected {
  background: var(--sand);
}

.markets,
.done {
  background: var(--teal);
  color: #f4f8f6;
}

.markets .eyebrow,
.done .eyebrow,
.pricing .eyebrow {
  color: var(--mint-bright);
}

.markets p,
.done p {
  color: rgba(244, 248, 246, 0.82);
}

.market-list li {
  border-top-color: var(--mint);
  font-weight: 650;
}

.checks {
  margin: 1.25rem 0 0;
  padding: 0;
  list-style: none;
  color: var(--ink-soft);
}

.price {
  font-weight: 650;
  color: var(--ink) !important;
}

.snippet {
  margin-top: 1.25rem;
  padding: 1rem;
  overflow: auto;
  border-radius: 0.4rem;
  background: #071613;
  color: #d7f3e8;
  font-size: 0.82rem;
}

.text-link {
  display: inline-block;
  margin-top: 1.25rem;
  color: var(--teal-mid);
  font-weight: 650;
  text-decoration: none;
}

.text-link:hover {
  text-decoration: underline;
}

.quote-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 2rem;
}

.quote-form label,
.quote-form .full {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.88rem;
  font-weight: 650;
}

.quote-form .full,
.quote-form button {
  grid-column: 1 / -1;
}

.quote-form input,
.quote-form select {
  min-height: 2.7rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  font: inherit;
  font-weight: 500;
}

.err {
  color: #9b2c2c;
  font-weight: 600;
}

.faq details {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
}

.faq summary {
  cursor: pointer;
  font-weight: 700;
  font-family: var(--font-display);
}

.foot {
  display: grid;
  gap: 1rem;
  padding: 1.6rem clamp(1.25rem, 4vw, 3rem);
  border-top: 1px solid var(--line);
  color: var(--ink-soft);
  font-size: 0.85rem;
}

.foot nav {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.4rem;
}

.foot a {
  text-decoration: none;
  font-weight: 600;
  color: var(--teal-mid);
}

@media (max-width: 960px) {
  .pillars,
  .clusters,
  .edition-split,
  .service-grid,
  .market-list {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 860px) {
  .menu-toggle {
    display: inline-flex;
    align-items: center;
  }

  .topbar nav {
    display: none;
    position: absolute;
    top: 100%;
    right: clamp(1.25rem, 4vw, 3rem);
    left: clamp(1.25rem, 4vw, 3rem);
    padding: 1rem;
    flex-direction: column;
    background: #0b3d36;
    border-radius: 0.5rem;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  }

  .topbar nav.open {
    display: flex;
  }

  .quote-form,
  .pillars,
  .clusters,
  .edition-split,
  .service-grid,
  .market-list {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
</style>
