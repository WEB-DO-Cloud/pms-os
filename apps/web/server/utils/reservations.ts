import {
  principalCanAccessModule,
  principalCanAccessProperty,
  type PrincipalContext,
} from '@pms/auth'
import {
  runCommand,
  type CommandContext,
  type DomainStore,
  type ReservationRecord,
} from '@pms/domain'
import type { PropertyRow } from '@pms/sync'
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
  type DirectBookingWriteBackResult,
  type ReservationListFilter,
  type CalendarBar,
  type CalendarRow,
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
 * Attempt Channex write-back after local pending_sync create.
 * Inject in tests; default fails closed so bookings never look confirmed without Channex.
 */
export type DirectBookingWriteBack = (
  reservation: ReservationRecord,
) => Promise<DirectBookingWriteBackResult>

export async function defaultDirectBookingWriteBack(
  _reservation: ReservationRecord,
): Promise<DirectBookingWriteBackResult> {
  // ponytail: Channex booking-create not on client yet — fail closed to pending_sync.
  return { ok: false, reason: 'channex_write_not_configured' }
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
): CommandContext {
  return {
    principal,
    actorKind: 'user',
    networkId: principal.networkId!,
    propertyId,
  }
}

export async function createDirectBooking(
  principal: PrincipalContext,
  input: {
    propertyId: number
    checkInDate: string
    checkOutDate: string
    guestName: string
    adults?: number
    children?: number
    infants?: number
    currency?: string
  },
  writeBack: DirectBookingWriteBack = defaultDirectBookingWriteBack,
) {
  requireReservationsModule(principal)
  if (!principalCanAccessProperty(principal, input.propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }
  if (principal.networkId == null) {
    throw createError({ statusCode: 403, statusMessage: 'Network required' })
  }

  const store = getDomainStore(principal.networkId)
  const created = await runCommand(
    'createDirectReservation',
    commandCtx(principal, input.propertyId),
    input,
    { store },
  )
  if (created.status !== 'ok' || !created.data) {
    throw createError({
      statusCode: created.error?.code === 'PROPERTY_SCOPE' ? 403 : 400,
      statusMessage: created.error?.message ?? 'Direct booking failed',
      data: created,
    })
  }

  const reservation = store.reservations.find((r) => r.id === created.data!.id)!
  const wb = await writeBack(reservation)
  applyWriteBackResult(reservation, wb)

  return {
    reservation: { ...reservation },
    writeBack: wb,
    displayStatus: reservation.status,
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
