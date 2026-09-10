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

const Query = z.strictObject({
  networkSlug: z.string().min(1),
  propertySlug: z.string().min(1),
  checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  adults: z.coerce.number().int().min(1).max(16).optional(),
})

/** GET /api/public/booking/catalog — unauthenticated property catalog + optional quote. */
export default defineEventHandler(async (event) => {
  if (event.method === 'OPTIONS') {
    applyBookingCors(event)
    return ''
  }
  applyBookingCors(event)
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid catalog query',
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
      propertyName: resolved.propertyName,
      offers: null,
    }
  }
  const datesReady = parsed.data.checkInDate && parsed.data.checkOutDate
  const offers = datesReady
    ? buildCatalogOffers(resolved, policy!, {
        checkInDate: parsed.data.checkInDate!,
        checkOutDate: parsed.data.checkOutDate!,
        adults: parsed.data.adults ?? 1,
      })
    : []
  return {
    status: 'ready' as const,
    propertyName: resolved.propertyName,
    currency: resolved.currency,
    collectionType: policy!.collectionType,
    termsText: policy!.termsText,
    offers,
  }
})
