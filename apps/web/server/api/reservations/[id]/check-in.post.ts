import { runCommand } from '@pms/domain'
import { requirePrincipal } from '../../../utils/auth'
import { parseNetworkId } from '../../../utils/integrations'
import {
  commandCtx,
  findReservationInScope,
  getDomainStore,
  requireReservationsModule,
} from '../../../utils/reservations'

/** POST /api/reservations/:id/check-in */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = (await readBody(event).catch(() => ({}))) as { networkId?: number }
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  if (principal.networkId !== networkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network mismatch' })
  }
  requireReservationsModule(principal)

  const store = getDomainStore(networkId)
  const reservation = findReservationInScope(store, principal, id)
  if (!reservation) {
    throw createError({ statusCode: 404, statusMessage: 'Reservation not found' })
  }

  const result = await runCommand(
    'checkInReservation',
    commandCtx(principal, reservation.propertyId),
    { reservationId: id, propertyId: reservation.propertyId },
    { store },
  )
  if (result.status !== 'ok') {
    throw createError({
      statusCode: result.error?.code === 'CONFLICT' ? 409 : 400,
      statusMessage: result.error?.message ?? 'Check-in failed',
      data: result,
    })
  }
  return { reservation: result.data, auditId: result.auditId }
})
