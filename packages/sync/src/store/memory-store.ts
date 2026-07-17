import type { DomainStore } from '@pms/domain'
import { createMemoryStore } from '@pms/domain'
import { reconcilePhysicalRooms } from '../physical-rooms'

export type PropertyRow = {
  id: number
  networkId: number
  channexId: string
  name: string
  slug: string
  address: string | null
  city: string | null
  country: string | null
  timezone: string | null
  currency: string | null
  channexTitle: string | null
  channexRaw: unknown
  sourceUpdatedAt: string | null
  lastSyncedAt: string | null
}

export type RoomTypeRow = {
  id: number
  networkId: number
  propertyId: number
  channexId: string
  name: string
  capacity: number | null
  countOfRooms: number | null
  channexRaw: unknown
  sourceUpdatedAt: string | null
  lastSyncedAt: string | null
}

export type PhysicalRoomRow = {
  id: number
  networkId: number
  propertyId: number
  roomTypeId: number
  slotIndex: number
  label: string
  sortOrder: number
  archivedAt: string | null
}

export type DeadLetterRow = {
  id: number
  networkId: number
  kind: string
  externalId: string | null
  payload: unknown
  error: string
  retentionUntil: string | null
  createdAt: string
}

export type SyncHealthRow = {
  networkId: number
  status: 'idle' | 'running' | 'healthy' | 'warning' | 'failed'
  lastPullAt: string | null
  lastWebhookAt: string | null
  lastAckAt: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  updatedAt: string
}

export type NetworkSecretKind = 'channex_api_key' | 'channex_webhook_secret'

export type SyncStore = {
  domain: DomainStore
  listProperties(networkId: number): PropertyRow[]
  findPropertyByChannexId(networkId: number, channexId: string): PropertyRow | null
  upsertProperty(input: Omit<PropertyRow, 'id' | 'lastSyncedAt'> & { id?: number }): PropertyRow
  listRoomTypes(networkId: number, propertyId?: number): RoomTypeRow[]
  findRoomTypeByChannexId(networkId: number, channexId: string): RoomTypeRow | null
  upsertRoomType(input: Omit<RoomTypeRow, 'id' | 'lastSyncedAt'> & { id?: number }): RoomTypeRow
  listPhysicalRooms(networkId: number, propertyId?: number): PhysicalRoomRow[]
  findPhysicalRoom(networkId: number, roomId: number): PhysicalRoomRow | null
  upsertPhysicalRoom(input: Omit<PhysicalRoomRow, 'id'> & { id?: number }): PhysicalRoomRow
  /** Ensure physical rooms match room type count; preserves labels; soft-archives extras. */
  reconcilePhysicalRoomsForType(roomTypeId: number): PhysicalRoomRow[]
  getCursor(networkId: number, cursorKey: string): string | null
  setCursor(networkId: number, cursorKey: string, value: string): void
  claimWebhookDelivery(networkId: number, deliveryKey: string): boolean
  insertDeadLetter(row: Omit<DeadLetterRow, 'id' | 'createdAt'>): DeadLetterRow
  listDeadLetters(networkId: number): DeadLetterRow[]
  getSyncHealth(networkId: number): SyncHealthRow
  updateSyncHealth(networkId: number, patch: Partial<Omit<SyncHealthRow, 'networkId'>>): SyncHealthRow
  getSecret(networkId: number, kind: NetworkSecretKind): { ciphertext: string; iv: string; keyVersion: string } | null
  setSecret(networkId: number, kind: NetworkSecretKind, ciphertext: string, iv?: string, keyVersion?: string): void
  tryAcquireLease(networkId: number, jobKind: string, holder: string, ttlMs: number): boolean
  releaseLease(networkId: number, jobKind: string, holder: string): void
  transaction<T>(fn: () => Promise<T>): Promise<T>
}

