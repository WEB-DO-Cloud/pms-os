import { describe, expect, it } from 'vitest'
import { createChannexClient } from './channex/client'
import { importProperties } from './channex/properties'
import { importAllRoomTypes } from './channex/room-types'
import { FIXTURE_NETWORK_ID, mockChannexFetch, fixtureProperty } from './fixtures/channex'
import { createMemorySyncStore } from './store'

describe('property import', () => {
  it('maps Channex property attributes and upserts idempotently', async () => {
    const store = createMemorySyncStore()
    const fetchFn = mockChannexFetch({
      properties: {
        data: [
          fixtureProperty('prop-1', { title: 'Beach Villa' }),
          fixtureProperty('prop-2', { title: 'City Loft' }),
        ],
      },
    })
    const client = createChannexClient({ apiKey: 'test-key', fetchFn })

    const first = await importProperties(store, client, FIXTURE_NETWORK_ID)
    expect(first.imported).toBe(2)
    expect(first.updated).toBe(0)
    expect(store.listProperties(FIXTURE_NETWORK_ID)).toHaveLength(2)
    const villa = store.findPropertyByChannexId(FIXTURE_NETWORK_ID, 'prop-1')
    expect(villa).toMatchObject({
      name: 'Beach Villa',
      slug: 'beach-villa',
      channexId: 'prop-1',
      city: 'Santo Domingo',
    })
    expect(villa?.channexRaw).toBeTruthy()

    const second = await importProperties(store, client, FIXTURE_NETWORK_ID)
    expect(second.imported).toBe(0)
    expect(second.updated).toBe(2)
    expect(store.listProperties(FIXTURE_NETWORK_ID)).toHaveLength(2)
  })

  it('scopes import to an allowlist and never imports all on empty scope', async () => {
    const store = createMemorySyncStore()
    const fetchFn = mockChannexFetch({
      properties: {
        data: [
          fixtureProperty('prop-1', { title: 'Mine' }),
          fixtureProperty('prop-2', { title: 'Someone Else' }),
        ],
      },
      groups: { 'grp-1': ['prop-1'] },
    })
    const client = createChannexClient({ apiKey: 'master-key', fetchFn })

    // Empty allowlist must import nothing (guards master-key tenant leak).
    const none = await importProperties(store, client, FIXTURE_NETWORK_ID, [])
    expect(none.imported).toBe(0)
    expect(store.listProperties(FIXTURE_NETWORK_ID)).toHaveLength(0)

    // Group resolves to a single property; only it is imported.
    const ids = await client.listGroupPropertyIds('grp-1')
    expect(ids).toEqual(['prop-1'])
    const scoped = await importProperties(store, client, FIXTURE_NETWORK_ID, ids)
    expect(scoped.imported).toBe(1)
    expect(store.listProperties(FIXTURE_NETWORK_ID)).toHaveLength(1)
    expect(store.findPropertyByChannexId(FIXTURE_NETWORK_ID, 'prop-2')).toBeNull()
  })
})

describe('Channex provisioning', () => {
  it('creates group and property via API client', async () => {
    const fetchFn = mockChannexFetch({})
    const client = createChannexClient({ apiKey: 'master-key', fetchFn })

    const group = await client.createGroup('Tenant A')
    expect(group.data.id).toMatch(/^grp-/)
    expect(group.data.attributes.title).toBe('Tenant A')

    const prop = await client.createProperty({
      title: 'New Villa',
      currency: 'USD',
      country: 'DO',
      city: 'Punta Cana',
      address: '1 Beach Rd',
      timezone: 'America/Santo_Domingo',
      group_id: group.data.id,
      property_type: 'villa',
    })
    expect(prop.data.attributes.title).toBe('New Villa')
  })
})

describe('room type import', () => {
  it('imports vacation-rental room types linked to local properties', async () => {
    const store = createMemorySyncStore()
    store.upsertProperty({
      networkId: FIXTURE_NETWORK_ID,
      channexId: 'prop-1',
      name: 'VR Home',
      slug: 'vr-home',
      address: null,
      city: null,
      country: null,
      timezone: null,
      currency: null,
      channexTitle: 'VR Home',
      channexRaw: {},
      sourceUpdatedAt: null,
    })
    const prop = store.findPropertyByChannexId(FIXTURE_NETWORK_ID, 'prop-1')!

    const fetchFn = mockChannexFetch({})
    const client = createChannexClient({ apiKey: 'test-key', fetchFn })
    const result = await importAllRoomTypes(store, client, FIXTURE_NETWORK_ID)

    expect(result.imported).toBe(1)
    const rt = store.findRoomTypeByChannexId(FIXTURE_NETWORK_ID, 'rt-1')
    expect(rt).toMatchObject({
      propertyId: prop.id,
      name: 'Suite rt-1',
      capacity: 2,
      countOfRooms: 1,
    })
    const rooms = store.listPhysicalRooms(FIXTURE_NETWORK_ID, prop.id)
    expect(rooms).toHaveLength(1)
    expect(rooms[0]).toMatchObject({
      roomTypeId: rt!.id,
      slotIndex: 1,
      label: '1',
      archivedAt: null,
    })
  })

  it('grows and shrinks physical rooms without erasing edited labels', () => {
    const store = createMemorySyncStore()
    const prop = store.upsertProperty({
      networkId: FIXTURE_NETWORK_ID,
      channexId: 'prop-h',
      name: 'Hotel',
      slug: 'hotel',
      address: null,
      city: null,
      country: null,
      timezone: null,
      currency: null,
      channexTitle: 'Hotel',
      channexRaw: { attributes: { property_type: 'hotel' } },
      sourceUpdatedAt: null,
    })
    const rt = store.upsertRoomType({
      networkId: FIXTURE_NETWORK_ID,
      propertyId: prop.id,
      channexId: 'rt-king',
      name: 'King',
      capacity: 2,
      countOfRooms: 3,
      channexRaw: {},
      sourceUpdatedAt: null,
    })
    let rooms = store.listPhysicalRooms(FIXTURE_NETWORK_ID, prop.id)
    expect(rooms.map((r) => r.slotIndex).sort()).toEqual([1, 2, 3])

    store.upsertPhysicalRoom({
      ...rooms[1]!,
      label: '102',
    })

    store.upsertRoomType({
      ...rt,
      countOfRooms: 2,
    })
    rooms = store
      .listPhysicalRooms(FIXTURE_NETWORK_ID, prop.id)
      .filter((r) => !r.archivedAt)
    expect(rooms).toHaveLength(2)
    expect(rooms.find((r) => r.slotIndex === 2)?.label).toBe('102')
    expect(
      store.listPhysicalRooms(FIXTURE_NETWORK_ID, prop.id).find((r) => r.slotIndex === 3)
        ?.archivedAt,
    ).toBeTruthy()

    store.upsertRoomType({
      ...rt,
      countOfRooms: 4,
    })
    rooms = store
      .listPhysicalRooms(FIXTURE_NETWORK_ID, prop.id)
      .filter((r) => !r.archivedAt)
    expect(rooms).toHaveLength(4)
    expect(rooms.find((r) => r.slotIndex === 2)?.label).toBe('102')
  })
})
