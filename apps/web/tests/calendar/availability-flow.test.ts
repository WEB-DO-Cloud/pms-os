import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import { setCalendarAvailability } from '../../server/utils/calendar-availability'
import { getSyncStore } from '../../server/utils/sync'

function principal(
  overrides: Partial<Parameters<typeof buildPrincipal>[0]> = {},
) {
  return buildPrincipal({
    userId: 'mgr-1',
    networkId: 1,
    role: 'manager',
    propertyIds: [10],
    networkWide: false,
    ...overrides,
  })!
}

function seedAvailabilityCatalog() {
  const sync = getSyncStore(1)
  sync.domain.networkCapabilities = [
    {
      networkId: 1,
      bookingCrsWrite: false,
      availabilityWrite: true,
      rateRestrictionWrite: false,
      derivedRateWrite: false,
      aiApply: false,
      updatedAt: new Date().toISOString(),
    },
  ]
  sync.domain.ariWriteIntents = []
  const property = sync.upsertProperty({
    networkId: 1,
    id: 10,
    channexId: 'prop-cx-avail',
    name: 'Cabin',
    slug: 'cabin-avail',
    timezone: 'UTC',
    currency: 'USD',
    channexRaw: null,
  })
  const room = sync.upsertRoomType({
    networkId: 1,
    propertyId: property.id,
    channexId: 'rt-cx-avail',
    name: 'Entire place',
    channexRaw: null,
  })
  sync.domain.ariAvailability = [
    {
      networkId: 1,
      propertyId: property.id,
      roomTypeChannexId: room.channexId,
      date: '2026-08-15',
      availability: 2,
      snapshotVersion: 3,
      pulledAt: new Date().toISOString(),
    },
  ]
  return { sync, property, room }
}

describe('calendar availability write flow (U6)', () => {
  it('hides capability path: gate off fails before enqueue', async () => {
    const { sync, room, property } = seedAvailabilityCatalog()
    sync.domain.networkCapabilities[0]!.availabilityWrite = false
    await expect(
      setCalendarAvailability(principal(), {
        propertyId: property.id,
        roomTypeId: room.id,
        dateFrom: '2026-08-15',
        dateTo: '2026-08-15',
        availability: 0,
        baseSnapshotVersion: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(sync.domain.ariWriteIntents).toHaveLength(0)
  })

  it('front desk fails before enqueue (ari_write)', async () => {
    const { sync, room, property } = seedAvailabilityCatalog()
    await expect(
      setCalendarAvailability(principal({ role: 'front_desk', userId: 'fd-1' }), {
        propertyId: property.id,
        roomTypeId: room.id,
        dateFrom: '2026-08-15',
        dateTo: '2026-08-15',
        availability: 0,
        baseSnapshotVersion: 3,
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(sync.domain.ariWriteIntents).toHaveLength(0)
  })

  it('manager close enqueues absolute intent; open restores explicit capacity', async () => {
    const { room, property } = seedAvailabilityCatalog()
    const closed = await setCalendarAvailability(principal(), {
      propertyId: property.id,
      roomTypeId: room.id,
      dateFrom: '2026-08-15',
      dateTo: '2026-08-15',
      availability: 0,
      baseSnapshotVersion: 3,
    })
    expect(closed.preview).toBe(false)
    expect(closed.intent?.status).toBe('queued')
    expect(closed.intent?.lane).toBe('availability')
    expect(
      (closed.intent?.payload as { values: { availability: number }[] }).values[0]
        ?.availability,
    ).toBe(0)

    const opened = await setCalendarAvailability(principal(), {
      propertyId: property.id,
      roomTypeId: room.id,
      dateFrom: '2026-08-15',
      dateTo: '2026-08-15',
      availability: 2,
      baseSnapshotVersion: 3,
      compensatesIntentId: closed.intent!.id,
    })
    expect(opened.intent?.compensatesIntentId).toBe(closed.intent!.id)
    expect(
      (opened.intent?.payload as { values: { availability: number }[] }).values[0]
        ?.availability,
    ).toBe(2)
  })

  it('stale snapshot rejects with 409', async () => {
    const { room, property } = seedAvailabilityCatalog()
    await expect(
      setCalendarAvailability(principal(), {
        propertyId: property.id,
        roomTypeId: room.id,
        dateFrom: '2026-08-15',
        dateTo: '2026-08-15',
        availability: 0,
        baseSnapshotVersion: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it('previewOnly validates without enqueue', async () => {
    const { sync, room, property } = seedAvailabilityCatalog()
    const preview = await setCalendarAvailability(principal(), {
      propertyId: property.id,
      roomTypeId: room.id,
      dateFrom: '2026-08-15',
      dateTo: '2026-08-15',
      availability: 0,
      baseSnapshotVersion: 3,
      previewOnly: true,
    })
    expect(preview.preview).toBe(true)
    expect(preview.intent).toBeNull()
    expect(sync.domain.ariWriteIntents).toHaveLength(0)
  })
})
