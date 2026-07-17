import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import {
  requireOpsModule,
  runOpsCommand,
} from '../../utils/operations'
import {
  getDomainStore,
  listScopedProperties,
} from '../../utils/reservations'
import { principalCanAccessProperty } from '@pms/auth'

/** POST /api/tasks — createTask via runCommand */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    networkId: number
    title: string
    propertyId: number
    category?: string
    description?: string
    reservationId?: number
    assignedToUserId?: string | null
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'tasks')

  if (!principalCanAccessProperty(principal, body.propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }

  const result = await runOpsCommand(
    'createTask',
    principal,
    body.propertyId,
    {
      title: body.title,
      propertyId: body.propertyId,
      category: body.category as
        | 'cleaning'
        | 'maintenance'
        | 'inspection'
        | 'other'
        | undefined,
      description: body.description,
      reservationId: body.reservationId,
      assignedToUserId: body.assignedToUserId,
    },
  )

  return {
    task: result.data,
    properties: listScopedProperties(networkId, principal).map((p) => ({
      id: p.id,
      name: p.name,
    })),
    storeSize: getDomainStore(networkId).tasks.length,
  }
})
