import { networkBilling, networks, properties } from '@pms/db'
import type { PropertyRow } from '@pms/sync'
import { eq } from 'drizzle-orm'
import Stripe from 'stripe'
import { getDb, requirePrincipal } from './auth'
import { getSyncStore } from './sync'

export const RATE_PROPERTY_USD = 6.9
export const RATE_HOTEL_USD = 20

export type BillableCounts = {
  hotels: number
  properties: number
}

export type BillingInvoice = {
  id: string
  amountDue: number
  amountPaid: number
  currency: string
  status: string | null
  createdAt: string
  hostedInvoiceUrl: string | null
  invoicePdf: string | null
}

export type BillingOverview = {
  networkId: number
  configured: boolean
  rates: { propertyUsd: number; hotelUsd: number }
  counts: BillableCounts
  estimateUsd: number
  subscription: {
    status: string
    stripeCustomerId: string | null
    stripeSubscriptionId: string | null
    currentPeriodEnd: string | null
  }
  invoices: BillingInvoice[]
}

export function requireBillingAdmin(role: string | null | undefined) {
  if (role !== 'org_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Billing is limited to organization admins' })
  }
}

export async function requireBillingAccess(
  event: { headers: Headers },
  networkId: number,
) {
  const resolved = await requirePrincipal(event, networkId)
  if (resolved.principal.networkId !== networkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network mismatch' })
  }
  requireBillingAdmin(resolved.principal.role)
  return resolved
}

/** Extract Channex property_type from a catalog row's raw payload. */
export function propertyTypeFromRaw(channexRaw: unknown): string | null {
  if (!channexRaw || typeof channexRaw !== 'object') return null
  const raw = channexRaw as {
    attributes?: { property_type?: unknown }
    property_type?: unknown
  }
  const t = raw.attributes?.property_type ?? raw.property_type
  return typeof t === 'string' && t.trim() ? t.trim().toLowerCase() : null
}

export function isHotelPropertyType(propertyType: string | null): boolean {
  return propertyType === 'hotel'
}

export function countBillableFromRows(
  rows: Array<{ channexRaw?: unknown }>,
): BillableCounts {
  let hotels = 0
  let props = 0
  for (const row of rows) {
    if (isHotelPropertyType(propertyTypeFromRaw(row.channexRaw))) hotels++
    else props++
  }
  return { hotels, properties: props }
}

export function estimateMonthlyUsd(counts: BillableCounts): number {
  return (
    Math.round(
      (counts.hotels * RATE_HOTEL_USD + counts.properties * RATE_PROPERTY_USD) * 100,
    ) / 100
  )
}

export function stripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
      process.env.STRIPE_PRICE_HOTEL?.trim() &&
      process.env.STRIPE_PRICE_PROPERTY?.trim(),
  )
}

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Stripe billing is not configured',
    })
  }
  return new Stripe(key)
}

export async function getBillableCounts(networkId: number): Promise<BillableCounts> {
  const store = getSyncStore(networkId)
  const memory = store.listProperties(networkId) as PropertyRow[]
  if (memory.length > 0) return countBillableFromRows(memory)

  const db = getDb()
  const rows = await db
    .select({ channexRaw: properties.channexRaw })
    .from(properties)
    .where(eq(properties.networkId, networkId))
  return countBillableFromRows(rows)
}

async function getOrCreateBillingRow(networkId: number) {
  const db = getDb()
  const [existing] = await db
    .select()
    .from(networkBilling)
    .where(eq(networkBilling.networkId, networkId))
    .limit(1)
  if (existing) return existing
  const [created] = await db
    .insert(networkBilling)
    .values({ networkId, status: 'none' })
    .returning()
  return created!
}

export async function upsertNetworkBilling(input: {
  networkId: number
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  status?: string
  currentPeriodEnd?: Date | null
}) {
  const db = getDb()
  const existing = await getOrCreateBillingRow(input.networkId)
  const [row] = await db
    .update(networkBilling)
    .set({
      stripeCustomerId:
        input.stripeCustomerId !== undefined
          ? input.stripeCustomerId
          : existing.stripeCustomerId,
      stripeSubscriptionId:
        input.stripeSubscriptionId !== undefined
          ? input.stripeSubscriptionId
          : existing.stripeSubscriptionId,
      status: input.status ?? existing.status,
      currentPeriodEnd:
        input.currentPeriodEnd !== undefined
          ? input.currentPeriodEnd
          : existing.currentPeriodEnd,
      updatedAt: new Date(),
    })
    .where(eq(networkBilling.networkId, input.networkId))
    .returning()
  return row!
}

