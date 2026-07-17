import { fieldOwnership } from '@pms/db'
import type { CommandDefinition, GuestRecord } from '../store'

export type UpdateGuestEnrichmentInput = {
  guestKey: string
  propertyId: number
  displayName?: string
  email?: string | null
  notes?: string | null
  vip?: boolean
  preferences?: unknown
}

/** Mutates only PMS-owned guest fields (notes, vip, preferences). */
export const updateGuestEnrichment: CommandDefinition<
  UpdateGuestEnrichmentInput,
  GuestRecord
> = {
  name: 'updateGuestEnrichment',
  module: 'guests',
  allowedActorKinds: ['user', 'automation'],
  risk: 'low',
  requiresApproval: false,
  supportsDryRun: true,
  needsExternalSyncRecovery: false,
  compensatingAction: 'none',
  fieldOwnership: { entity: 'guests', mayMutate: 'pmsOwned' },
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, { store }) {
    void fieldOwnership.guests.pmsOwned
    const key = input.guestKey.trim().toLowerCase()
    if (!key) {
      throw Object.assign(new Error('guestKey required'), { code: 'VALIDATION' })
    }
    const now = new Date().toISOString()
    let guest = store.guests.find(
      (g) => g.networkId === ctx.networkId && g.guestKey === key,
    )
    if (!guest) {
      guest = {
        id: store.nextId('guest'),
        networkId: ctx.networkId,
        guestKey: key,
        email: input.email ?? null,
        displayName: input.displayName ?? key,
        notes: input.notes ?? null,
        vip: input.vip ?? false,
        preferences: input.preferences ?? null,
        updatedAt: now,
      }
      store.guests.push(guest)
    } else {
      if (input.displayName != null) guest.displayName = input.displayName
      if (input.email !== undefined) guest.email = input.email
      if (input.notes !== undefined) guest.notes = input.notes
      if (input.vip !== undefined) guest.vip = input.vip
      if (input.preferences !== undefined) guest.preferences = input.preferences
      guest.updatedAt = now
    }
    return {
      data: { ...guest },
      resourceType: 'guest',
      resourceId: String(guest.id),
    }
  },
}
