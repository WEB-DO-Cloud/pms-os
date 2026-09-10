import { createHash, randomBytes } from 'node:crypto'
import {
  buildPublicBookingPrincipal,
  getNetworkCapabilities,
  isCollectionType,
  mintQuoteToken,
  parentOrManualPlansForProperty,
  quoteStay,
  resolvePublicBookingReadiness,
  snapshotPaymentTerms,
  verifyQuoteToken,
  type LiveCollectionPolicy,
  type PaymentTermsSnapshot,
  type QuoteTokenPayload,
} from '@pms/domain'
import { and, eq } from 'drizzle-orm'
import { networks, properties } from '@pms/db'
import { getDb } from './auth'
import { getLivePolicy } from './booking-policy'
import { getDomainStore } from './reservations'
import { ensureSecretsHydrated, getSyncStore } from './sync'

export const BOOKING_CORS_METHODS = 'GET,POST,OPTIONS'
export const QUOTE_RATE_LIMIT = 60
export const BOOK_RATE_LIMIT = 10

const quoteHits = new Map<string, number[]>()
const bookHits = new Map<string, number[]>()
const confirmationIndex = new Map<string, { networkId: number; reservationId: number }>()

export function rememberConfirmationToken(
  token: string,
  networkId: number,
  reservationId: number,
) {
  confirmationIndex.set(token, { networkId, reservationId })
}

export function lookupConfirmationToken(token: string) {
  const hit = confirmationIndex.get(token)
  if (!hit) return null
  return (
    getDomainStore(hit.networkId).reservations.find((r) => r.id === hit.reservationId) ??
    null
  )
}

export function bookingCorsOrigin(): string {
  return process.env.PUBLIC_BOOKING_ORIGIN?.replace(/\/$/, '') || 'https://book.pms.do'
}

export function isAllowedBookingOrigin(origin: string | undefined): boolean {
  if (!origin) return false
  const allowed = new Set([bookingCorsOrigin()])
  const explicitLocal = process.env.PUBLIC_BOOKING_ORIGIN_LOCAL?.replace(/\/$/, '')
  if (explicitLocal) allowed.add(explicitLocal)
  else if (process.env.NODE_ENV !== 'production') {
    allowed.add('http://127.0.0.1:33102')
    allowed.add('http://localhost:3003')
  }
  return allowed.has(origin.replace(/\/$/, ''))
}

export function applyBookingCors(
  event: { headers: Headers; node?: { res?: { setHeader: (k: string, v: string) => void } } },
) {
  const origin = event.headers.get('origin') ?? undefined
  if (!isAllowedBookingOrigin(origin) || !event.node?.res) return false
  event.node.res.setHeader('Access-Control-Allow-Origin', origin!)
  event.node.res.setHeader('Access-Control-Allow-Methods', BOOKING_CORS_METHODS)
  event.node.res.setHeader(
    'Access-Control-Allow-Headers',
    'content-type, idempotency-key',
  )
  event.node.res.setHeader('Vary', 'Origin')
  return true
}

export function quoteTokenSecret(): string {
  const secret = process.env.QUOTE_TOKEN_SECRET?.trim()
  if (!secret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'QUOTE_TOKEN_SECRET is not configured',
    })
  }
  return secret
}

export function occupancyCapFor(capacity: number | null | undefined): number {
  return capacity && capacity > 0 ? capacity : 8
}

function pruneHits(map: Map<string, number[]>, key: string, now: number, windowMs: number) {
  const next = (map.get(key) ?? []).filter((t) => now - t < windowMs)
  if (next.length === 0) map.delete(key)
  else map.set(key, next)
  return next
}

export function assertPublicRateLimit(
  kind: 'quote' | 'book',
  ip: string,
  propertyId: number,
) {
  const now = Date.now()
  const key = `${kind}:${ip}:${propertyId}`
  const limit = kind === 'quote' ? QUOTE_RATE_LIMIT : BOOK_RATE_LIMIT
  const hits = pruneHits(kind === 'quote' ? quoteHits : bookHits, key, now, 60_000)
  if (hits.length >= limit) {
    throw createError({ statusCode: 429, statusMessage: 'Rate limit exceeded' })
  }
  hits.push(now)
}

export function clientIp(event: { headers: Headers; node?: { req?: { socket?: { remoteAddress?: string } } } }) {
  const realIp = event.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const forwarded = event.headers.get('x-forwarded-for')
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    if (hops.length > 0) return hops[hops.length - 1]!
  }
  return event.node?.req?.socket?.remoteAddress || 'unknown'
}

export function hashQuoteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newConfirmationToken(): string {
  return randomBytes(16).toString('hex')
}

export type ResolvedPublicProperty = {
  networkId: number
  networkSlug: string
  propertyId: number
  propertySlug: string
  propertyName: string
  timezone: string
  currency: string
  archived: boolean
  mappedRoomTypes: number
}

export async function resolvePublicProperty(
  networkSlug: string,
  propertySlug: string,
): Promise<ResolvedPublicProperty | { notFound: true }> {
  if (process.env.DATABASE_URL) {
    const db = getDb()
    const [row] = await db
      .select({
        networkId: networks.id,
        networkSlug: networks.slug,
        propertyId: properties.id,
        propertySlug: properties.slug,
        propertyName: properties.name,
        timezone: properties.timezone,
        currency: properties.currency,
        status: properties.status,
        archivedAt: properties.archivedAt,
      })
      .from(properties)
      .innerJoin(networks, eq(networks.id, properties.networkId))
      .where(and(eq(networks.slug, networkSlug), eq(properties.slug, propertySlug)))
      .limit(1)
    if (!row) return { notFound: true }
    await ensureSecretsHydrated(row.networkId)
    const store = getSyncStore(row.networkId)
    return {
      networkId: row.networkId,
      networkSlug: row.networkSlug,
      propertyId: row.propertyId,
      propertySlug: row.propertySlug,
      propertyName: row.propertyName,
      timezone: row.timezone || 'UTC',
      currency: row.currency || 'USD',
      archived: row.status === 'archived' || row.archivedAt != null,
      mappedRoomTypes: store.listRoomTypes(row.networkId, row.propertyId).length,
    }
  }

  // Tests / memory-only: scan hydrated stores is not possible without a registry.
  return { notFound: true }
}

