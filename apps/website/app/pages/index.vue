<script setup lang="ts">
const year = new Date().getFullYear()

const steps = [
  {
    n: '01',
    title: 'Create the property',
    copy: 'Onboard a hotel or vacation rental — PMS OS registers it with Channex for you.',
  },
  {
    n: '02',
    title: 'Sync every revision',
    copy: 'New, modified, and cancelled bookings land in one calendar, not five channel tabs.',
  },
  {
    n: '03',
    title: 'Operate the stay',
    copy: 'Arrivals, housekeeping, owners, and revenue — scoped to the network that owns them.',
  },
] as const
</script>

<template>
  <div class="site">
    <header class="topbar">
      <a class="top-brand" href="/">PMS OS</a>
      <nav aria-label="Primary">
        <a href="#how">How it works</a>
        <a href="#editions">Editions</a>
        <a href="https://app.pms.do/login">Sign in</a>
      </nav>
    </header>

    <section class="hero" aria-label="PMS OS">
      <div class="hero-media" aria-hidden="true">
        <img
          src="/hero-coastal-villa.jpg"
          alt=""
          width="1920"
          height="1080"
          fetchpriority="high"
        />
      </div>
      <div class="hero-scrim" aria-hidden="true" />
      <div class="hero-copy">
        <p class="brand">PMS OS</p>
        <h1>Property operations for Channex portfolios.</h1>
        <p class="lede">
          One workspace for hotels and vacation rentals — bookings sync in,
          staff work from a single source of truth.
        </p>
        <div class="cta">
          <a class="btn-primary" href="https://app.pms.do/signup">Start free</a>
          <a class="btn-ghost" href="https://app.pms.do/login">Sign in</a>
        </div>
      </div>
    </section>

    <section class="purpose" aria-labelledby="purpose-title">
      <p class="eyebrow">Built for operators</p>
      <h2 id="purpose-title">Stop stitching channel tools together.</h2>
      <p>
        PMS OS is the operating layer on top of Channex: catalog, reservations,
        tasks, and network branding — open-source at the core, commercial when
        you need multi-tenant SaaS.
      </p>
    </section>

    <section id="how" class="how" aria-labelledby="how-title">
      <div class="how-intro">
        <p class="eyebrow">How it works</p>
        <h2 id="how-title">From listing to live stay.</h2>
      </div>
      <ol class="steps">
        <li v-for="step in steps" :key="step.n">
          <span class="step-n">{{ step.n }}</span>
          <h3>{{ step.title }}</h3>
          <p>{{ step.copy }}</p>
        </li>
      </ol>
    </section>

    <section id="editions" class="editions" aria-labelledby="editions-title">
      <p class="eyebrow">Editions</p>
      <h2 id="editions-title">Choose how you run it.</h2>
      <div class="edition-split">
        <article>
          <h3>Community</h3>
          <p>
            Self-host under AGPLv3. One network, full operations surface, your
            infrastructure.
          </p>
        </article>
        <article>
          <h3>Commercial</h3>
          <p>
            Hosted at app.pms.do. Multi-network, white-label, and platform-managed
            Channex — ready for operators who grow.
          </p>
          <a class="text-link" href="https://app.pms.do/signup">Create your network →</a>
        </article>
      </div>
    </section>

    <section class="close" aria-labelledby="close-title">
      <h2 id="close-title">Open the board for your first property.</h2>
      <p>Sign up in minutes. No channel API key hunt on the commercial platform.</p>
      <div class="cta">
        <a class="btn-primary" href="https://app.pms.do/signup">Start free</a>
        <a class="btn-ghost dark" href="https://app.pms.do/login">Sign in</a>
      </div>
    </section>

    <footer class="foot">
      <span>PMS OS</span>
      <span>© {{ year }}</span>
      <a href="https://app.pms.do/login">App</a>
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
  overflow: hidden;
}

.hero-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 55% 45%;
  animation: hero-drift 18s ease-out both;
}

.hero-scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(7, 22, 19, 0.35) 0%, rgba(7, 22, 19, 0.15) 35%, rgba(7, 22, 19, 0.72) 100%),
    linear-gradient(90deg, rgba(7, 22, 19, 0.55) 0%, rgba(7, 22, 19, 0.1) 55%, transparent 100%);
}

