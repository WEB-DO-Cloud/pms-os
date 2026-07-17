import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import {
  requireOpsModule,
} from '../../utils/operations'
import {
  getDomainStore,
  listScopedProperties,
} from '../../utils/reservations'
import {
  filterTasksForPrincipal,
} from '@pms/domain'

/** GET /api/tasks?networkId=&propertyId=&status=&category= */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'tasks')

  const propertyId =
    q.propertyId != null && q.propertyId !== ''
      ? Number(q.propertyId)
      : undefined
  const store = getDomainStore(networkId)
  const tasks = filterTasksForPrincipal(store.tasks, principal, {
    propertyId: Number.isFinite(propertyId) ? propertyId : undefined,
    status: typeof q.status === 'string' ? q.status : undefined,
    category: typeof q.category === 'string' ? q.category : undefined,
  })

  return {
    networkId,
    properties: listScopedProperties(networkId, principal).map((p) => ({
      id: p.id,
      name: p.name,
    })),
    tasks,
  }
})
