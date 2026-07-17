import { principalCanAccessProperty } from '@pms/auth'
import { requirePrincipal } from '../../../../utils/auth'
import { parseNetworkId } from '../../../../utils/integrations'
import {
  propertyDetailPayload,
  requireOpsModule,
} from '../../../../utils/operations'
import {
  persistPhysicalRooms,
  updatePhysicalRoomLabel,
} from '../../../../utils/physical-rooms'
import { getSyncStore } from '../../../../utils/sync'

/** PATCH /api/properties/:id/rooms/:roomId — edit PMS-owned room label/sort */
export default defineEventHandler(async (event) => {
  const propertyId = Number(getRouterParam(event, 'id'))
  const roomId = Number(getRouterParam(event, 'roomId'))
  const body = await readBody<{
    networkId: number
    label?: string
    sortOrder?: number
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'properties')

  if (!Number.isFinite(propertyId) || !Number.isFinite(roomId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  }
  if (!principalCanAccessProperty(principal, propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }

  const store = getSyncStore(networkId)
  try {
    const room = updatePhysicalRoomLabel(store, networkId, propertyId, roomId, {
      label: body.label,
      sortOrder: body.sortOrder,
    })
    await persistPhysicalRooms(store, networkId)

    return {
      room,
      detail: propertyDetailPayload(networkId, principal, propertyId),
    }
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string }
    throw createError({
      statusCode: e.statusCode ?? 400,
      statusMessage: e.message ?? 'Room update failed',
    })
  }
})
