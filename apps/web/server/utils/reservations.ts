import {
  principalCanAccessModule,
  principalCanAccessProperty,
  type PrincipalContext,
} from '@pms/auth'
import {
  assertCapability,
  getNetworkCapabilities,
  runCommand,
  type CommandContext,
  type DomainStore,
  type ReservationRecord,
} from '@pms/domain'
import type { PropertyRow } from '@pms/sync'
import { sendOrResumeBookingCrsIntent } from '@pms/sync'
import { createError } from 'h3'
import {
  applyWriteBackResult,
  filterReservationsForPrincipal,
  toCalendarBars,
  buildCalendarProjection,
  type DirectBookingWriteBackResult,
  type ReservationListFilter,
} from '../lib/reservation-query'
import { getSyncStore } from './sync'

export {
  applyWriteBackResult,
  filterReservationsForPrincipal,
  isPendingSync,
  toCalendarBars,
  buildCalendarProjection,
  buildCalendarDaySummaries,
  type DirectBookingWriteBackResult,
  type ReservationListFilter,
  type CalendarBar,
  type CalendarRow,
  type CalendarDaySummary,
  type CalendarPropertyInput,
  type CalendarRoomInput,
} from '../lib/reservation-query'

/**
 * Reservation projections for Calendar / Reservations.
 *
 * ponytail: catalog + reservations live in the same process-memory SyncStore as U5
 * (`getSyncStore`); PG write-through for bookings is incomplete — restart clears
 * in-process rows. Upgrade path: hydrate DomainStore from Drizzle on boot / use
 * createDrizzleSyncStore for reservation reads.
 */
export function getDomainStore(networkId: number): DomainStore {
  return getSyncStore(networkId).domain
}

export function listScopedProperties(
  networkId: number,
  principal: PrincipalContext,
): PropertyRow[] {
  return getSyncStore(networkId)
    .listProperties(networkId)
    .filter((p) => principalCanAccessProperty(principal, p.id))
}

export function findReservationInScope(
  store: DomainStore,
  principal: PrincipalContext,
  reservationId: number,
): ReservationRecord | null {
  const row = store.reservations.find(
    (r) => r.id === reservationId && r.networkId === principal.networkId,
  )
  if (!row) return null
  if (!principalCanAccessProperty(principal, row.propertyId)) return null
  return row
}

/**
 * Attempt Channex Booking CRS write-back after local pending_sync create.
 * Inject in tests; default fails closed when capability/mapping missing.
 */
export type DirectBookingWriteBack = (
  reservation: ReservationRecord,
) => Promise<DirectBookingWriteBackResult>

function findBookingCrsIntent(store: DomainStore, reservation: ReservationRecord) {
  const code = reservation.otaReservationCode
  if (!code) return null
  return (
    store.ariWriteIntents.find(
      (i) =>
        i.networkId === reservation.networkId &&
        i.lane === 'booking_crs' &&
        i.idempotencyKey === `booking_crs:${code}`,
    ) ?? null
  )
}

export async function defaultDirectBookingWriteBack(
  reservation: ReservationRecord,
): Promise<DirectBookingWriteBackResult> {
  const store = getDomainStore(reservation.networkId)
  try {
    assertCapability(store, reservation.networkId, 'bookingCrsWrite')
  } catch {
    return { ok: false, reason: 'booking_crs_capability_off' }
  }

  const intent = findBookingCrsIntent(store, reservation)
  if (!intent) {
    return { ok: false, reason: 'booking_crs_intent_missing' }
  }

  const sync = getSyncStore(reservation.networkId)

  // Timeout / restart after send: resume without client — never blind second create.
  if (
    intent.status === 'accepted' ||
    intent.status === 'reconciling' ||
    intent.status === 'reconciled'
  ) {
    const acceptedId =
      reservation.channexBookingId ??
      (typeof intent.channexTaskIds[0] === 'string' ? intent.channexTaskIds[0] : null)
    if (acceptedId) {
      return {
        ok: true,
        channexBookingId: acceptedId,
        reconciled: intent.status === 'reconciled',
      }
    }
    return { ok: false, reason: 'awaiting_channex_revision' }
  }

  let client: ReturnType<typeof import('@pms/sync').createChannexClient>
  let property: PropertyRow
  try {
    const { getScopedChannexMessagingClient } = await import('./sync')
    ;({ client, property } = await getScopedChannexMessagingClient(
      reservation.networkId,
      reservation.propertyId,
    ))
  } catch (err) {
    const message =
      err && typeof err === 'object' && 'statusMessage' in err
        ? String((err as { statusMessage: string }).statusMessage)
        : 'channex_mapping_missing'
    return { ok: false, reason: message.replace(/\s+/g, '_').toLowerCase() }
  }

  const outcome = await sendOrResumeBookingCrsIntent(
    sync,
    client,
    intent,
    property.channexId,
  )
  if (outcome.ok) {
    if (process.env.DATABASE_URL && outcome.posted) {
      try {
        const { getDb } = await import('./auth')
        const { persistAriIntentStatus } = await import('../lib/ari-persistence')
        await persistAriIntentStatus(getDb(), intent)
      } catch {
        // ponytail: best-effort PG status; memory remains source until hydrate path matures.
      }
    }
    return {
      ok: true,
      channexBookingId: outcome.channexBookingId,
      reconciled: outcome.reconciled,
    }
  }
  return { ok: false, reason: outcome.reason }
}

export function requireReservationsModule(principal: PrincipalContext) {
  if (
    !principalCanAccessModule(principal, 'reservations') &&
    !principalCanAccessModule(principal, 'calendar')
  ) {
    throw createError({ statusCode: 403, statusMessage: 'Module denied' })
  }
}

