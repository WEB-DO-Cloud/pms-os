import type { CommandDefinition, OutboundMessageRecord } from '../store'

export type QueueGuestMessageInput = {
  reservationId: number
  propertyId: number
  body: string
  channel: string
}

/**
 * Queues a minimal outbound guest message + audit (Inbox v1 — not a full email product).
 * High-risk for automation → awaiting_approval via requiresApproval.
 */
export const queueGuestMessage: CommandDefinition<
  QueueGuestMessageInput,
  OutboundMessageRecord
> = {
  name: 'queueGuestMessage',
  module: 'inbox',
  allowedActorKinds: ['user', 'automation'],
  risk: 'high',
  requiresApproval: true,
  supportsDryRun: true,
  needsExternalSyncRecovery: false,
  compensatingAction: 'retract_message',
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, { store }) {
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
    const msg: OutboundMessageRecord = {
      id: store.nextId('outbound_message'),
      networkId: ctx.networkId,
      propertyId: input.propertyId,
      reservationId: input.reservationId,
      channel: input.channel,
      body: input.body,
      status: 'queued',
      createdAt: new Date().toISOString(),
    }
    store.outboundMessages.push(msg)
    return {
      data: msg,
      resourceType: 'outbound_message',
      resourceId: String(msg.id),
    }
  },
}
