import type {
  CapabilityKey,
  CommandDefinition,
  NetworkCapabilityRecord,
} from '../store'
import { CAPABILITY_KEYS, getNetworkCapabilities } from '../store'

export type SetNetworkCapabilityInput = {
  capability: CapabilityKey
  enabled: boolean
}

/** Org-admin kill switch for each external write class (KTD7, R21). */
export const setNetworkCapability: CommandDefinition<
  SetNetworkCapabilityInput,
  NetworkCapabilityRecord
> = {
  name: 'setNetworkCapability',
  module: 'settings',
  privilegedAction: 'capability_admin',
  allowedActorKinds: ['user'],
  risk: 'high',
  requiresApproval: false,
  supportsDryRun: true,
  needsExternalSyncRecovery: false,
  compensatingAction: 'none',
  resolvePropertyId: () => undefined,
  async execute(ctx, input, { store }) {
    if (!CAPABILITY_KEYS.includes(input.capability)) {
      throw { code: 'VALIDATION', message: `Unknown capability ${input.capability}` }
    }
    let row = store.networkCapabilities.find((c) => c.networkId === ctx.networkId)
    if (!row) {
      row = { ...getNetworkCapabilities(store, ctx.networkId) }
      store.networkCapabilities.push(row)
    }
    row[input.capability] = input.enabled
    row.updatedAt = new Date().toISOString()
    return {
      data: { ...row },
      resourceType: 'network_capability',
      resourceId: input.capability,
    }
  },
}
