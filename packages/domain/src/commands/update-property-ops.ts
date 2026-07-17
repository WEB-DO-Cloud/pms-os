import { fieldOwnership } from '@pms/db'
import type { CommandDefinition, PropertyOpsRecord } from '../store'

export type UpdatePropertyOpsInput = {
  propertyId: number
  checkInTime?: string | null
  checkOutTime?: string | null
  notes?: string | null
  /** Soft-archive when true; clear archive when false. */
  archive?: boolean
}

/** Mutates only PMS-owned property extensions — never Channex catalog fields. */
export const updatePropertyOps: CommandDefinition<
  UpdatePropertyOpsInput,
  PropertyOpsRecord
> = {
  name: 'updatePropertyOps',
  module: 'properties',
  allowedActorKinds: ['user'],
  risk: 'low',
  requiresApproval: false,
  supportsDryRun: true,
  needsExternalSyncRecovery: false,
  compensatingAction: 'none',
  fieldOwnership: { entity: 'properties', mayMutate: 'pmsOwned' },
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, { store }) {
    void fieldOwnership.properties.pmsOwned
    const now = new Date().toISOString()
    let ops = store.propertyOps.find(
      (p) =>
        p.propertyId === input.propertyId && p.networkId === ctx.networkId,
    )
    if (!ops) {
      ops = {
        propertyId: input.propertyId,
        networkId: ctx.networkId,
        checkInTime: '15:00',
        checkOutTime: '11:00',
        notes: null,
        status: 'active',
        archivedAt: null,
        updatedAt: now,
      }
      store.propertyOps.push(ops)
    }
    if (input.checkInTime !== undefined) ops.checkInTime = input.checkInTime
    if (input.checkOutTime !== undefined) ops.checkOutTime = input.checkOutTime
    if (input.notes !== undefined) ops.notes = input.notes
    if (input.archive === true) {
      ops.status = 'archived'
      ops.archivedAt = now
    } else if (input.archive === false) {
      ops.status = 'active'
      ops.archivedAt = null
    }
    ops.updatedAt = now
    return {
      data: { ...ops },
      resourceType: 'property_ops',
      resourceId: String(ops.propertyId),
    }
  },
}
