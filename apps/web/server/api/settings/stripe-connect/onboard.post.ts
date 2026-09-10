import { z } from 'zod'
import { parseNetworkId } from '../../../utils/integrations'
import { requireBookingPolicyAccess, getLivePolicy, persistLivePolicy } from '../../../utils/booking-policy'
import { listScopedProperties } from '../../../utils/reservations'
import { stripeClient } from '../../../utils/property-stripe'
import { bookingCorsOrigin } from '../../../utils/public-booking'

const Body = z.strictObject({
  networkId: z.coerce.number().int().positive(),
  propertyId: z.coerce.number().int().positive(),
})

/** POST /api/settings/stripe-connect/onboard — Accounts v2 / current Connect onboarding. */
export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request' })
  }
  const networkId = parseNetworkId(parsed.data.networkId)
  const { principal } = await requireBookingPolicyAccess(event, networkId)
  const property = listScopedProperties(networkId, principal).find(
    (p) => p.id === parsed.data.propertyId,
  )
  if (!property) {
    throw createError({ statusCode: 404, statusMessage: 'Property not found' })
  }

  const stripe = stripeClient()
  const existing = getLivePolicy(networkId, parsed.data.propertyId)
  let accountId = existing?.stripeConnectAccountId
  if (!accountId) {
    const account = await stripe.accounts.create({
      controller: {
        fees: { payer: 'application' },
        losses: { payments: 'application' },
        stripe_dashboard: { type: 'express' },
      },
    })
    accountId = account.id
    if (existing) {
      await persistLivePolicy(networkId, {
        ...existing,
        stripeConnectAccountId: accountId,
        stripeChargesEnabled: account.charges_enabled === true,
        updatedAt: new Date().toISOString(),
      })
    }
  }

  const origin =
    process.env.BETTER_AUTH_URL?.replace(/\/$/, '') || 'https://app.pms.do'
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/settings/booking`,
    return_url: `${origin}/settings/booking`,
    type: 'account_onboarding',
  })
  void bookingCorsOrigin
  return { url: link.url, accountId }
})
