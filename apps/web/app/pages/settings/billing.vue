<script setup lang="ts">
type BillingOverview = {
  networkId: number
  configured: boolean
  rates: { propertyUsd: number; hotelUsd: number }
  counts: { hotels: number; properties: number }
  estimateUsd: number
  subscription: {
    status: string
    stripeCustomerId: string | null
    stripeSubscriptionId: string | null
    currentPeriodEnd: string | null
  }
  invoices: Array<{
    id: string
    amountDue: number
    amountPaid: number
    currency: string
    status: string | null
    createdAt: string
    hostedInvoiceUrl: string | null
    invoicePdf: string | null
  }>
}

const route = useRoute()
const { currentNetworkId, principal } = useCurrentNetwork()

const canView = computed(() => principal.value?.role === 'org_admin')
const overview = ref<BillingOverview | null>(null)
const error = ref<string | null>(null)
const flash = ref<string | null>(null)
const loading = ref(false)
const busy = ref(false)

const isSubscribed = computed(() => {
  const s = overview.value?.subscription.status
  return s === 'active' || s === 'trialing' || s === 'past_due'
})

const statusLabel = computed(() => {
  const s = overview.value?.subscription.status ?? 'none'
  const map: Record<string, string> = {
    none: 'Not subscribed',
    active: 'Active',
    trialing: 'Trialing',
    past_due: 'Past due',
    canceled: 'Canceled',
    incomplete: 'Incomplete',
  }
  return map[s] ?? s
})

function money(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(n)
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso))
}

async function load() {
  if (!canView.value || currentNetworkId.value == null) return
  loading.value = true
  error.value = null
  try {
    overview.value = await $fetch<BillingOverview>('/api/settings/billing', {
      query: { networkId: currentNetworkId.value },
    })
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load billing'
  } finally {
    loading.value = false
  }
}

async function startCheckout() {
  if (currentNetworkId.value == null) return
  busy.value = true
  error.value = null
  try {
    const res = await $fetch<{ url: string }>('/api/settings/billing/checkout', {
      method: 'POST',
      body: { networkId: currentNetworkId.value },
    })
    window.location.assign(res.url)
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Checkout failed'
    busy.value = false
  }
}

async function openPortal() {
  if (currentNetworkId.value == null) return
  busy.value = true
  error.value = null
  try {
    const res = await $fetch<{ url: string }>('/api/settings/billing/portal', {
      method: 'POST',
      body: { networkId: currentNetworkId.value },
    })
    window.location.assign(res.url)
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Portal failed'
    busy.value = false
  }
}

onMounted(() => {
  const q = route.query.checkout
  if (q === 'success') flash.value = 'Subscription started — Stripe will confirm shortly.'
  else if (q === 'cancelled') flash.value = 'Checkout cancelled. No charge was made.'
  void load()
})
watch(currentNetworkId, () => {
  void load()
})
</script>

<template>
  <div class="page-shell module-page">
    <p class="eyebrow">Settings</p>
    <h1>Billing & Subscription</h1>
    <p class="page-intro">
      PMS.do commercial plan: usage-based subscription for every hotel and
      property on this network.
    </p>

    <div class="section-rule" />

    <p v-if="!canView" class="gate" role="alert">
      Billing is limited to organization admins.
    </p>

    <template v-else>
      <p v-if="flash" class="flash" role="status">{{ flash }}</p>
      <p v-if="error" class="gate failed" role="alert">{{ error }}</p>
      <p v-else-if="loading" class="muted">Loading billing…</p>

      <template v-else-if="overview">
        <section class="plan" aria-label="Plan rates">
          <p class="eyebrow">Plan</p>
          <h2>PMS.do subscription</h2>
          <div class="rates">
            <div>
              <strong>{{ money(overview.rates.propertyUsd) }}</strong>
              <span>/property/mo</span>
            </div>
            <div>
              <strong>{{ money(overview.rates.hotelUsd) }}</strong>
              <span>/hotel/mo</span>
            </div>
          </div>
        </section>

        <section class="usage" aria-label="Current usage">
          <h2>This network</h2>
          <dl>
            <div>
              <dt>Hotels</dt>
              <dd>
                {{ overview.counts.hotels }}
                <small>× {{ money(overview.rates.hotelUsd) }}</small>
              </dd>
            </div>
            <div>
              <dt>Properties</dt>
              <dd>
                {{ overview.counts.properties }}
                <small>× {{ money(overview.rates.propertyUsd) }}</small>
              </dd>
            </div>
            <div class="total">
              <dt>Estimated monthly</dt>
              <dd>{{ money(overview.estimateUsd) }}</dd>
            </div>
          </dl>
          <p class="hint">
            Hotels are listings with Channex type <code>hotel</code>. All other
            types bill at the property rate.
          </p>
        </section>

        <section class="status-panel" aria-label="Subscription status">
          <div class="status-row">
            <div>
              <p class="eyebrow">Status</p>
              <strong :class="['badge', overview.subscription.status]">
                {{ statusLabel }}
              </strong>
              <p v-if="overview.subscription.currentPeriodEnd" class="renewal">
                Current period ends {{ formatDate(overview.subscription.currentPeriodEnd) }}
              </p>
            </div>
            <div class="actions">
              <button
                v-if="!isSubscribed"
                type="button"
                class="btn-primary"
                :disabled="busy || !overview.configured || overview.estimateUsd <= 0"
                @click="startCheckout"
              >
                {{ busy ? 'Redirecting…' : 'Subscribe' }}
              </button>
              <button
                v-else
                type="button"
                class="btn-primary"
                :disabled="busy || !overview.configured"
                @click="openPortal"
              >
                {{ busy ? 'Redirecting…' : 'Manage billing' }}
              </button>
            </div>
          </div>
          <p v-if="!overview.configured" class="hint warn">
            Stripe is not configured on this deployment yet. Estimates still
            update; checkout and the portal stay disabled until
            <code>STRIPE_SECRET_KEY</code> and price IDs are set.
          </p>
        </section>

        <section v-if="overview.invoices.length" class="invoices" aria-label="Invoices">
          <h2>Recent invoices</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr v-for="inv in overview.invoices" :key="inv.id">
                  <td>{{ formatDate(inv.createdAt) }}</td>
                  <td>{{ money(inv.amountPaid || inv.amountDue, inv.currency) }}</td>
                  <td>{{ inv.status ?? '—' }}</td>
                  <td>
                    <a
                      v-if="inv.hostedInvoiceUrl"
                      :href="inv.hostedInvoiceUrl"
                      target="_blank"
                      rel="noopener"
                    >
                      View
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.module-page {
  max-width: 48rem;
}

