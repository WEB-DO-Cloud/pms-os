import { principalCanAccessModule } from '@pms/auth'
import { createError } from 'h3'
import { requirePrincipal } from '../../utils/auth'
import { setCalendarRestrictions } from '../../utils/calendar-ari'
import { parseNetworkId } from '../../utils/integrations'

/** POST /api/calendar/restrictions — enqueue absolute rate/restriction writes (U7). */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    networkId: number
    propertyId: number
    ratePlanChannexId: string
    dateFrom: string
    dateTo: string
    fields: {
      rateMinor?: number
      minStayArrival?: number
      minStayThrough?: number
      maxStay?: number
      closedToArrival?: boolean
      closedToDeparture?: boolean
      stopSell?: boolean
    }
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

  return setCalendarRestrictions(principal, {
    propertyId: Number(body.propertyId),
    ratePlanChannexId: String(body.ratePlanChannexId),
    dateFrom: String(body.dateFrom),
    dateTo: String(body.dateTo),
    fields: body.fields ?? {},
    baseSnapshotVersion: Number(body.baseSnapshotVersion),
    compensatesIntentId: body.compensatesIntentId ?? null,
    previewOnly: body.previewOnly === true,
  })
})