.hero-copy {
  position: relative;
  z-index: 2;
  width: min(40rem, 100%);
  padding: clamp(2rem, 6vw, 5rem) clamp(1.25rem, 4vw, 3rem) clamp(3rem, 8vw, 5.5rem);
  animation: rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.brand {
  margin: 0 0 1rem;
  font-family: var(--font-display);
  font-size: clamp(3.2rem, 9vw, 6.5rem);
  font-weight: 800;
  letter-spacing: -0.055em;
  line-height: 0.92;
  animation: rise 1s 0.08s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.hero h1 {
  margin: 0;
  max-width: 18ch;
  font-family: var(--font-display);
  font-size: clamp(1.45rem, 3.2vw, 2.15rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.2;
  animation: rise 1s 0.16s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.lede {
  margin: 1rem 0 0;
  max-width: 32rem;
  color: rgba(244, 248, 246, 0.84);
  font-size: clamp(1rem, 1.5vw, 1.12rem);
  line-height: 1.55;
  animation: rise 1s 0.24s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.cta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.75rem;
  animation: rise 1s 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
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
  transition:
    transform 0.2s ease,
    background 0.2s ease,
    border-color 0.2s ease;
}

.btn-primary {
  color: #04201a;
  background: var(--mint-bright);
}

.btn-primary:hover {
  transform: translateY(-1px);
  background: #7ee0bc;
}

.btn-ghost {
  color: #f4f8f6;
  border: 1px solid rgba(244, 248, 246, 0.35);
  background: transparent;
}

.btn-ghost:hover {
  border-color: rgba(244, 248, 246, 0.7);
}

.btn-ghost.dark {
  color: var(--ink);
  border-color: rgba(18, 36, 31, 0.25);
}

.purpose,
.how,
.editions,
.close {
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

.purpose {
  max-width: 46rem;
  margin: 0 auto;
  text-align: center;
}

.purpose h2,
.how h2,
.editions h2,
.close h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 4vw, 3rem);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1.1;
}

.purpose p,
.how p,
.editions p,
.close p {
  margin: 1.1rem 0 0;
  color: var(--ink-soft);
  font-size: 1.05rem;
  line-height: 1.6;
}

.how {
  background:
    linear-gradient(180deg, var(--canvas-deep), var(--canvas));
}

.how-intro {
  max-width: 40rem;
  margin-bottom: 2.5rem;
}

.steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(1.5rem, 4vw, 3rem);
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--line);
}

.steps li {
  padding-top: 1.5rem;
  border-top: 3px solid transparent;
  animation: rise 0.8s ease both;
}

.steps li:nth-child(1) {
  border-top-color: var(--teal);
  animation-delay: 0.05s;
}
.steps li:nth-child(2) {
  border-top-color: var(--teal-mid);
  animation-delay: 0.12s;
}
.steps li:nth-child(3) {
  border-top-color: var(--mint);
  animation-delay: 0.2s;
}

.step-n {
  display: block;
  margin-bottom: 0.85rem;
  color: var(--teal-mid);
  font-family: var(--font-display);
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.steps h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.steps p {
  margin-top: 0.7rem;
  font-size: 0.98rem;
}

.editions {
  background: var(--teal);
  color: #f4f8f6;
}

.editions .eyebrow {
  color: var(--mint-bright);
}

.editions h2 {
  max-width: 16ch;
}

.edition-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: clamp(2rem, 5vw, 4rem);
  margin-top: 2.5rem;
  padding-top: 2rem;
  border-top: 1px solid rgba(244, 248, 246, 0.18);
}

.edition-split h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.edition-split p {
  color: rgba(244, 248, 246, 0.78);
}

.text-link {
  display: inline-block;
  margin-top: 1.25rem;
  color: var(--mint-bright);
  font-weight: 650;
  text-decoration: none;
}

.text-link:hover {
  text-decoration: underline;
}

.close {
  text-align: center;
  background:
    radial-gradient(circle at 50% 0%, rgba(61, 184, 146, 0.18), transparent 42%),
    var(--sand);
}

.close h2 {
  max-width: 18ch;
  margin-left: auto;
  margin-right: auto;
}

.close p {
  max-width: 34rem;
  margin-left: auto;
  margin-right: auto;
}

.close .cta {
  justify-content: center;
}

.foot {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.5rem;
  align-items: center;
  justify-content: space-between;
  padding: 1.4rem clamp(1.25rem, 4vw, 3rem);
  border-top: 1px solid var(--line);
  color: var(--ink-soft);
  font-size: 0.85rem;
}

.foot a {
  text-decoration: none;
  font-weight: 600;
  color: var(--teal-mid);
}

@keyframes hero-drift {
  from {
    transform: scale(1.08);
  }
  to {
    transform: scale(1);
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(1.1rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 860px) {
  .steps,
  .edition-split {
    grid-template-columns: 1fr;
  }

  .topbar nav a:nth-child(1),
  .topbar nav a:nth-child(2) {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-media img,
  .hero-copy,
  .brand,
  .hero h1,
  .lede,
  .cta,
  .steps li {
    animation: none;
  }
}
</style>
