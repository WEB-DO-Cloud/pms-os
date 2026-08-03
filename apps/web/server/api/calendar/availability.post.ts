import { principalCanAccessModule } from '@pms/auth'
import { createError } from 'h3'
import { requirePrincipal } from '../../utils/auth'
import { setCalendarAvailability } from '../../utils/calendar-availability'
import { parseNetworkId } from '../../utils/integrations'

/** POST /api/calendar/availability — enqueue absolute availability close/open (U6). */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    networkId: number
    propertyId: number
    roomTypeId: number
    dateFrom: string
    dateTo: string
    availability: number
    baseSnapshotVersion: number
    compensatesIntentId?: number | null
    previewOnly?: boolean
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  if (
    !principalCanAccessModule(principal, 'calendar') &&
    !principalCanAccessModule(principal, 'rates')
  ) {
    throw createError({ statusCode: 403, statusMessage: 'Module denied' })
  }

  return setCalendarAvailability(principal, {
    propertyId: Number(body.propertyId),
    roomTypeId: Number(body.roomTypeId),
    dateFrom: String(body.dateFrom),
    dateTo: String(body.dateTo),
    availability: Number(body.availability),
    baseSnapshotVersion: Number(body.baseSnapshotVersion),
    compensatesIntentId: body.compensatesIntentId ?? null,
    previewOnly: body.previewOnly === true,
  })
})