export function publicReadinessFor(
  resolved: ResolvedPublicProperty,
  policy: LiveCollectionPolicy | null,
) {
  const store = getDomainStore(resolved.networkId)
  const caps = getNetworkCapabilities(store, resolved.networkId)
  return resolvePublicBookingReadiness({
    archived: resolved.archived,
    bookingCrsWrite: caps.bookingCrsWrite,
    policy,
    mappedRoomTypes: resolved.mappedRoomTypes,
    parentOrManualPlans: parentOrManualPlansForProperty(
      store,
      resolved.networkId,
      resolved.propertyId,
    ),
  })
}

export function buildCatalogOffers(
  resolved: ResolvedPublicProperty,
  policy: LiveCollectionPolicy,
  input: { checkInDate: string; checkOutDate: string; adults: number },
  nowMs = Date.now(),
) {
  const store = getDomainStore(resolved.networkId)
  const sync = getSyncStore(resolved.networkId)
  const rooms = sync.listRoomTypes(resolved.networkId, resolved.propertyId)
  const plans = parentOrManualPlansForProperty(
    store,
    resolved.networkId,
    resolved.propertyId,
  )
  const secret = quoteTokenSecret()
  const offers: Array<{
    roomTypeId: number
    roomTypeName: string
    ratePlanChannexId: string
    ratePlanTitle: string
    nights: { date: string; rateMinor: number }[]
    stayTotalMinor: number
    depositMinor: number
    currency: string
    quoteToken: string
    quoteExpiresAt: string
    remaining: number
  }> = []

  for (const room of rooms) {
    const plan = plans.find((p) => p.roomTypeChannexId === room.channexId)
    if (!plan) continue
    const quoted = quoteStay(store, {
      networkId: resolved.networkId,
      propertyId: resolved.propertyId,
      roomTypeId: room.id,
      ratePlanChannexId: plan.channexId,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      adults: input.adults,
      occupancyCap: room.capacity && room.capacity > 0 ? room.capacity : 8,
      timeZone: resolved.timezone,
      nowMs,
    })
    if (!quoted.ok) continue
    const snap = snapshotPaymentTerms(policy, quoted.stayTotalMinor, quoted.currency)
    const minted = mintQuoteToken(
      {
        networkId: resolved.networkId,
        propertyId: resolved.propertyId,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        roomTypeId: room.id,
        ratePlanChannexId: plan.channexId,
        adults: input.adults,
        baseSnapshotVersion: quoted.baseSnapshotVersion,
        nights: Object.fromEntries(quoted.nights.map((n) => [n.date, n.rateMinor])),
        currency: quoted.currency,
        stayTotalMinor: quoted.stayTotalMinor,
        depositMinor: snap.depositMinor,
        collectionType: policy.collectionType,
      },
      secret,
      nowMs,
    )
    offers.push({
      roomTypeId: room.id,
      roomTypeName: room.name,
      ratePlanChannexId: plan.channexId,
      ratePlanTitle: plan.title,
      nights: quoted.nights,
      stayTotalMinor: quoted.stayTotalMinor,
      depositMinor: snap.depositMinor,
      currency: quoted.currency,
      quoteToken: minted.token,
      quoteExpiresAt: minted.expiresAt,
      remaining: quoted.remaining,
    })
  }
  return offers
}

export function consumeQuoteToken(
  token: string,
  nowMs = Date.now(),
): QuoteTokenPayload {
  const verified = verifyQuoteToken(token, quoteTokenSecret(), nowMs)
  if (!verified.ok) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Quote expired. Please re-quote.',
      data: { code: 'QUOTE_INVALID', reason: verified.reason },
    })
  }
  const store = getDomainStore(verified.payload.networkId)
  const hash = hashQuoteToken(token)
  const usedInStore =
    store.usedQuoteTokenHashes.includes(hash) ||
    store.reservations.some((r) => r.quoteTokenHash === hash)
  if (usedInStore) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Quote already used. Please re-quote.',
      data: { code: 'QUOTE_USED' },
    })
  }
  return verified.payload
}

export function markQuoteTokenUsed(networkId: number, token: string) {
  getDomainStore(networkId).usedQuoteTokenHashes.push(hashQuoteToken(token))
}

export function snapshotFromToken(
  policy: LiveCollectionPolicy,
  payload: QuoteTokenPayload,
): PaymentTermsSnapshot {
  const snap = snapshotPaymentTerms(policy, payload.stayTotalMinor, payload.currency)
  if (
    !isCollectionType(payload.collectionType) ||
    payload.collectionType !== snap.collectionType ||
    payload.depositMinor !== snap.depositMinor
  ) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Quote expired. Please re-quote.',
      data: { code: 'QUOTE_STALE_POLICY' },
    })
  }
  return snap
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return null
  const [user, domain] = email.split('@')
  const visible = user!.slice(0, 1)
  return `${visible}***@${domain}`
}
