import { fieldOwnership } from '@pms/db'
import type { CommandDefinition, ReservationRecord } from '../store'

export type AttachReservationNoteInput = {
  reservationId: number
  propertyId: number
  note: string
}

/** Mutates only PMS-owned staffNotes (see fieldOwnership.reservations.pmsOwned). */
export const attachReservationNote: CommandDefinition<
  AttachReservationNoteInput,
  ReservationRecord
> = {
  name: 'attachReservationNote',
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
    void fieldOwnership.reservations.pmsOwned // ownership awareness for callers/tests
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
    const stamp = new Date().toISOString()
    const prev = reservation.staffNotes?.trim()
    reservation.staffNotes = prev ? `${prev}\n${input.note}` : input.note
    return {
      data: { ...reservation, updatedAt: stamp } as ReservationRecord,
      resourceType: 'reservation',
      resourceId: String(reservation.id),
    }
  },
}
