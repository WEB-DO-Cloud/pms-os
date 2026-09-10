import { eq } from 'drizzle-orm'
import { processedStripeEvents } from '@pms/db'
import { getDb } from '../../../../utils/auth'
import { getDomainStore } from '../../../../utils/reservations'
import {
  alreadyProcessedStripeEvent,
  constructConnectEvent,
  fulfillPaidHold,
  releaseHold,
} from '../../../../utils/property-stripe'

/**
 * POST /api/public/booking/stripe-connect/webhook
 * Connect events only. Do not rate-limit. Do not reuse the SaaS billing webhook.
 */
export default defineEventHandler(async (event) => {
  const signature = getHeader(event, 'stripe-signature')
  if (!signature) {
    throw createError({ statusCode: 400, statusMessage: 'stripe-signature required' })
  }
  const rawBody = await readRawBody(event)
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty body' })
  }

  let stripeEvent
  try {
    stripeEvent = constructConnectEvent(rawBody, signature)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature'
    throw createError({ statusCode: 400, statusMessage: message })
  }

  const account =
    'account' in stripeEvent && typeof stripeEvent.account === 'string'
      ? stripeEvent.account
      : null

  if (
    stripeEvent.type !== 'checkout.session.completed' &&
    stripeEvent.type !== 'checkout.session.expired'
  ) {
    setResponseStatus(event, 200)
    return { received: true }
  }

  const session = stripeEvent.data.object as {
    id: string
    payment_status?: string
    amount_total?: number | null
    metadata?: { reservationId?: string; networkId?: string }
    status?: string
  }

  const persist = process.env.DATABASE_URL
    ? await Promise.all([
        import('../../../../lib/reservation-persistence'),
        import('../../../../lib/ari-persistence'),
      ])
    : null
  const db = persist ? getDb() : null

  if (persist && db) {
    const [existing] = await db
      .select({ eventId: processedStripeEvents.eventId })
      .from(processedStripeEvents)
      .where(eq(processedStripeEvents.eventId, stripeEvent.id))
      .limit(1)
    if (existing) {
      setResponseStatus(event, 200)
      return { received: true, duplicate: true }
    }
  }

  let reservation = null as ReturnType<typeof getDomainStore>['reservations'][number] | null
  if (persist && db) {
    const row = await persist[0].findReservationByCheckoutSession(db, session.id)
    if (row) {
      const store = getDomainStore(row.networkId)
      reservation = store.reservations.find((r) => r.id === row.id) ?? row
      if (!store.reservations.some((r) => r.id === row.id)) {
        store.reservations.push(row)
        reservation = row
      }
    }
  }
  if (!reservation) {
    const networkId = Number(session.metadata?.networkId)
    const reservationId = Number(session.metadata?.reservationId)
    if (Number.isFinite(networkId) && Number.isFinite(reservationId)) {
      const store = getDomainStore(networkId)
      reservation =
        store.reservations.find((r) => r.id === reservationId) ?? null
    }
  }
  if (!reservation || !account) {
    setResponseStatus(event, 200)
    return { received: true }
  }

  const store = getDomainStore(reservation.networkId)
  if (alreadyProcessedStripeEvent(store.processedStripeEventIds, stripeEvent.id)) {
    setResponseStatus(event, 200)
    return { received: true, duplicate: true }
  }

  const sessionBound =
    reservation.stripeCheckoutSessionId === session.id &&
    reservation.stripeConnectedAccountId === account
  if (!sessionBound) {
    setResponseStatus(event, 200)
    return { received: true, ignored: 'session_mismatch' }
  }

  if (stripeEvent.type === 'checkout.session.expired') {
    releaseHold(reservation, 'expired', store)
  } else if (session.payment_status === 'paid' && session.amount_total != null) {
    fulfillPaidHold({
      reservation,
      sessionId: session.id,
      accountId: account,
      amountTotal: session.amount_total,
      store,
    })
  }

  if (persist && db) {
    try {
      await persist[0].persistPublicBookingOutcome(db, reservation)
      const { offlineReservationCode } = await import('@pms/domain')
      const code = offlineReservationCode(reservation.networkId, reservation.id)
      await Promise.all(
        store.ariWriteIntents
          .filter(
            (i) =>
              i.networkId === reservation!.networkId &&
              (i.idempotencyKey === `booking_crs:${code}` ||
                i.idempotencyKey === `public_hold_avail:${reservation!.id}` ||
                i.idempotencyKey === `public_hold_avail_reverse:${reservation!.id}`),
          )
          .map(async (intent) => {
            const saved = await persist[1].persistAriIntent(db, intent)
            intent.id = saved.id
          }),
      )
      await db.insert(processedStripeEvents).values({
        eventId: stripeEvent.id,
        kind: 'connect',
      })
    } catch (err) {
      throw createError({
        statusCode: 500,
        statusMessage: err instanceof Error ? err.message : 'Persist failed',
      })
    }
  }

  store.processedStripeEventIds.push(stripeEvent.id)
  setResponseStatus(event, 200)
  return { received: true }
})