async function ensureStripeCustomer(networkId: number, email?: string | null) {
  const row = await getOrCreateBillingRow(networkId)
  if (row.stripeCustomerId) return row.stripeCustomerId

  const db = getDb()
  const [net] = await db
    .select({ name: networks.name })
    .from(networks)
    .where(eq(networks.id, networkId))
    .limit(1)

  const stripe = getStripe()
  const customer = await stripe.customers.create({
    name: net?.name ?? `Network ${networkId}`,
    email: email ?? undefined,
    metadata: { networkId: String(networkId) },
  })
  await upsertNetworkBilling({
    networkId,
    stripeCustomerId: customer.id,
  })
  return customer.id
}

/**
 * ponytail: quantity sync is lazy (on overview GET). Ceiling = brief drift between
 * property create/import and next billing page view. Upgrade: call from onboarding/import.
 */
export async function syncSubscriptionQuantities(networkId: number): Promise<void> {
  if (!stripeConfigured()) return
  const row = await getOrCreateBillingRow(networkId)
  if (!row.stripeSubscriptionId) return
  if (!['active', 'trialing', 'past_due'].includes(row.status)) return

  const stripe = getStripe()
  const counts = await getBillableCounts(networkId)
  const sub = await stripe.subscriptions.retrieve(row.stripeSubscriptionId)
  const hotelPrice = process.env.STRIPE_PRICE_HOTEL!.trim()
  const propertyPrice = process.env.STRIPE_PRICE_PROPERTY!.trim()

  for (const item of sub.items.data) {
    const priceId = item.price.id
    let qty: number | null = null
    if (priceId === hotelPrice) qty = counts.hotels
    else if (priceId === propertyPrice) qty = counts.properties
    if (qty == null || item.quantity === qty) continue
    await stripe.subscriptionItems.update(item.id, {
      quantity: qty,
      proration_behavior: 'create_prorations',
    })
  }
}

async function listRecentInvoices(customerId: string | null): Promise<BillingInvoice[]> {
  if (!customerId || !stripeConfigured()) return []
  const stripe = getStripe()
  const res = await stripe.invoices.list({ customer: customerId, limit: 8 })
  return res.data.map((inv) => ({
    id: inv.id,
    amountDue: (inv.amount_due ?? 0) / 100,
    amountPaid: (inv.amount_paid ?? 0) / 100,
    currency: (inv.currency ?? 'usd').toUpperCase(),
    status: inv.status,
    createdAt: new Date((inv.created ?? 0) * 1000).toISOString(),
    hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    invoicePdf: inv.invoice_pdf ?? null,
  }))
}

export async function getBillingOverview(networkId: number): Promise<BillingOverview> {
  const configured = stripeConfigured()
  const counts = await getBillableCounts(networkId)
  if (configured) {
    try {
      await syncSubscriptionQuantities(networkId)
    } catch {
      // Non-fatal — overview still returns local estimate + stored status.
    }
  }

  const row = await getOrCreateBillingRow(networkId)
  const invoices = await listRecentInvoices(row.stripeCustomerId)

  return {
    networkId,
    configured,
    rates: { propertyUsd: RATE_PROPERTY_USD, hotelUsd: RATE_HOTEL_USD },
    counts,
    estimateUsd: estimateMonthlyUsd(counts),
    subscription: {
      status: row.status,
      stripeCustomerId: row.stripeCustomerId,
      stripeSubscriptionId: row.stripeSubscriptionId,
      currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    },
    invoices,
  }
}

