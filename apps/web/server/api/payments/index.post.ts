import type { LedgerType } from '@pms/domain'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { recordPayment } from '../../utils/revenue'

const LEDGER_TYPES = new Set<LedgerType>([
  'charge',
  'payment',
  'refund',
  'adjustment',
  'invoice',
  'receipt',
])

/** POST /api/payments — append-only ledger via recordLedgerPayment */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    networkId: number
    reservationId: number
    propertyId: number
    type: LedgerType
    amountMinor: number
    currency: string
    note?: string
    compensatesEntryId?: number
  }>(event)

  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)

  if (!LEDGER_TYPES.has(body.type)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid ledger type' })
  }

  const entry = await recordPayment(principal, {
    reservationId: Number(body.reservationId),
    propertyId: Number(body.propertyId),
    type: body.type,
    amountMinor: Number(body.amountMinor),
    currency: body.currency || 'USD',
    note: body.note,
    compensatesEntryId:
      body.compensatesEntryId != null
        ? Number(body.compensatesEntryId)
        : undefined,
  })

  return {
    entry,
    disclaimer:
      'Append-only ledger event recorded. This does not capture or charge a card.',
  }
})
