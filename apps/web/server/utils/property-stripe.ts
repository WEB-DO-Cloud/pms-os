import Stripe from 'stripe'
import {
  buildBookingCrsPayload,
  enqueueAriIntent,
  offlineReservationCode,
  pendingPublicCrsFromRaw,
  type DomainStore,
  type PaymentTermsSnapshot,
  type ReservationRecord,
} from '@pms/domain'
import { getDomainStore } from './reservations'
import { bookingCorsOrigin } from './public-booking'
import { getLivePolicy } from './booking-policy'

export const CHECKOUT_TTL_SEC = 30 * 60

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) {
    throw createError({ statusCode: 500, statusMessage: 'STRIPE_SECRET_KEY is not configured' })
  }
  return new Stripe(key)
}

export function constructConnectEvent(rawBody: string | Buffer, signature: string) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.trim()
  if (!secret) {
    throw new Error('STRIPE_CONNECT_WEBHOOK_SECRET is not configured')
  }
  return stripeClient().webhooks.constructEvent(rawBody, signature, secret)
}

export async function createCheckoutForHold(input: {
  reservation: ReservationRecord
  snapshot: PaymentTermsSnapshot
  successPath: string
  cancelPath: string
}): Promise<{ id: string; url: string; accountId: string }> {
  const policy = getLivePolicy(input.reservation.networkId, input.reservation.propertyId)
  const accountId = policy?.stripeConnectAccountId
  if (!accountId || !policy?.stripeChargesEnabled) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Property Stripe account is not ready',
    })
  }
  const origin = bookingCorsOrigin()
  const stripe = stripeClient()
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      payment_intent_data: { capture_method: 'automatic' },
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SEC,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.snapshot.currency.toLowerCase(),
            unit_amount: input.snapshot.depositMinor,
            product_data: { name: 'Stay deposit' },
          },
        },
      ],
      success_url: `${origin}${input.successPath}`,
      cancel_url: `${origin}${input.cancelPath}`,
      metadata: {
        reservationId: String(input.reservation.id),
        networkId: String(input.reservation.networkId),
      },
    },
    { stripeAccount: accountId },
  )
  if (!session.url) {
    throw createError({ statusCode: 502, statusMessage: 'Checkout session missing URL' })
  }
  return { id: session.id, url: session.url, accountId }
}

export function fulfillPaidHold(input: {
  reservation: ReservationRecord
  sessionId: string
  accountId: string
  amountTotal: number
  store?: DomainStore
}): { fulfilled: boolean; reason?: string } {
  if (input.reservation.status !== 'pending_payment') {
    return { fulfilled: false, reason: 'not_pending' }
  }
  if (
    input.reservation.stripeCheckoutSessionId !== input.sessionId ||
    input.reservation.stripeConnectedAccountId !== input.accountId ||
    input.reservation.stripeAmountTotal !== input.amountTotal
  ) {
    return { fulfilled: false, reason: 'mismatch' }
  }
  const pending = pendingPublicCrsFromRaw(input.reservation.channexRaw)
  if (!pending || !input.reservation.guestName || !input.reservation.roomTypeId) {
    return { fulfilled: false, reason: 'missing_crs' }
  }
  input.reservation.status = 'pending_sync'
  input.reservation.pendingSyncReason = 'direct_booking_awaiting_channex'
  const store = input.store ?? getDomainStore(input.reservation.networkId)
  const code = offlineReservationCode(
    input.reservation.networkId,
    input.reservation.id,
  )
  const existing = store.ariWriteIntents.find(
    (i) => i.idempotencyKey === `booking_crs:${code}`,
  )
  if (!existing) {
    enqueueAriIntent(store, {
      networkId: input.reservation.networkId,
      propertyId: input.reservation.propertyId,
      lane: 'booking_crs',
      idempotencyKey: `booking_crs:${code}`,
      payload: buildBookingCrsPayload({
        networkId: input.reservation.networkId,
        reservationId: input.reservation.id,
        roomTypeId: input.reservation.roomTypeId,
        checkInDate: input.reservation.checkInDate,
        checkOutDate: input.reservation.checkOutDate,
        currency: input.reservation.currency,
        guestName: input.reservation.guestName,
        guestEmail: input.reservation.guestEmail,
        adults: input.reservation.adults ?? 1,
        children: input.reservation.children ?? 0,
        infants: input.reservation.infants ?? 0,
        roomTypeChannexId: pending.roomTypeChannexId,
        ratePlanChannexId: pending.ratePlanChannexId,
        days: pending.days,
      }),
      resourceScope: {
        roomTypeChannexId: pending.roomTypeChannexId,
        ratePlanChannexId: pending.ratePlanChannexId,
        dateFrom: input.reservation.checkInDate,
        dateTo: input.reservation.checkOutDate,
      },
      baseSnapshotVersion: null,
      actorPrincipalId: `public-booking:${input.reservation.networkId}`,
    })
  }
  const alreadyLedgred = store.ledger.some(
    (e) => e.reservationId === input.reservation.id && e.type === 'payment',
  )
  if (!alreadyLedgred) {
    store.ledger.push({
      id: store.nextId('ledger'),
      networkId: input.reservation.networkId,
      reservationId: input.reservation.id,
      type: 'payment',
      amountMinor: input.amountTotal,
      currency: input.reservation.currency,
      note: 'Public booking Stripe Connect deposit',
      createdByPrincipal: `public-booking:${input.reservation.networkId}`,
      compensatesEntryId: null,
      createdAt: new Date().toISOString(),
    })
  }
  return { fulfilled: true }
}