.gate,
.muted,
.flash,
.hint {
  margin: 0 0 1rem;
  font-size: 0.78rem;
  line-height: 1.5;
}

.gate {
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  color: var(--muted);
  background: var(--surface);
}

.gate.failed {
  color: var(--danger);
}

.flash {
  padding: 0.75rem 0.9rem;
  border: 1px solid rgba(101, 213, 174, 0.35);
  border-radius: var(--radius);
  color: var(--accent-strong);
  background: var(--accent-soft);
}

.muted,
.hint {
  color: var(--muted);
}

.hint.warn {
  color: var(--faint);
}

.hint code {
  font-size: 0.72rem;
}

.plan,
.usage,
.status-panel,
.invoices {
  margin-top: 1.4rem;
  padding: 1.15rem 1.2rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.eyebrow {
  margin: 0 0 0.45rem;
  color: var(--accent);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.plan h2,
.usage h2,
.invoices h2 {
  margin: 0 0 0.9rem;
  font-size: 1rem;
}

.rates {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85rem;
}

.rates > div {
  display: grid;
  gap: 0.2rem;
  padding: 0.85rem 0.95rem;
  border: 1px solid var(--line);
  border-radius: calc(var(--radius) - 0.15rem);
  background: var(--surface-raised);
}

.rates strong {
  font-size: 1.35rem;
  letter-spacing: -0.02em;
}

.rates span,
dl small {
  color: var(--muted);
  font-size: 0.72rem;
}

dl {
  margin: 0;
  display: grid;
  gap: 0.55rem;
}

dl > div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: baseline;
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--line);
}

dl > div:last-child {
  border-bottom: 0;
}

dt {
  color: var(--muted);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

dd {
  margin: 0;
  text-align: right;
  font-size: 0.92rem;
  font-weight: 650;
}

.total dd {
  font-size: 1.15rem;
  color: var(--accent-strong);
}

.status-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}

.badge {
  display: inline-block;
  margin-top: 0.2rem;
  font-size: 1.05rem;
}

.badge.active,
.badge.trialing {
  color: var(--accent-strong);
}

.badge.past_due,
.badge.canceled,
.badge.incomplete {
  color: var(--danger);
}

.renewal {
  margin: 0.4rem 0 0;
  color: var(--muted);
  font-size: 0.72rem;
}

.btn-primary {
  padding: 0.65rem 1.05rem;
  border: 0;
  border-radius: 0.45rem;
  background: var(--accent);
  color: #04201a;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

th,
td {
  padding: 0.65rem 0.4rem;
  border-bottom: 1px solid var(--line);
  text-align: left;
}

th {
  color: var(--faint);
  font-size: 0.64rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

td a {
  color: var(--accent-strong);
  font-weight: 600;
  text-decoration: none;
}

@media (max-width: 640px) {
  .rates {
    grid-template-columns: 1fr;
  }
}
</style>
