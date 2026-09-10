import { z } from 'zod'
import {
  buildPublicBookingPrincipal,
  enqueueAriIntent,
  getNetworkCapabilities,
  isCollectNow,
  offlineReservationCode,
  quoteStay,
  runCommand,
  stayNightDates,
  type DomainStore,
  type ReservationRecord,
} from '@pms/domain'
import {
  applyBookingCors,
  assertPublicRateLimit,
  clientIp,
  consumeQuoteToken,
  hashQuoteToken,
  markQuoteTokenUsed,
  newConfirmationToken,
  occupancyCapFor,
  rememberConfirmationToken,
  publicReadinessFor,
  resolvePublicProperty,
  snapshotFromToken,
} from '../../../utils/public-booking'
import { getLivePolicy } from '../../../utils/booking-policy'
import { commandCtx, getDomainStore } from '../../../utils/reservations'
import { getSyncStore } from '../../../utils/sync'
import { getDb } from '../../../utils/auth'
import {
  CHECKOUT_TTL_SEC,
  createCheckoutForHold,
  stripeClient,
} from '../../../utils/property-stripe'

const Body = z.strictObject({
  networkSlug: z.string().min(1),
  propertySlug: z.string().min(1),
  quoteToken: z.string().min(8),
  guestName: z.string().min(1),
  guestEmail: z.email(),
  adults: z.number().int().min(1).max(16),
  termsAccepted: z.literal(true),
  idempotencyKey: z.string().min(8).max(128),
  stayTotalMinor: z.number().optional(),
  depositMinor: z.number().optional(),
  collectionType: z.string().optional(),
})

const CHECKOUT_TTL_MS = CHECKOUT_TTL_SEC * 1000

function rebindReservationIdentity(
  store: DomainStore,
  reservation: ReservationRecord,
  newId: number,
) {
  const oldId = reservation.id
  const oldCode = reservation.otaReservationCode
  const newCode = offlineReservationCode(reservation.networkId, newId)
  reservation.id = newId
  reservation.otaReservationCode = newCode
  for (const intent of store.ariWriteIntents) {
    if (oldCode && intent.idempotencyKey === `booking_crs:${oldCode}`) {
      intent.idempotencyKey = `booking_crs:${newCode}`
      const payload = intent.payload as {
        ota_reservation_code?: string
        _local?: { reservationId?: number }
      }
      payload.ota_reservation_code = newCode
      if (payload._local) payload._local.reservationId = newId
    }
    if (intent.idempotencyKey === `public_hold_avail:${oldId}`) {
      intent.idempotencyKey = `public_hold_avail:${newId}`
    }
  }
}

async function replayExistingBook(input: {
  existing: ReservationRecord
  collectNow: boolean
  confirmationToken: string
  successPath: string
  cancelPath: string
}) {
  let checkoutUrl: string | null = null
  if (input.collectNow && input.existing.status === 'pending_payment') {
    const snapshot = input.existing.paymentTermsSnapshot
    if (
      input.existing.stripeCheckoutSessionId &&
      input.existing.stripeConnectedAccountId
    ) {
      try {
        const session = await stripeClient().checkout.sessions.retrieve(
          input.existing.stripeCheckoutSessionId,
          { stripeAccount: input.existing.stripeConnectedAccountId },
        )
        if (session.status === 'open' && session.url) {
          checkoutUrl = session.url
        }
      } catch {
        checkoutUrl = null
      }
    }
    if (!checkoutUrl && snapshot) {
      const session = await createCheckoutForHold({
        reservation: input.existing,
        snapshot,
        successPath: input.successPath,
        cancelPath: input.cancelPath,
      })
      input.existing.stripeCheckoutSessionId = session.id
      input.existing.stripeConnectedAccountId = session.accountId
      input.existing.stripeAmountTotal = snapshot.depositMinor
      input.existing.checkoutExpiresAt = new Date(
        Date.now() + CHECKOUT_TTL_MS,
      ).toISOString()
      checkoutUrl = session.url
      if (process.env.DATABASE_URL) {
        const { persistPublicBookingOutcome } = await import(
          '../../../lib/reservation-persistence'
        )
        await persistPublicBookingOutcome(getDb(), input.existing)
      }
    }
  }
  return {
    confirmationToken: input.confirmationToken,
    checkoutUrl,
    status: input.existing.status,
  }
}

