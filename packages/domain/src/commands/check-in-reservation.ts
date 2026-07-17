import { fieldOwnership } from '@pms/db'
import type { CommandDefinition, ReservationRecord } from '../store'

export type CheckInReservationInput = {
  reservationId: number
  propertyId: number
}

/** Sets PMS-owned check-in timestamps; does not mutate Channex-owned status. */
export const checkInReservation: CommandDefinition<
  CheckInReservationInput,
  ReservationRecord
> = {
  name: 'checkInReservation',
  module: 'reservations',
  allowedActorKinds: ['user', 'automation'],
  risk: 'low',
  requiresApproval: false,
  supportsDryRun: true,
  needsExternalSyncRecovery: false,
  compensatingAction: 'none',
  fieldOwnership: { entity: 'reservations', mayMutate: 'pmsOwned' },
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, { store }) {
    void fieldOwnership.reservations.pmsOwned
    const reservation = store.reservations.find(
      (r) =>
        r.id === input.reservationId &&
        r.networkId === ctx.networkId &&
        r.propertyId === input.propertyId,
    )
    if (!reservation) {
      throw Object.assign(new Error('Reservation not found in scope'), {
        code: 'NOT_FOUND',
      })
    }
    if (reservation.status === 'pending_sync') {
      throw Object.assign(
        new Error('Cannot check in a booking still pending Channex sync'),
        { code: 'CONFLICT' },
      )
    }
    if (reservation.status === 'cancelled') {
      throw Object.assign(new Error('Cannot check in a cancelled booking'), {
        code: 'CONFLICT',
      })
    }
    const now = new Date().toISOString()
    reservation.operationalStatus = 'checked_in'
    reservation.checkedInAt = now
    reservation.checkedOutAt = null
    return {
      data: { ...reservation },
      resourceType: 'reservation',
      resourceId: String(reservation.id),
    }
  },
}
