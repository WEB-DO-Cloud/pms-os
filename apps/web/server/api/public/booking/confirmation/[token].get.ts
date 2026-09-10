import {
  applyBookingCors,
  lookupConfirmationToken,
  maskEmail,
} from '../../../../utils/public-booking'
import { getDomainStore } from '../../../../utils/reservations'
import { getDb } from '../../../../utils/auth'
import { reconcileCheckoutSession } from '../../../../utils/property-stripe'

function guestFacingStatus(status: string): 'received' | 'released' | 'refunded' {
  if (status === 'released' || status === 'cancelled' || status === 'expired') {
    return 'released'
  }
  if (status === 'refunded') return 'refunded'
  return 'received'
}

/** GET /api/public/booking/confirmation/:token — masked confirmation (KTD13). */
export default defineEventHandler(async (event) => {
  if (event.method === 'OPTIONS') {
    applyBookingCors(event)
    return ''
  }
  applyBookingCors(event)
  const token = getRouterParam(event, 'token')?.trim()
  if (!token || token.length < 16) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  let row = lookupConfirmationToken(token)
  if (!row && process.env.DATABASE_URL) {
    const { findReservationByConfirmationToken } = await import(
      '../../../../lib/reservation-persistence'
    )
    row = await findReservationByConfirmationToken(getDb(), token)
  }

  if (row) {
    await reconcileCheckoutSession(row)
    if (process.env.DATABASE_URL) {
      const { persistPublicBookingOutcome } = await import(
        '../../../../lib/reservation-persistence'
      )
      await persistPublicBookingOutcome(getDb(), row)
    }
  }

  const storeRow = row
    ? getDomainStore(row.networkId).reservations.find((r) => r.id === row!.id) ?? row
    : null
  if (!storeRow) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const snapshot = storeRow.paymentTermsSnapshot
  return {
    status: guestFacingStatus(storeRow.status),
    confirming: storeRow.status === 'pending_sync' || storeRow.status === 'pending_payment',
    checkInDate: storeRow.checkInDate,
    checkOutDate: storeRow.checkOutDate,
    currency: storeRow.currency,
    stayTotalMinor: snapshot?.stayTotalMinor ?? storeRow.totalAmountMinor ?? null,
    depositMinor: snapshot?.depositMinor ?? 0,
    collectionType: snapshot?.collectionType ?? null,
    guestEmailMasked: maskEmail(storeRow.guestEmail),
    message:
      storeRow.status === 'pending_payment'
        ? 'Payment is still processing. This page does not confirm a paid stay from redirect alone.'
        : 'Booking received, confirming with the property.',
  }
})
