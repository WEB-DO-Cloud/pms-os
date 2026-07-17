import { fieldOwnership } from '@pms/db'
import type { CommandDefinition, ReservationRecord } from '../store'

export type CheckOutReservationInput = {
  reservationId: number
  propertyId: number
}

/** Sets PMS-owned check-out timestamps; does not mutate Channex-owned status. */
export const checkOutReservation: CommandDefinition<
  CheckOutReservationInput,
  ReservationRecord
> = {
  name: 'checkOutReservation',
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
    if (reservation.operationalStatus !== 'checked_in' && !reservation.checkedInAt) {
      throw Object.assign(new Error('Guest must be checked in before check-out'), {
        code: 'CONFLICT',
      })
    }
    const now = new Date().toISOString()
    reservation.operationalStatus = 'checked_out'
    reservation.checkedOutAt = now
    return {
      data: { ...reservation },
      resourceType: 'reservation',
      resourceId: String(reservation.id),
    }
  },
}
