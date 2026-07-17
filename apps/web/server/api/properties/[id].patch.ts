import { principalCanAccessProperty } from '@pms/auth'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import {
  propertyDetailPayload,
  requireOpsModule,
  runOpsCommand,
} from '../../utils/operations'

/** PATCH /api/properties/:id — updatePropertyOps (PMS fields only) */
export default defineEventHandler(async (event) => {
  const propertyId = Number(getRouterParam(event, 'id'))
  const body = await readBody<{
    networkId: number
    checkInTime?: string | null
    checkOutTime?: string | null
    notes?: string | null
    archive?: boolean
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'properties')

  if (!Number.isFinite(propertyId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid property id' })
  }
  if (!principalCanAccessProperty(principal, propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }

  const result = await runOpsCommand(
    'updatePropertyOps',
    principal,
    propertyId,
    {
      propertyId,
      checkInTime: body.checkInTime,
      checkOutTime: body.checkOutTime,
      notes: body.notes,
      archive: body.archive,
    },
  )

  return {
    ops: result.data,
    detail: propertyDetailPayload(networkId, principal, propertyId),
  }
})