export async function createCheckoutSession(input: {
  networkId: number
  email?: string | null
}): Promise<{ url: string }> {
  if (!stripeConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Stripe billing is not configured',
    })
  }

  const counts = await getBillableCounts(input.networkId)
  if (counts.hotels + counts.properties === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Add at least one property before subscribing',
    })
  }

  const customerId = await ensureStripeCustomer(input.networkId, input.email)
  const stripe = getStripe()
  const base = (process.env.BETTER_AUTH_URL ?? 'https://app.pms.do').replace(/\/$/, '')

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []
  if (counts.hotels > 0) {
    lineItems.push({
      price: process.env.STRIPE_PRICE_HOTEL!.trim(),
      quantity: counts.hotels,
    })
  }
  if (counts.properties > 0) {
    lineItems.push({
      price: process.env.STRIPE_PRICE_PROPERTY!.trim(),
      quantity: counts.properties,
    })
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: lineItems,
    success_url: `${base}/settings/billing?checkout=success`,
    cancel_url: `${base}/settings/billing?checkout=cancelled`,
    client_reference_id: String(input.networkId),
    metadata: { networkId: String(input.networkId) },
    subscription_data: {
      metadata: { networkId: String(input.networkId) },
    },
  })

  if (!session.url) {
    throw createError({ statusCode: 502, statusMessage: 'Stripe Checkout URL missing' })
  }
  return { url: session.url }
}

export async function createPortalSession(networkId: number): Promise<{ url: string }> {
  if (!stripeConfigured()) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Stripe billing is not configured',
    })
  }
  const row = await getOrCreateBillingRow(networkId)
  if (!row.stripeCustomerId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No Stripe customer — subscribe first',
    })
  }
  const stripe = getStripe()
  const base = (process.env.BETTER_AUTH_URL ?? 'https://app.pms.do').replace(/\/$/, '')
  const session = await stripe.billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${base}/settings/billing`,
  })
  return { url: session.url }
}

function networkIdFromStripeObject(obj: {
  metadata?: { networkId?: string } | null
  client_reference_id?: string | null
}): number | null {
  const raw = obj.metadata?.networkId ?? obj.client_reference_id
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Stripe SDK v22 moved period bounds onto subscription items. */
function subscriptionPeriodEnd(sub: Stripe.Subscription): Date | null {
  const ends = sub.items.data
    .map((item) => item.current_period_end)
    .filter((n): n is number => typeof n === 'number' && n > 0)
  if (ends.length === 0) return null
  return new Date(Math.max(...ends) * 1000)
}

function invoiceSubscriptionId(inv: Stripe.Invoice): string | null {
  const sub = inv.parent?.subscription_details?.subscription
  if (!sub) return null
  return typeof sub === 'string' ? sub : sub.id
}

export async function handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const networkId = networkIdFromStripeObject(session)
      if (!networkId) return
      const subId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id
      const customerId =
        typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id
      let periodEnd: Date | null = null
      let status = 'active'
      if (subId && stripeConfigured()) {
        const stripe = getStripe()
        const sub = await stripe.subscriptions.retrieve(subId)
        status = sub.status
        periodEnd = subscriptionPeriodEnd(sub)
      }
      await upsertNetworkBilling({
        networkId,
        stripeCustomerId: customerId ?? undefined,
        stripeSubscriptionId: subId ?? undefined,
        status,
        currentPeriodEnd: periodEnd,
      })
      break
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const networkId = networkIdFromStripeObject(sub)
      if (!networkId) {
        // Fallback: find by subscription id
        const db = getDb()
        const [row] = await db
          .select()
          .from(networkBilling)
          .where(eq(networkBilling.stripeSubscriptionId, sub.id))
          .limit(1)
        if (!row) return
        await upsertNetworkBilling({
          networkId: row.networkId,
          stripeSubscriptionId: sub.id,
          status: event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
          currentPeriodEnd: subscriptionPeriodEnd(sub),
        })
        return
      }
      await upsertNetworkBilling({
        networkId,
        stripeSubscriptionId: sub.id,
        status: event.type === 'customer.subscription.deleted' ? 'canceled' : sub.status,
        currentPeriodEnd: subscriptionPeriodEnd(sub),
      })
      break
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice
      const subId = invoiceSubscriptionId(inv)
      if (!subId) return
      const db = getDb()
      const [row] = await db
        .select()
        .from(networkBilling)
        .where(eq(networkBilling.stripeSubscriptionId, subId))
        .limit(1)
      if (!row) return
      await upsertNetworkBilling({
        networkId: row.networkId,
        status: event.type === 'invoice.paid' ? 'active' : 'past_due',
      })
      break
    }
    default:
      break
  }
}

export function constructStripeEvent(rawBody: string | Buffer, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!secret) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Stripe webhook secret not configured',
    })
  }
  const stripe = getStripe()
  return stripe.webhooks.constructEvent(rawBody, signature, secret)
}
