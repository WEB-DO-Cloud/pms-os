import {
  buildSyncPrincipal,
  runCommand,
  type CommandContext,
} from '@pms/domain'
import {
  mapChannexBookingRevision,
  requiresRoomTypeMapping,
} from './mappers/booking-revision'
import type { ChannexBookingRevisionAttrs } from './channex/types'
import { markSyncFailed } from './sync-health'
import type { SyncStore } from './store'

export type ApplyRevisionResult =
  | { status: 'applied'; channexRevisionId: string; ackPending: true }
  | { status: 'duplicate'; channexRevisionId: string }
  | { status: 'dead_letter'; channexRevisionId: string; error: string }
  | { status: 'rejected'; channexRevisionId: string; error: string }

function syncCtx(networkId: number, propertyId: number): CommandContext {
  return {
    principal: buildSyncPrincipal(networkId),
    actorKind: 'sync',
    networkId,
    propertyId,
  }
}

export async function applyBookingRevision(
  store: SyncStore,
  networkId: number,
  attrs: ChannexBookingRevisionAttrs,
  raw: unknown,
): Promise<ApplyRevisionResult> {
  const property = store.findPropertyByChannexId(networkId, attrs.property_id)
  if (!property) {
    const error = `Unmapped property ${attrs.property_id}`
    store.insertDeadLetter({
      networkId,
      kind: 'booking_revision',
      externalId: attrs.id,
      payload: raw,
      error,
      retentionUntil: null,
    })
    markSyncFailed(store, networkId, 'UNMAPPED_PROPERTY', error)
    return { status: 'dead_letter', channexRevisionId: attrs.id, error }
  }

  let roomTypeId: number | null = null
  if (requiresRoomTypeMapping(attrs) && attrs.room_type_id) {
    const roomType = store.findRoomTypeByChannexId(networkId, attrs.room_type_id)
    if (!roomType) {
      const error = `Unmapped room type ${attrs.room_type_id}`
      store.insertDeadLetter({
        networkId,
        kind: 'booking_revision',
        externalId: attrs.id,
        payload: raw,
        error,
        retentionUntil: null,
      })
      markSyncFailed(store, networkId, 'UNMAPPED_ROOM_TYPE', error)
      return { status: 'dead_letter', channexRevisionId: attrs.id, error }
    }
    roomTypeId = roomType.id
  }

  const mapped = mapChannexBookingRevision(property.id, attrs, raw, roomTypeId)
  if (!mapped.ok) {
    store.insertDeadLetter({
      networkId,
      kind: 'booking_revision',
      externalId: attrs.id,
      payload: raw,
      error: mapped.message,
      retentionUntil: null,
    })
    markSyncFailed(store, networkId, mapped.code, mapped.message)
    return { status: 'dead_letter', channexRevisionId: attrs.id, error: mapped.message }
  }

  const existing = store.domain.bookingRevisions.find(
    (r) => r.networkId === networkId && r.channexRevisionId === attrs.id,
  )
  if (existing) {
    return { status: 'duplicate', channexRevisionId: attrs.id }
  }

  const assignableRooms = store
    .listPhysicalRooms(networkId, property.id)
    .filter((r) => !r.archivedAt)
    .map((r) => ({
      id: r.id,
      roomTypeId: r.roomTypeId,
      sortOrder: r.sortOrder,
      archivedAt: r.archivedAt,
    }))

  const result = await store.transaction(async () =>
    runCommand(
      'applyChannexBookingRevision',
      syncCtx(networkId, property.id),
      { ...mapped.input, assignableRooms },
      { store: store.domain },
    ),
  )

  if (result.status !== 'ok') {
    const error = result.error?.message ?? 'Apply failed'
    store.insertDeadLetter({
      networkId,
      kind: 'booking_revision',
      externalId: attrs.id,
      payload: raw,
      error,
      retentionUntil: null,
    })
    markSyncFailed(store, networkId, result.error?.code ?? 'APPLY_FAILED', error)
    return { status: 'rejected', channexRevisionId: attrs.id, error }
  }

  return { status: 'applied', channexRevisionId: attrs.id, ackPending: true }
}
