import type { CommandDefinition, LedgerRecord, LedgerType } from '../store'

export type RecordLedgerPaymentInput = {
  reservationId: number
  propertyId: number
  type: LedgerType
  amountMinor: number
  currency: string
  note?: string
  /** Compensating entry points at prior append-only row; never mutates it. */
  compensatesEntryId?: number
  externalRef?: string
}

/** Append-only payment ledger — corrections are new compensating rows (R31). */
export const recordLedgerPayment: CommandDefinition<
  RecordLedgerPaymentInput,
  LedgerRecord
> = {
  name: 'recordLedgerPayment',
  module: 'payments',
  allowedActorKinds: ['user', 'automation'],
  risk: 'high',
  requiresApproval: false,
  supportsDryRun: true,
  needsExternalSyncRecovery: false,
  compensatingAction: 'reverse_ledger',
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, { store }) {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw Object.assign(new Error('amountMinor must be a positive integer'), {
        code: 'VALIDATION',
      })
    }
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
    if (
      input.compensatesEntryId != null &&
      !store.ledger.some(
        (e) =>
          e.id === input.compensatesEntryId && e.networkId === ctx.networkId,
      )
    ) {
      throw Object.assign(new Error('Compensated ledger entry not found'), {
        code: 'NOT_FOUND',
      })
    }

    const entry: LedgerRecord = {
      id: store.nextId('ledger'),
      networkId: ctx.networkId,
      reservationId: input.reservationId,
      type: input.type,
      amountMinor: input.amountMinor,
      currency: input.currency,
      note: input.note ?? null,
      createdByPrincipal: ctx.principal.userId,
      compensatesEntryId: input.compensatesEntryId ?? null,
      createdAt: new Date().toISOString(),
    }
    store.ledger.push(entry)
    return {
      data: entry,
      resourceType: 'payment_ledger',
      resourceId: String(entry.id),
    }
  },
}
