import { describe, expect, it } from 'vitest'
import { createMemorySyncStore } from '@pms/sync'
import { updatePhysicalRoomLabel } from '../../server/utils/physical-rooms'

describe('physical room label updates', () => {
  it('renames a room and rejects duplicate labels on the same property', () => {
    const store = createMemorySyncStore()
    const prop = store.upsertProperty({
      networkId: 1,
      channexId: 'p1',
      name: 'Hotel',
      slug: 'hotel',
      address: null,
      city: null,
      country: null,
      timezone: null,
      currency: null,
      channexTitle: 'Hotel',
      channexRaw: {},
      sourceUpdatedAt: null,
    })
    store.upsertRoomType({
      networkId: 1,
      propertyId: prop.id,
      channexId: 'rt',
      name: 'King',
      capacity: 2,
      countOfRooms: 2,
      channexRaw: {},
      sourceUpdatedAt: null,
    })
    const rooms = store.listPhysicalRooms(1, prop.id)
    const first = rooms[0]!
    const second = rooms[1]!

    const updated = updatePhysicalRoomLabel(store, 1, prop.id, first.id, {
      label: '101',
    })
    expect(updated.label).toBe('101')

    expect(() =>
      updatePhysicalRoomLabel(store, 1, prop.id, second.id, { label: '101' }),
    ).toThrow(/already used/)
  })

  it('rejects rooms outside the property', () => {
    const store = createMemorySyncStore()
    const a = store.upsertProperty({
      networkId: 1,
      channexId: 'a',
      name: 'A',
      slug: 'a',
      address: null,
      city: null,
      country: null,
      timezone: null,
      currency: null,
      channexTitle: 'A',
      channexRaw: {},
      sourceUpdatedAt: null,
    })
    const b = store.upsertProperty({
      networkId: 1,
      channexId: 'b',
      name: 'B',
      slug: 'b',
      address: null,
      city: null,
      country: null,
      timezone: null,
      currency: null,
      channexTitle: 'B',
      channexRaw: {},
      sourceUpdatedAt: null,
    })
    store.upsertRoomType({
      networkId: 1,
      propertyId: a.id,
      channexId: 'rt-a',
      name: 'Std',
      capacity: 2,
      countOfRooms: 1,
      channexRaw: {},
      sourceUpdatedAt: null,
    })
    const room = store.listPhysicalRooms(1, a.id)[0]!
    expect(() =>
      updatePhysicalRoomLabel(store, 1, b.id, room.id, { label: 'X' }),
    ).toThrow()
  })
})