export function commandCtx(
  principal: PrincipalContext,
  propertyId?: number,
  idempotencyKey?: string,
): CommandContext {
  return {
    principal,
    actorKind: 'user',
    networkId: principal.networkId!,
    propertyId,
    idempotencyKey,
  }
}

export type CreateDirectBookingInput = {
  propertyId: number
  checkInDate: string
  checkOutDate: string
  guestName: string
  adults?: number
  children?: number
  infants?: number
  currency?: string
  roomTypeId: number
  ratePlanChannexId: string
  days: Record<string, string>
  /** Required for user/calendar creates — stale snapshot rejects. */
  baseSnapshotVersion: number
  idempotencyKey?: string
}

export async function createDirectBooking(
  principal: PrincipalContext,
  input: CreateDirectBookingInput,
  writeBack: DirectBookingWriteBack = defaultDirectBookingWriteBack,
) {
  requireReservationsModule(principal)
  if (!principalCanAccessProperty(principal, input.propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }
  if (principal.networkId == null) {
    throw createError({ statusCode: 403, statusMessage: 'Network required' })
  }
  if (
    !Number.isFinite(input.baseSnapshotVersion) ||
    !Number.isInteger(input.baseSnapshotVersion)
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: 'baseSnapshotVersion required',
      data: { code: 'VALIDATION' },
    })
  }

  const store = getDomainStore(principal.networkId)
  if (!getNetworkCapabilities(store, principal.networkId).bookingCrsWrite) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Booking CRS write is disabled for this network',
      data: { code: 'CAPABILITY_OFF' },
    })
  }

  const sync = getSyncStore(principal.networkId)
  const roomType = sync
    .listRoomTypes(principal.networkId, input.propertyId)
    .find((r) => r.id === input.roomTypeId)
  if (!roomType) {
    throw createError({
      statusCode: 400,
      statusMessage: 'roomTypeId not found on this property',
      data: { code: 'VALIDATION' },
    })
  }

  const ratePlan = store.ratePlans.find(
    (p) =>
      p.networkId === principal.networkId &&
      p.propertyId === input.propertyId &&
      p.channexId === input.ratePlanChannexId,
  )
  if (!ratePlan) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ratePlanChannexId not found on this property',
      data: { code: 'VALIDATION' },
    })
  }
  if (
    ratePlan.roomTypeChannexId &&
    ratePlan.roomTypeChannexId !== roomType.channexId
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: 'rate plan does not belong to the selected room type',
      data: { code: 'VALIDATION' },
    })
  }

  const idempotencyKey =
    input.idempotencyKey ??
    `direct:${input.propertyId}:${input.checkInDate}:${input.checkOutDate}:${input.guestName.trim()}:${input.roomTypeId}:${input.ratePlanChannexId}`

  const created = await runCommand(
    'createDirectReservation',
    commandCtx(principal, input.propertyId, idempotencyKey),
    {
      propertyId: input.propertyId,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      guestName: input.guestName,
      adults: input.adults,
      children: input.children,
      infants: input.infants,
      currency: input.currency,
      roomTypeId: input.roomTypeId,
      roomTypeChannexId: roomType.channexId,
      ratePlanChannexId: input.ratePlanChannexId,
      days: input.days,
      baseSnapshotVersion: input.baseSnapshotVersion,
    },
    { store },
  )
  if (created.status !== 'ok' || !created.data) {
    const code = created.error?.code
    throw createError({
      statusCode:
        code === 'PROPERTY_SCOPE' || code === 'CAPABILITY_OFF'
          ? 403
          : code === 'STALE_SNAPSHOT' || code === 'CONFLICT'
            ? 409
            : 400,
      statusMessage: created.error?.message ?? 'Direct booking failed',
      data: created,
    })
  }

  const reservation = store.reservations.find((r) => r.id === created.data!.id)!
  const intent = findBookingCrsIntent(store, reservation)

  if (intent && process.env.DATABASE_URL && !created.idempotentReplay) {
    try {
      const { getDb } = await import('./auth')
      const { persistAriIntent } = await import('../lib/ari-persistence')
      const persisted = await persistAriIntent(getDb(), intent)
      intent.id = persisted.id
    } catch (err) {
      // Roll back phantom queued state — never report durable without PG.
      const idx = store.ariWriteIntents.indexOf(intent)
      if (idx >= 0) store.ariWriteIntents.splice(idx, 1)
      const rIdx = store.reservations.indexOf(reservation)
      if (rIdx >= 0) store.reservations.splice(rIdx, 1)
      throw createError({
        statusCode: 503,
        statusMessage: 'Failed to persist booking intent',
        data: { cause: err instanceof Error ? err.message : String(err) },
      })
    }
  }

  const wb = await writeBack(reservation)
  applyWriteBackResult(reservation, wb)

  return {
    reservation: { ...reservation },
    writeBack: wb,
    displayStatus: reservation.status,
    intentId: intent?.id ?? null,
  }
}

export function reservationDetailPayload(
  store: DomainStore,
  reservation: ReservationRecord,
) {
  const revisions = store.bookingRevisions
    .filter((r) => r.reservationId === reservation.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const ledger = store.ledger.filter((l) => l.reservationId === reservation.id)
  const audit = store.auditEvents.filter(
    (a) =>
      a.resourceType === 'reservation' &&
      a.resourceId === String(reservation.id),
  )
  return {
    reservation,
    revisions,
    ledger,
    audit,
    sync: {
      status: reservation.status,
      pendingSyncReason: reservation.pendingSyncReason,
      channexBookingId: reservation.channexBookingId,
      isPendingSync: reservation.status === 'pending_sync',
    },
  }
}
