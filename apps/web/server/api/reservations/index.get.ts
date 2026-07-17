import { principalCanAccessModule } from '@pms/auth'
import { requirePrincipal } from '../../utils/auth'
import {
  isHotelPropertyType,
  propertyTypeFromRaw,
} from '../../utils/billing'
import { parseNetworkId } from '../../utils/integrations'
import {
  buildCalendarProjection,
  filterReservationsForPrincipal,
  getDomainStore,
  listScopedProperties,
  requireReservationsModule,
  toCalendarBars,
} from '../../utils/reservations'
import { ensureSecretsHydrated, getSyncStore } from '../../utils/sync'

/** GET /api/reservations?networkId=&propertyId=&from=&to=&status=&view=calendar */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  if (principal.networkId !== networkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network mismatch' })
  }
  requireReservationsModule(principal)

  const propertyId =
    q.propertyId != null && q.propertyId !== ''
      ? Number(q.propertyId)
      : undefined
  if (propertyId != null && !Number.isFinite(propertyId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid propertyId' })
  }

  await ensureSecretsHydrated(networkId)
  const store = getDomainStore(networkId)
  const sync = getSyncStore(networkId)
  const properties = listScopedProperties(networkId, principal)
  const reservations = filterReservationsForPrincipal(
    store.reservations,
    principal,
    {
      propertyId,
      from: typeof q.from === 'string' ? q.from : undefined,
      to: typeof q.to === 'string' ? q.to : undefined,
      status: typeof q.status === 'string' ? q.status : undefined,
    },
  )

  const h = sync.getSyncHealth(networkId)
  const freshness = {
    status: h.status,
    lastPullAt: h.lastPullAt,
    lastWebhookAt: h.lastWebhookAt,
    updatedAt: h.updatedAt,
  }

  if (q.view === 'calendar') {
    const calendarProperties = properties.map((p) => ({
      id: p.id,
      name: p.name,
      isHotel: isHotelPropertyType(propertyTypeFromRaw(p.channexRaw)),
    }))
    const roomTypes = sync.listRoomTypes(networkId)
    const roomTypeName = new Map(roomTypes.map((rt) => [rt.id, rt.name]))
    const rooms = sync
      .listPhysicalRooms(networkId)
      .filter((r) => properties.some((p) => p.id === r.propertyId))
      .filter((r) => propertyId == null || r.propertyId === propertyId)
      .map((r) => ({
        id: r.id,
        propertyId: r.propertyId,
        roomTypeId: r.roomTypeId,
        roomTypeName: roomTypeName.get(r.roomTypeId) ?? `Type ${r.roomTypeId}`,
        label: r.label,
        sortOrder: r.sortOrder,
        archivedAt: r.archivedAt,
      }))

    const scopedProperties =
      propertyId == null
        ? calendarProperties
        : calendarProperties.filter((p) => p.id === propertyId)

    const { rows, bars } = buildCalendarProjection(
      scopedProperties,
      rooms,
      reservations,
    )

    return {
      networkId,
      properties: scopedProperties.map((p) => ({ id: p.id, name: p.name })),
      rows,
      bars,
      // Legacy property-only bars kept for older clients/tests.
      legacyBars: toCalendarBars(reservations, properties),
      freshness,
      canAccessCalendar: principalCanAccessModule(principal, 'calendar'),
    }
  }

  return {
    networkId,
    properties: properties.map((p) => ({ id: p.id, name: p.name })),
    reservations,
    freshness,
  }
})
