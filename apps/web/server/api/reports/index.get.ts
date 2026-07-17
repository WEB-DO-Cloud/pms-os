import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { reportsPayload } from '../../utils/revenue'

/** GET /api/reports?networkId=&from=&to=&propertyId= */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)

  const from = typeof q.from === 'string' ? q.from : ''
  const to = typeof q.to === 'string' ? q.to : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'from and to required as YYYY-MM-DD',
    })
  }

  const propertyId =
    q.propertyId != null && q.propertyId !== ''
      ? Number(q.propertyId)
      : undefined
  if (propertyId != null && !Number.isFinite(propertyId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid propertyId' })
  }

  return {
    networkId,
    report: reportsPayload(networkId, principal, { from, to, propertyId }),
  }
})
