import { z } from 'zod'
import {
  applyBookingCors,
  assertPublicRateLimit,
  buildCatalogOffers,
  clientIp,
  publicReadinessFor,
  resolvePublicProperty,
} from '../../../utils/public-booking'
import { getLivePolicy } from '../../../utils/booking-policy'

const Body = z.strictObject({
  networkSlug: z.string().min(1),
  propertySlug: z.string().min(1),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.number().int().min(1).max(16),
})

/** POST /api/public/booking/quote — server-owned stay quote + HMAC token. */
export default defineEventHandler(async (event) => {
  if (event.method === 'OPTIONS') {
    applyBookingCors(event)
    return ''
  }
  applyBookingCors(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid quote',
      data: z.treeifyError(parsed.error),
    })
  }
  const resolved = await resolvePublicProperty(
    parsed.data.networkSlug,
    parsed.data.propertySlug,
  )
  if ('notFound' in resolved) {
    throw createError({ statusCode: 404, statusMessage: 'Not found', data: { code: 'NOT_FOUND' } })
  }
  assertPublicRateLimit('quote', clientIp(event), resolved.propertyId)
  const policy = getLivePolicy(resolved.networkId, resolved.propertyId)
  const readiness = publicReadinessFor(resolved, policy)
  if (readiness.status === 'not_found') {
    throw createError({ statusCode: 404, statusMessage: 'Not found', data: { code: 'NOT_FOUND' } })
  }
  if (readiness.status === 'not_ready') {
    return {
      status: 'not_ready' as const,
      reason: readiness.reason,
      offers: null,
    }
  }
  const offers = buildCatalogOffers(resolved, policy!, parsed.data)
  return {
    status: 'ready' as const,
    propertyName: resolved.propertyName,
    collectionType: policy!.collectionType,
    termsText: policy!.termsText,
    offers,
  }
})
