import { runCommand } from '@pms/domain'
import { requirePrincipal } from '../../../utils/auth'
import { parseNetworkId } from '../../../utils/integrations'
import {
  commandCtx,
  findReservationInScope,
  getDomainStore,
  requireReservationsModule,
} from '../../../utils/reservations'

/** POST /api/reservations/:id/notes */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = (await readBody(event).catch(() => ({}))) as {
    networkId?: number
    note?: string
  }
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  if (principal.networkId !== networkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network mismatch' })
  }
  requireReservationsModule(principal)

  const note = body.note?.trim()
  if (!note) {
    throw createError({ statusCode: 400, statusMessage: 'note required' })
  }

  const store = getDomainStore(networkId)
  const reservation = findReservationInScope(store, principal, id)
  if (!reservation) {
    throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })
  }

  const result = await runCommand(
    'attachReservationNote',
    commandCtx(principal, reservation.propertyId),
    { reservationId: id, propertyId: reservation.propertyId, note },
    { store },
  )
  if (result.status !== 'ok') {
    throw createError({
      statusCode: 400,
      statusMessage: result.error?.message ?? 'Note failed',
      data: result,
    })
  }
  return { reservation: result.data, auditId: result.auditId }
})
