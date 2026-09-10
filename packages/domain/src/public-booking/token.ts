import { createHmac, timingSafeEqual } from 'node:crypto'

export const QUOTE_TOKEN_TTL_MS = 15 * 60 * 1000

export type QuoteTokenPayload = {
  networkId: number
  propertyId: number
  checkInDate: string
  checkOutDate: string
  roomTypeId: number
  ratePlanChannexId: string
  adults: number
  baseSnapshotVersion: number
  nights: Record<string, number>
  currency: string
  stayTotalMinor: number
  depositMinor: number
  collectionType: string
  exp: number
}

function canonicalJson(payload: QuoteTokenPayload): string {
  return JSON.stringify({
    adults: payload.adults,
    baseSnapshotVersion: payload.baseSnapshotVersion,
    checkInDate: payload.checkInDate,
    checkOutDate: payload.checkOutDate,
    collectionType: payload.collectionType,
    currency: payload.currency,
    depositMinor: payload.depositMinor,
    exp: payload.exp,
    networkId: payload.networkId,
    nights: Object.fromEntries(
      Object.entries(payload.nights).sort(([a], [b]) => a.localeCompare(b)),
    ),
    propertyId: payload.propertyId,
    ratePlanChannexId: payload.ratePlanChannexId,
    roomTypeId: payload.roomTypeId,
    stayTotalMinor: payload.stayTotalMinor,
  })
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

export function mintQuoteToken(
  payload: Omit<QuoteTokenPayload, 'exp'>,
  secret: string,
  nowMs = Date.now(),
  ttlMs = QUOTE_TOKEN_TTL_MS,
): { token: string; expiresAt: string; payload: QuoteTokenPayload } {
  if (!secret.trim()) {
    throw { code: 'VALIDATION', message: 'QUOTE_TOKEN_SECRET is required' }
  }
  const full: QuoteTokenPayload = { ...payload, exp: nowMs + ttlMs }
  const body = canonicalJson(full)
  const token = `${Buffer.from(body, 'utf8').toString('base64url')}.${sign(body, secret)}`
  return { token, expiresAt: new Date(full.exp).toISOString(), payload: full }
}

export function verifyQuoteToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
):
  | { ok: true; payload: QuoteTokenPayload }
  | { ok: false; reason: 'malformed' | 'bad_mac' | 'expired' } {
  if (!token || !secret.trim()) return { ok: false, reason: 'malformed' }
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return { ok: false, reason: 'malformed' }
  const bodyB64 = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  let body: string
  try {
    body = Buffer.from(bodyB64, 'base64url').toString('utf8')
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  const expected = sign(body, secret)
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_mac' }
  }
  let payload: QuoteTokenPayload
  try {
    payload = JSON.parse(body) as QuoteTokenPayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (payload.exp <= nowMs) return { ok: false, reason: 'expired' }
  return { ok: true, payload }
}