export function createMemorySyncStore(): SyncStore {
  const domain = createMemoryStore()
  const properties: PropertyRow[] = []
  const roomTypes: RoomTypeRow[] = []
  const physicalRooms: PhysicalRoomRow[] = []
  const cursors = new Map<string, string>()
  const webhookDedupe = new Set<string>()
  const deadLetters: DeadLetterRow[] = []
  const secrets = new Map<string, { ciphertext: string; iv: string; keyVersion: string }>()
  const leases = new Map<string, { holder: string; expiresAt: number }>()
  const health = new Map<number, SyncHealthRow>()

  const cursorKey = (networkId: number, key: string) => `${networkId}:${key}`
  const dedupeKey = (networkId: number, key: string) => `${networkId}:${key}`
  const leaseKey = (networkId: number, job: string) => `${networkId}:${job}`

  function ensureHealth(networkId: number): SyncHealthRow {
    let row = health.get(networkId)
    if (!row) {
      row = {
        networkId,
        status: 'idle',
        lastPullAt: null,
        lastWebhookAt: null,
        lastAckAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: new Date().toISOString(),
      }
      health.set(networkId, row)
    }
    return row
  }

  function assignedRoomIds(): Set<number> {
    const ids = new Set<number>()
    for (const r of domain.reservations) {
      if (r.roomId != null && r.status !== 'cancelled' && r.status !== 'no_show') {
        ids.add(r.roomId)
      }
    }
    return ids
  }

  function replaceRoomsForType(roomTypeId: number, next: PhysicalRoomRow[]) {
    for (let i = physicalRooms.length - 1; i >= 0; i--) {
      if (physicalRooms[i]!.roomTypeId === roomTypeId) physicalRooms.splice(i, 1)
    }
    physicalRooms.push(...next)
  }

  const store: SyncStore = {
    domain,
    listProperties(networkId) {
      return properties.filter((p) => p.networkId === networkId)
    },
    findPropertyByChannexId(networkId, channexId) {
      return properties.find((p) => p.networkId === networkId && p.channexId === channexId) ?? null
    },
    upsertProperty(input) {
      const now = new Date().toISOString()
      const existing = properties.find(
        (p) => p.networkId === input.networkId && p.channexId === input.channexId,
      )
      if (existing) {
        Object.assign(existing, input, { lastSyncedAt: now })
        return existing
      }
      const row: PropertyRow = {
        id: input.id ?? domain.nextId('property'),
        lastSyncedAt: now,
        address: input.address ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        timezone: input.timezone ?? null,
        currency: input.currency ?? null,
        channexTitle: input.channexTitle ?? null,
        channexRaw: input.channexRaw,
        sourceUpdatedAt: input.sourceUpdatedAt ?? null,
        networkId: input.networkId,
        channexId: input.channexId,
        name: input.name,
        slug: input.slug,
      }
      properties.push(row)
      return row
    },
    listRoomTypes(networkId, propertyId) {
      return roomTypes.filter(
        (r) => r.networkId === networkId && (propertyId == null || r.propertyId === propertyId),
      )
    },
    findRoomTypeByChannexId(networkId, channexId) {
      return roomTypes.find((r) => r.networkId === networkId && r.channexId === channexId) ?? null
    },
    upsertRoomType(input) {
      const now = new Date().toISOString()
      const existing = roomTypes.find(
        (r) => r.networkId === input.networkId && r.channexId === input.channexId,
      )
      let row: RoomTypeRow
      if (existing) {
        Object.assign(existing, input, { lastSyncedAt: now })
        row = existing
      } else {
        row = {
          id: input.id ?? domain.nextId('room_type'),
          lastSyncedAt: now,
          capacity: input.capacity ?? null,
          countOfRooms: input.countOfRooms ?? null,
          channexRaw: input.channexRaw,
          sourceUpdatedAt: input.sourceUpdatedAt ?? null,
          networkId: input.networkId,
          propertyId: input.propertyId,
          channexId: input.channexId,
          name: input.name,
        }
        roomTypes.push(row)
      }
      store.reconcilePhysicalRoomsForType(row.id)
      return row
    },
    listPhysicalRooms(networkId, propertyId) {
      return physicalRooms.filter(
        (r) => r.networkId === networkId && (propertyId == null || r.propertyId === propertyId),
      )
    },
    findPhysicalRoom(networkId, roomId) {
      return physicalRooms.find((r) => r.networkId === networkId && r.id === roomId) ?? null
    },
    upsertPhysicalRoom(input) {
      const existing = input.id
        ? physicalRooms.find((r) => r.id === input.id)
        : physicalRooms.find(
            (r) => r.roomTypeId === input.roomTypeId && r.slotIndex === input.slotIndex,
          )
      if (existing) {
        Object.assign(existing, input)
        return existing
      }
      const row: PhysicalRoomRow = {
        id: input.id ?? domain.nextId('physical_room'),
        networkId: input.networkId,
        propertyId: input.propertyId,
        roomTypeId: input.roomTypeId,
        slotIndex: input.slotIndex,
        label: input.label,
        sortOrder: input.sortOrder,
        archivedAt: input.archivedAt ?? null,
      }
      physicalRooms.push(row)
      return row
    },
    reconcilePhysicalRoomsForType(roomTypeId) {
      const rt = roomTypes.find((r) => r.id === roomTypeId)
      if (!rt) return []
      const existing = physicalRooms.filter((r) => r.roomTypeId === roomTypeId)
      const result = reconcilePhysicalRooms(
        {
          id: rt.id,
          networkId: rt.networkId,
          propertyId: rt.propertyId,
          countOfRooms: rt.countOfRooms,
        },
        existing,
        assignedRoomIds(),
        () => domain.nextId('physical_room'),
      )
      const merged: PhysicalRoomRow[] = result.rooms.map((seed) => {
        const prev = existing.find((e) => e.slotIndex === seed.slotIndex)
        if (prev) {
          return { ...prev, archivedAt: seed.archivedAt }
        }
        return seed
      })
      replaceRoomsForType(roomTypeId, merged)
      return merged
    },
    getCursor(networkId, key) {
      return cursors.get(cursorKey(networkId, key)) ?? null
    },
    setCursor(networkId, key, value) {
      cursors.set(cursorKey(networkId, key), value)
    },
    claimWebhookDelivery(networkId, deliveryKey) {
      const k = dedupeKey(networkId, deliveryKey)
      if (webhookDedupe.has(k)) return false
      webhookDedupe.add(k)
      return true
    },
    insertDeadLetter(row) {
      const dl: DeadLetterRow = {
        id: domain.nextId('dead_letter'),
        createdAt: new Date().toISOString(),
        ...row,
      }
      deadLetters.push(dl)
      return dl
    },
    listDeadLetters(networkId) {
      return deadLetters.filter((d) => d.networkId === networkId)
    },
    getSyncHealth(networkId) {
      return { ...ensureHealth(networkId) }
    },
    updateSyncHealth(networkId, patch) {
      const row = ensureHealth(networkId)
      Object.assign(row, patch, { updatedAt: new Date().toISOString() })
      return { ...row }
    },
    getSecret(networkId, kind) {
      return secrets.get(`${networkId}:${kind}`) ?? null
    },
    setSecret(networkId, kind, ciphertext, iv = 'stub', keyVersion = 'v0') {
      secrets.set(`${networkId}:${kind}`, { ciphertext, iv, keyVersion })
    },
    tryAcquireLease(networkId, jobKind, holder, ttlMs) {
      const k = leaseKey(networkId, jobKind)
      const now = Date.now()
      const existing = leases.get(k)
      if (existing && existing.expiresAt > now && existing.holder !== holder) return false
      leases.set(k, { holder, expiresAt: now + ttlMs })
      return true
    },
    releaseLease(networkId, jobKind, holder) {
      const k = leaseKey(networkId, jobKind)
      const existing = leases.get(k)
      if (existing?.holder === holder) leases.delete(k)
    },
    async transaction(fn) {
      // ponytail: memory transaction is a no-op; PG FOR UPDATE needed for multi-worker safety.
      return fn()
    },
  }

  return store
}