export function releaseHold(
  reservation: ReservationRecord,
  reason: 'expired' | 'cancelled',
  store = getDomainStore(reservation.networkId),
) {
  if (reservation.status !== 'pending_payment') return
  reservation.status = 'released'
  reservation.pendingSyncReason = `checkout_${reason}`
  const hold = store.ariWriteIntents.find(
    (i) => i.idempotencyKey === `public_hold_avail:${reservation.id}`,
  )
  if (hold && hold.status === 'queued') {
    hold.status = 'cancelled'
  } else if (hold) {
    enqueueAriIntent(store, {
      networkId: reservation.networkId,
      propertyId: reservation.propertyId,
      lane: 'availability',
      idempotencyKey: `public_hold_avail_reverse:${reservation.id}`,
      payload: { reverseOf: hold.id },
      resourceScope: hold.resourceScope,
      baseSnapshotVersion: null,
      actorPrincipalId: `public-booking:${reservation.networkId}`,
      compensatesIntentId: hold.id,
    })
  }
}

export async function reconcileCheckoutSession(reservation: ReservationRecord) {
  if (
    reservation.status !== 'pending_payment' ||
    !reservation.stripeCheckoutSessionId ||
    !reservation.stripeConnectedAccountId
  ) {
    return
  }
  try {
    const session = await stripeClient().checkout.sessions.retrieve(
      reservation.stripeCheckoutSessionId,
      { stripeAccount: reservation.stripeConnectedAccountId },
    )
    if (session.payment_status === 'paid' && session.amount_total != null) {
      fulfillPaidHold({
        reservation,
        sessionId: session.id,
        accountId: reservation.stripeConnectedAccountId,
        amountTotal: session.amount_total,
      })
      return
    }
    if (session.status === 'expired') {
      releaseHold(reservation, 'expired')
    }
  } catch {
    // Do not release on retrieve failure; webhook remains the primary path.
  }
}

export async function refundPaidPublicReservation(reservation: ReservationRecord) {
  if (!reservation.stripeCheckoutSessionId || !reservation.stripeConnectedAccountId) {
    return
  }
  const stripe = stripeClient()
  const session = await stripe.checkout.sessions.retrieve(
    reservation.stripeCheckoutSessionId,
    { stripeAccount: reservation.stripeConnectedAccountId },
  )
  const pi =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id
  if (!pi) return
  await stripe.refunds.create({ payment_intent: pi }, {
    stripeAccount: reservation.stripeConnectedAccountId,
  })
  reservation.status = 'refunded'
}

export function alreadyProcessedStripeEvent(storeEventIds: string[], eventId: string) {
  return storeEventIds.includes(eventId)
}
