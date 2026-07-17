import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import {
  listScopedPropertiesWithOps,
  requireOpsModule,
} from '../../utils/operations'

/** GET /api/properties?networkId=&includeArchived= */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'properties')

  const includeArchived =
    q.includeArchived === '1' || q.includeArchived === 'true'

  const properties = listScopedPropertiesWithOps(networkId, principal, {
    includeArchived,
  }).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    city: p.city,
    country: p.country,
    timezone: p.timezone,
    currency: p.currency,
    lastSyncedAt: p.lastSyncedAt,
    ops: p.ops,
  }))

  return { networkId, properties }
})
