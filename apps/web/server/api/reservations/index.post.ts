import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { createDirectBooking } from '../../utils/reservations'

/** POST /api/reservations — create direct booking (pending_sync until Channex write succeeds) */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) as {
    networkId?: number
    propertyId?: number
    checkInDate?: string
    checkOutDate?: string
    guestName?: string
    adults?: number
    children?: number
    infants?: number
    currency?: string
  }
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  if (principal.networkId !== networkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network mismatch' })
  }

  const propertyId = Number(body.propertyId)
  if (!Number.isFinite(propertyId) || propertyId < 1) {
    throw createError({ statusCode: 400, statusMessage: 'propertyId required' })
  }
  if (!body.checkInDate || !body.checkOutDate || !body.guestName?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'checkInDate, checkOutDate, and guestName required',
    })
  }

  return createDirectBooking(principal, {
    propertyId,
    checkInDate: body.checkInDate,
    checkOutDate: body.checkOutDate,
    guestName: body.guestName.trim(),
    adults: body.adults,
    children: body.children,
    infants: body.infants,
    currency: body.currency,
  })
})
