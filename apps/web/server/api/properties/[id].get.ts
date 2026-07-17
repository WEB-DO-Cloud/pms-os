import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import {
  propertyDetailPayload,
  requireOpsModule,
} from '../../utils/operations'

/** GET /api/properties/:id?networkId= */
export default defineEventHandler(async (event) => {
  const propertyId = Number(getRouterParam(event, 'id'))
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'properties')

  if (!Number.isFinite(propertyId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid property id' })
  }

  const detail = propertyDetailPayload(networkId, principal, propertyId)
  if (!detail) {
    throw createError({ statusCode: 404, statusMessage: 'Property not found' })
  }
  return { networkId, ...detail }
})
