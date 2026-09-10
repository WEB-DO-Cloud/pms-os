import { z } from 'zod'
import { parseNetworkId } from '../../utils/integrations'
import {
  parseCollectionType,
  persistLivePolicy,
  previewDeposit,
  requireBookingPolicyAccess,
} from '../../utils/booking-policy'
import { listScopedProperties } from '../../utils/reservations'

const Body = z.strictObject({
  networkId: z.coerce.number().int().positive(),
  propertyId: z.coerce.number().int().positive(),
  collectionType: z.string(),
  percent: z.number().int().min(1).max(100).nullable().optional(),
  fixedAmountMinor: z.number().int().min(0).nullable().optional(),
  termsText: z.string().min(1),
})

/** PUT /api/settings/booking-policy — staff session only. */
export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid booking policy',
      data: z.treeifyError(parsed.error),
    })
  }
  const networkId = parseNetworkId(parsed.data.networkId)
  const { principal } = await requireBookingPolicyAccess(event, networkId)
  const property = listScopedProperties(networkId, principal).find(
    (p) => p.id === parsed.data.propertyId,
  )
  if (!property) {
    throw createError({ statusCode: 404, statusMessage: 'Property not found' })
  }
  const collectionType = parseCollectionType(parsed.data.collectionType)
  const existing = (await import('../../utils/booking-policy')).getLivePolicy(
    networkId,
    parsed.data.propertyId,
  )
  const policy = await persistLivePolicy(networkId, {
    propertyId: parsed.data.propertyId,
    collectionType,
    percent: collectionType === 'percent' ? (parsed.data.percent ?? null) : null,
    fixedAmountMinor:
      collectionType === 'fixed' ? (parsed.data.fixedAmountMinor ?? null) : null,
    termsText: parsed.data.termsText.trim(),
    stripeConnectAccountId: existing?.stripeConnectAccountId ?? null,
    stripeChargesEnabled: existing?.stripeChargesEnabled ?? false,
    updatedAt: new Date().toISOString(),
  })
  return {
    policy,
    preview: previewDeposit(policy, 10_000),
  }
})
