import { canPerformAction } from '@pms/auth'
import { isChannexCountry } from '../../../shared/channex-countries'
import { isChannexCurrency } from '../../../shared/channex-currencies'
import { parseNetworkId } from '../../utils/integrations'
import { requirePrincipal } from '../../utils/auth'
import {
  provisionOnboardingProperty,
  type OnboardingPropertyInput,
} from '../../utils/channex-onboarding'
import { isCommercialEdition } from '../../utils/edition'

type Body = OnboardingPropertyInput & { networkId?: number }

/**
 * POST /api/onboarding/property — commercial wizard: create property in Channex + local catalog.
 */
export default defineEventHandler(async (event) => {
  if (!isCommercialEdition()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Property onboarding is only available on the commercial platform',
    })
  }

  const body = (await readBody(event).catch(() => ({}))) as Body
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  if (principal.networkId !== networkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network mismatch' })
  }
  if (!canPerformAction(principal.role, 'integrations')) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const currency = (body.currency ?? 'USD').trim().toUpperCase()
  if (!isChannexCurrency(currency)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Currency must be a Channex-supported ISO 4217 code',
    })
  }

  const country = (body.country ?? '').trim().toUpperCase()
  if (!isChannexCountry(country)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Country must be a valid ISO 3166-1 alpha-2 code',
    })
  }

  const result = await provisionOnboardingProperty(networkId, {
    title: body.title ?? '',
    propertyType: body.propertyType ?? 'hotel',
    currency,
    timezone: body.timezone ?? 'UTC',
    address: body.address ?? '',
    city: body.city ?? '',
    country,
    state: body.state,
    zipCode: body.zipCode,
  })

  return { ok: true, ...result }
})