/** POST /api/public/booking/book — public create. Client money fields are ignored. */
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
      statusMessage: 'Invalid book request',
      data: z.treeifyError(parsed.error),
    })
  }
  const resolved = await resolvePublicProperty(
    parsed.data.networkSlug,
    parsed.data.propertySlug,
  )
  if ('notFound' in resolved) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  assertPublicRateLimit('book', clientIp(event), resolved.propertyId)

  const policy = getLivePolicy(resolved.networkId, resolved.propertyId)
  const readiness = publicReadinessFor(resolved, policy)
  if (readiness.status !== 'ready' || !policy) {
    throw createError({
      statusCode: readiness.status === 'not_found' ? 404 : 409,
      statusMessage: 'Property is not ready for public booking',
      data: readiness,
    })
  }

  const payload = consumeQuoteToken(parsed.data.quoteToken)
  if (
    payload.networkId !== resolved.networkId ||
    payload.propertyId !== resolved.propertyId ||
    payload.adults !== parsed.data.adults
  ) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Quote expired. Please re-quote.',
    })
  }

  const store = getDomainStore(resolved.networkId)
  const persistMods =
    process.env.DATABASE_URL
      ? await import('../../../lib/reservation-persistence')
      : null
  let existing = store.reservations.find(
    (r) =>
      r.networkId === resolved.networkId &&
      r.publicIdempotencyKey === parsed.data.idempotencyKey,
  )
  if (!existing && persistMods) {
    const row = await persistMods.findReservationByIdempotency(
      getDb(),
      resolved.networkId,
      parsed.data.idempotencyKey,
    )
    if (row) {
      if (!store.reservations.some((r) => r.id === row.id)) {
        store.reservations.push(row)
      }
      existing = store.reservations.find((r) => r.id === row.id) ?? row
    }
  }
  if (existing?.confirmationToken) {
    return replayExistingBook({
      existing,
      collectNow: isCollectNow(policy.collectionType),
      confirmationToken: existing.confirmationToken,
      successPath: `/confirmation/${existing.confirmationToken}`,
      cancelPath: `/${resolved.networkSlug}/${resolved.propertySlug}`,
    })
  }

  const quoteHash = hashQuoteToken(parsed.data.quoteToken)
  if (persistMods) {
    const used = await persistMods.findReservationByQuoteHash(getDb(), quoteHash)
    if (used) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Quote already used. Please re-quote.',
        data: { code: 'QUOTE_USED' },
      })
    }
  }

  const sync = getSyncStore(resolved.networkId)
  const room = sync
    .listRoomTypes(resolved.networkId, resolved.propertyId)
    .find((r) => r.id === payload.roomTypeId)
  if (!room) {
    throw createError({ statusCode: 409, statusMessage: 'Room type no longer available' })
  }

  const quoted = quoteStay(store, {
    networkId: resolved.networkId,
    propertyId: resolved.propertyId,
    roomTypeId: payload.roomTypeId,
    ratePlanChannexId: payload.ratePlanChannexId,
    checkInDate: payload.checkInDate,
    checkOutDate: payload.checkOutDate,
    adults: payload.adults,
    occupancyCap: occupancyCapFor(room.capacity),
    timeZone: resolved.timezone,
  })
  if (!quoted.ok) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Quote expired. Please re-quote.',
      data: { code: 'CONFLICT', reason: quoted.reason },
    })
  }

  const snapshot = snapshotFromToken(policy, payload)
  const days: Record<string, string> = {}
  for (const night of quoted.nights) {
    days[night.date] = (night.rateMinor / 100).toFixed(2)
  }
  const confirmationToken = newConfirmationToken()
  const collectNow = isCollectNow(policy.collectionType)
  const principal = buildPublicBookingPrincipal(resolved.networkId, resolved.propertyId)

  const created = await runCommand(
    'createDirectReservation',
    commandCtx(principal, resolved.propertyId, parsed.data.idempotencyKey),
    {
      propertyId: resolved.propertyId,
      checkInDate: payload.checkInDate,
      checkOutDate: payload.checkOutDate,
      guestName: parsed.data.guestName,
      guestEmail: parsed.data.guestEmail,
      adults: payload.adults,
      children: 0,
      infants: 0,
      currency: payload.currency,
      roomTypeId: payload.roomTypeId,
      roomTypeChannexId: room.channexId,
      ratePlanChannexId: payload.ratePlanChannexId,
      days,
      baseSnapshotVersion: payload.baseSnapshotVersion,
      paymentCollect: policy.collectionType,
      totalAmountMinor: payload.stayTotalMinor,
      paymentTermsSnapshot: snapshot,
      confirmationToken,
      quoteTokenHash: quoteHash,
      publicIdempotencyKey: parsed.data.idempotencyKey,
      reservationStatus: collectNow ? 'pending_payment' : 'pending_sync',
      enqueueCrs: !collectNow,
      requireEmail: true,
      failClosedMissingAri: true,
      occupancyCap: occupancyCapFor(room.capacity),
    },
    { store },
  )
  if (created.status !== 'ok' || !created.data) {
    throw createError({
      statusCode: created.error?.code === 'CONFLICT' ? 409 : 400,
      statusMessage: created.error?.message ?? 'Booking failed',
      data: created,
    })
  }

  const reservation = store.reservations.find((r) => r.id === created.data!.id)!
  const persist =
    persistMods && !created.idempotentReplay
      ? await Promise.all([
          Promise.resolve(persistMods),
          import('../../../lib/ari-persistence'),
        ])
      : null

  if (persist) {
    try {
      const persisted = await persist[0].persistPublicReservation(getDb(), reservation)
      if (persisted.id !== reservation.id) {
        rebindReservationIdentity(store, reservation, persisted.id)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (/unique|duplicate/i.test(message)) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Quote already used. Please re-quote.',
          data: { code: 'QUOTE_USED' },
        })
      }
      throw err
    }
  }

  markQuoteTokenUsed(resolved.networkId, parsed.data.quoteToken)
  rememberConfirmationToken(confirmationToken, resolved.networkId, reservation.id)

  if (collectNow && getNetworkCapabilities(store, resolved.networkId).availabilityWrite) {
    const nights = stayNightDates(payload.checkInDate, payload.checkOutDate)
    enqueueAriIntent(store, {
      networkId: resolved.networkId,
      propertyId: resolved.propertyId,
      lane: 'availability',
      idempotencyKey: `public_hold_avail:${reservation.id}`,
      payload: {
        roomTypeChannexId: room.channexId,
        values: nights.map((date) => ({ date, availability: -1 })),
      },
      resourceScope: {
        roomTypeChannexId: room.channexId,
        dateFrom: payload.checkInDate,
        dateTo: payload.checkOutDate,
      },
      baseSnapshotVersion: payload.baseSnapshotVersion,
      actorPrincipalId: principal.userId,
    })
  }

  let checkoutUrl: string | null = null
  if (collectNow) {
    const expiresAt = new Date(Date.now() + CHECKOUT_TTL_MS).toISOString()
    reservation.checkoutExpiresAt = expiresAt
    try {
      const session = await createCheckoutForHold({
        reservation,
        snapshot,
        successPath: `/confirmation/${confirmationToken}`,
        cancelPath: `/${resolved.networkSlug}/${resolved.propertySlug}`,
      })
      reservation.stripeCheckoutSessionId = session.id
      reservation.stripeConnectedAccountId = session.accountId
      reservation.stripeAmountTotal = snapshot.depositMinor
      checkoutUrl = session.url
    } catch (err) {
      if (persist) {
        const db = getDb()
        await persist[0].updateReservationPaymentHold(db, reservation.id, {
          status: reservation.status,
          pendingSyncReason: reservation.pendingSyncReason,
          checkoutExpiresAt: reservation.checkoutExpiresAt,
        })
      }
      throw err
    }
  }

  if (persist) {
    const db = getDb()
    await persist[0].updateReservationPaymentHold(db, reservation.id, {
      status: reservation.status,
      pendingSyncReason: reservation.pendingSyncReason,
      stripeCheckoutSessionId: reservation.stripeCheckoutSessionId,
      stripeConnectedAccountId: reservation.stripeConnectedAccountId,
      stripeAmountTotal: reservation.stripeAmountTotal,
      checkoutExpiresAt: reservation.checkoutExpiresAt,
    })
    const code = offlineReservationCode(resolved.networkId, reservation.id)
    await Promise.all(
      store.ariWriteIntents
        .filter(
          (i) =>
            i.networkId === resolved.networkId &&
            (i.idempotencyKey === `booking_crs:${code}` ||
              i.idempotencyKey === `public_hold_avail:${reservation.id}`),
        )
        .map(async (intent) => {
          try {
            const saved = await persist[1].persistAriIntent(db, intent)
            intent.id = saved.id
          } catch {
            // memory row still holds the intent for this process
          }
        }),
    )
  }

  return {
    confirmationToken,
    checkoutUrl,
    status: reservation.status,
  }
})
