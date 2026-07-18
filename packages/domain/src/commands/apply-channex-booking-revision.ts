import { fieldOwnership } from '@pms/db'
import { assignPhysicalRoom, type AssignableRoom } from '../assign-physical-room'
import type {
  AckOutboxRecord,
  BookingRevisionRecord,
  CommandDefinition,
  ReservationRecord,
} from '../store'

export type ApplyChannexBookingRevisionInput = {
  propertyId: number
  channexRevisionId: string
  channexBookingId: string
  revisionStatus: 'new' | 'modified' | 'cancelled'
  checkInDate: string
  checkOutDate: string
  guestName?: string
  payload?: unknown
  adults?: number
  children?: number
  infants?: number
  currency?: string
  roomTypeId?: number | null
  /** Offline CRS code — matches pending direct bookings (AE3). */
  otaReservationCode?: string | null
  /** Active physical rooms for the property (for deterministic assignment). */
  assignableRooms?: readonly AssignableRoom[]
}

export type ApplyChannexBookingRevisionOutput = {
  reservation: ReservationRecord
  revision: BookingRevisionRecord
  ack: AckOutboxRecord
}

/**
 * Structure + gating for Channex revision apply (U5 fills real I/O).
 * Claims revision uniqueness and ack-outbox intent together.
 */
export const applyChannexBookingRevision: CommandDefinition<
  ApplyChannexBookingRevisionInput,
  ApplyChannexBookingRevisionOutput
> = {
  name: 'applyChannexBookingRevision',
  module: 'reservations',
  allowedActorKinds: ['sync'],
  risk: 'medium',
  requiresApproval: false,
  supportsDryRun: true,
  needsExternalSyncRecovery: true,
  compensatingAction: 'external_sync',
  fieldOwnership: { entity: 'reservations', mayMutate: 'channexOwned' },
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, { store }) {
    void fieldOwnership.reservations.channexOwned
    const existingRev = store.bookingRevisions.find(
      (r) =>
        r.networkId === ctx.networkId &&
        r.channexRevisionId === input.channexRevisionId,
    )
    if (existingRev) {
      const reservation = store.reservations.find(
        (r) => r.id === existingRev.reservationId,
      )
      const ack = store.ackOutbox.find(
        (a) =>
          a.networkId === ctx.networkId &&
          a.channexRevisionId === input.channexRevisionId,
      )
      if (!reservation || !ack) {
        throw Object.assign(new Error('Revision claim incomplete'), {
          code: 'CONFLICT',
        })
      }
      return {
        data: { reservation, revision: existingRev, ack },
        resourceType: 'booking_revision',
        resourceId: input.channexRevisionId,
      }
    }

    const now = new Date().toISOString()
    let reservation = store.reservations.find(
      (r) =>
        r.networkId === ctx.networkId &&
        r.channexBookingId === input.channexBookingId,
    )

    // AE3: pending Offline CRS bookings match by stable ota_reservation_code
    // before Channex booking id is confirmed on the local row.
    if (!reservation && input.otaReservationCode) {
      reservation = store.reservations.find(
        (r) =>
          r.networkId === ctx.networkId &&
          r.propertyId === input.propertyId &&
          r.otaReservationCode === input.otaReservationCode &&
          r.status === 'pending_sync',
      )
    }

    if (!reservation) {
      reservation = {
        id: store.nextId('reservation'),
        networkId: ctx.networkId,
        propertyId: input.propertyId,
        roomTypeId: input.roomTypeId ?? null,
        roomId: null,
        status:
          input.revisionStatus === 'cancelled' ? 'cancelled' : 'confirmed',
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        currency: input.currency ?? 'USD',
        staffNotes: null,
        channexBookingId: input.channexBookingId,
        pendingSyncReason: null,
        guestName: input.guestName ?? null,
        guestEmail: null,
        adults: input.adults ?? 1,
        children: input.children ?? 0,
        infants: input.infants ?? 0,
        channel: null,
        paymentCollect: null,
        paymentType: null,
        totalAmountMinor: null,
        operationalStatus: null,
        checkedInAt: null,
        checkedOutAt: null,
        sourceRevisionId: input.channexRevisionId,
        channexRaw: input.payload ?? null,
        otaReservationCode: input.otaReservationCode ?? null,
      }
      store.reservations.push(reservation)
    } else {
      // Channex-owned projection fields only — leave PMS operational state alone
      reservation.checkInDate = input.checkInDate
      reservation.checkOutDate = input.checkOutDate
      reservation.guestName = input.guestName ?? reservation.guestName
      reservation.roomTypeId =
        input.roomTypeId !== undefined ? input.roomTypeId : reservation.roomTypeId
      reservation.channexBookingId = input.channexBookingId
      if (input.otaReservationCode) {
        reservation.otaReservationCode = input.otaReservationCode
      }
      reservation.status =
        input.revisionStatus === 'cancelled'
          ? 'cancelled'
          : input.revisionStatus === 'new' || input.revisionStatus === 'modified'
            ? reservation.status === 'pending_sync'
              ? 'confirmed'
              : reservation.status
            : reservation.status
      reservation.pendingSyncReason = null
      reservation.sourceRevisionId = input.channexRevisionId
      reservation.channexRaw = input.payload ?? reservation.channexRaw
      if (input.adults != null) reservation.adults = input.adults
      if (input.children != null) reservation.children = input.children
      if (input.infants != null) reservation.infants = input.infants
    }

    // Mark matching booking_crs intent reconciled when revision commits.
    if (reservation.otaReservationCode) {
      const intent = store.ariWriteIntents.find(
        (i) =>
          i.networkId === ctx.networkId &&
          i.lane === 'booking_crs' &&
          i.idempotencyKey === `booking_crs:${reservation!.otaReservationCode}`,
      )
      if (intent && intent.status !== 'reconciled') {
        intent.status = 'reconciled'
        intent.reconciledAt = now
        intent.updatedAt = now
      }
    }

    if (input.revisionStatus === 'cancelled') {
      reservation.roomId = null
    } else {
      const rooms = input.assignableRooms ?? []
      reservation.roomId = assignPhysicalRoom(
        {
          id: reservation.id,
          roomId: reservation.roomId,
          roomTypeId: reservation.roomTypeId,
          checkInDate: reservation.checkInDate,
          checkOutDate: reservation.checkOutDate,
          status: reservation.status,
        },
        rooms,
        store.reservations.filter((r) => r.networkId === ctx.networkId),
      )
    }

    const revision: BookingRevisionRecord = {
      id: store.nextId('booking_revision'),
      networkId: ctx.networkId,
      reservationId: reservation.id,
      channexRevisionId: input.channexRevisionId,
      channexBookingId: input.channexBookingId,
      status: input.revisionStatus,
      payload: input.payload ?? null,
      appliedAt: now,
      createdAt: now,
    }
    store.bookingRevisions.push(revision)

    const ack: AckOutboxRecord = {
      id: store.nextId('ack'),
      networkId: ctx.networkId,
      channexRevisionId: input.channexRevisionId,
      status: 'pending',
      attempts: 0,
      createdAt: now,
    }
    store.ackOutbox.push(ack)

    return {
      data: { reservation: { ...reservation }, revision, ack },
      resourceType: 'booking_revision',
      resourceId: input.channexRevisionId,
    }
  },
}
