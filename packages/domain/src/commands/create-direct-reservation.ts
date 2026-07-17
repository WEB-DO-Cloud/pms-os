import type { CommandDefinition, ReservationRecord } from '../store'

export type CreateDirectReservationInput = {
  propertyId: number
  checkInDate: string
  checkOutDate: string
  guestName: string
  adults?: number
  children?: number
  infants?: number
  currency?: string
}

/** Direct/manual booking — never silently local-only (R10); stays pending_sync. */
export const createDirectReservation: CommandDefinition<
  CreateDirectReservationInput,
  ReservationRecord
> = {
  name: 'createDirectReservation',
  module: 'reservations',
  allowedActorKinds: ['user', 'automation'],
  risk: 'high',
  requiresApproval: true,
  supportsDryRun: true,
  needsExternalSyncRecovery: true,
  compensatingAction: 'cancel_booking',
  fieldOwnership: { entity: 'reservations', mayMutate: 'both' },
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, { store }) {
    const reservation: ReservationRecord = {
      id: store.nextId('reservation'),
      networkId: ctx.networkId,
      propertyId: input.propertyId,
      status: 'pending_sync',
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      currency: input.currency ?? 'USD',
      staffNotes: null,
      channexBookingId: null,
      pendingSyncReason: 'direct_booking_awaiting_channex',
      guestName: input.guestName,
      guestEmail: null,
      adults: input.adults ?? 1,
      children: input.children ?? 0,
      infants: input.infants ?? 0,
      channel: 'direct',
      paymentCollect: null,
      paymentType: null,
      totalAmountMinor: null,
      operationalStatus: null,
      checkedInAt: null,
      checkedOutAt: null,
    }
    store.reservations.push(reservation)
    return {
      data: reservation,
      resourceType: 'reservation',
      resourceId: String(reservation.id),
    }
  },
}
