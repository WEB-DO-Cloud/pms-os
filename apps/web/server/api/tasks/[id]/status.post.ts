import { principalCanAccessProperty } from '@pms/auth'
import type { TaskStatus } from '@pms/domain'
import { requirePrincipal } from '../../../utils/auth'
import { parseNetworkId } from '../../../utils/integrations'
import {
  requireOpsModule,
  runOpsCommand,
} from '../../../utils/operations'
import {
  getDomainStore,
} from '../../../utils/reservations'

/** POST /api/tasks/:id/status — updateTaskStatus */
export default defineEventHandler(async (event) => {
  const taskId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{
    networkId: number
    propertyId: number
    status: TaskStatus
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'tasks')

  if (!Number.isFinite(taskId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid task id' })
  }
  if (!principalCanAccessProperty(principal, body.propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }

  const store = getDomainStore(networkId)
  const task = store.tasks.find((t) => t.id === taskId)
  if (!task) {
    throw createError({ statusCode: 404, statusMessage: 'Task not found' })
  }
  if (
    principal.role === 'housekeeping' &&
    task.assignedToUserId !== principal.userId
  ) {
    throw createError({ statusCode: 403, statusMessage: 'Not assigned' })
  }

  const result = await runOpsCommand(
    'updateTaskStatus',
    principal,
    body.propertyId,
    {
      taskId,
      propertyId: body.propertyId,
      status: body.status,
    },
  )
  return { task: result.data }
})
