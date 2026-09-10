import { collectNowNeedsCharges } from '@pms/domain'
import { eq } from 'drizzle-orm'
import { networks } from '@pms/db'
import { getDb } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import {
  getLivePolicy,
  previewDeposit,
  requireBookingPolicyAccess,
} from '../../utils/booking-policy'
import { listScopedProperties } from '../../utils/reservations'

function publicBookingOrigin() {
  return (
    process.env.PUBLIC_BOOKING_ORIGIN?.replace(/\/$/, '') || 'https://book.pms.do'
  )
}

async function networkSlug(networkId: number): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null
  const [row] = await getDb()
    .select({ slug: networks.slug })
    .from(networks)
    .where(eq(networks.id, networkId))
    .limit(1)
  return row?.slug ?? null
}

/** GET /api/settings/booking-policy?networkId=&propertyId= */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const networkId = parseNetworkId(query.networkId)
  const { principal } = await requireBookingPolicyAccess(event, networkId)
  const propertyId = Number(query.propertyId)
  if (!Number.isFinite(propertyId) || propertyId < 1) {
    throw createError({ statusCode: 400, statusMessage: 'propertyId required' })
  }
  const property = listScopedProperties(networkId, principal).find((p) => p.id === propertyId)
  if (!property) {
    throw createError({ statusCode: 404, statusMessage: 'Property not found' })
  }
  const policy = getLivePolicy(networkId, propertyId)
  const preview = policy ? previewDeposit(policy, 10_000) : null
  const slug = (await networkSlug(networkId)) ?? String(query.networkSlug ?? '')
  const ready = policy != null && !collectNowNeedsCharges(policy) && Boolean(slug)
  return {
    networkId,
    propertyId,
    propertyName: property.name,
    policy,
    preview,
    collectNowNotReady: policy ? collectNowNeedsCharges(policy) : false,
    publicBookingUrl: ready
      ? `${publicBookingOrigin()}/${slug}/${property.slug}`
      : null,
  }
})
