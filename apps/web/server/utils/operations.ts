import {
  principalCanAccessModule,
  principalCanAccessProperty,
  type AppModule,
  type PrincipalContext,
} from '@pms/auth'
import {
  isPropertyArchived,
  runCommand,
  type DomainStore,
  type PropertyOpsRecord,
} from '@pms/domain'
import type { PropertyRow } from '@pms/sync'
import {
  commandCtx,
  getDomainStore,
  listScopedProperties,
} from './reservations'
import { getSyncStore } from './sync'

/**
 * Operations modules (Tasks, Properties, Guests, Inbox, Reviews).
 *
 * ponytail: same process-memory SyncStore.domain ceiling as U8 — restart clears
 * tasks/guests/reviews/outboundMessages/propertyOps. Upgrade path: hydrate from
 * Drizzle on boot / write-through PG tables already defined in @pms/db schema.
 */

export function requireOpsModule(
  principal: PrincipalContext,
  module: AppModule,
) {
  if (!principalCanAccessModule(principal, module)) {
    throw createError({ statusCode: 403, statusMessage: 'Module denied' })
  }
}

export function getPropertyOps(
  store: DomainStore,
  networkId: number,
  propertyId: number,
): PropertyOpsRecord {
  const existing = store.propertyOps.find(
    (p) => p.networkId === networkId && p.propertyId === propertyId,
  )
  if (existing) return existing
  return {
    propertyId,
    networkId,
    checkInTime: '15:00',
    checkOutTime: '11:00',
    notes: null,
    status: 'active',
    archivedAt: null,
    updatedAt: new Date(0).toISOString(),
  }
}

export function listScopedPropertiesWithOps(
  networkId: number,
  principal: PrincipalContext,
  opts: { includeArchived?: boolean } = {},
) {
  const store = getDomainStore(networkId)
  const properties = listScopedProperties(networkId, principal)
  return properties
    .map((p) => {
      const ops = getPropertyOps(store, networkId, p.id)
      return { ...p, ops }
    })
    .filter((p) => opts.includeArchived || !isPropertyArchived(p.ops))
}

export function propertyDetailPayload(
  networkId: number,
  principal: PrincipalContext,
  propertyId: number,
) {
  if (!principalCanAccessProperty(principal, propertyId)) return null
  const sync = getSyncStore(networkId)
  const property = sync
    .listProperties(networkId)
    .find((p) => p.id === propertyId)
  if (!property) return null
  const store = getDomainStore(networkId)
  const roomTypes = sync.listRoomTypes(networkId, propertyId)
  const rooms = sync.listPhysicalRooms(networkId, propertyId)
  const ops = getPropertyOps(store, networkId, propertyId)
  return {
    property: catalogPublic(property),
    ops,
    roomTypes: roomTypes.map((r) => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      countOfRooms: r.countOfRooms,
      channexId: r.channexId,
      rooms: rooms
        .filter((room) => room.roomTypeId === r.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.slotIndex - b.slotIndex)
        .map((room) => ({
          id: room.id,
          label: room.label,
          sortOrder: room.sortOrder,
          slotIndex: room.slotIndex,
          archivedAt: room.archivedAt,
        })),
    })),
    ownership: {
      channexOwned: [
        'name',
        'address',
        'city',
        'country',
        'timezone',
        'currency',
      ],
      pmsOwned: [
        'checkInTime',
        'checkOutTime',
        'notes',
        'status',
        'archivedAt',
        'roomLabels',
      ],
    },
  }
}

function catalogPublic(p: PropertyRow) {
  return {
    id: p.id,
    networkId: p.networkId,
    channexId: p.channexId,
    name: p.name,
    slug: p.slug,
    address: p.address,
    city: p.city,
    country: p.country,
    timezone: p.timezone,
    currency: p.currency,
    lastSyncedAt: p.lastSyncedAt,
  }
}

export async function runOpsCommand<
  N extends Parameters<typeof runCommand>[0],
>(
  name: N,
  principal: PrincipalContext,
  propertyId: number,
  input: Parameters<typeof runCommand<N>>[2],
) {
  if (principal.networkId == null) {
    throw createError({ statusCode: 403, statusMessage: 'Network required' })
  }
  const store = getDomainStore(principal.networkId)
  const result = await runCommand(
    name,
    commandCtx(principal, propertyId),
    input,
    { store },
  )
  if (result.status !== 'ok') {
    const code = result.error?.code
    throw createError({
      statusCode:
        code === 'PROPERTY_SCOPE' ||
        code === 'MODULE' ||
        code === 'NETWORK_SCOPE'
          ? 403
          : code === 'NOT_FOUND'
            ? 404
            : 400,
      statusMessage: result.error?.message ?? 'Command failed',
      data: result,
    })
  }
  return result
}
