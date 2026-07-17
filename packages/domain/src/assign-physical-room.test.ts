import { describe, expect, it } from 'vitest'
import { assignPhysicalRoom, staysOverlap } from './assign-physical-room'

describe('assignPhysicalRoom', () => {
  const rooms = [
    { id: 1, roomTypeId: 10, sortOrder: 1, archivedAt: null },
    { id: 2, roomTypeId: 10, sortOrder: 2, archivedAt: null },
    { id: 3, roomTypeId: 11, sortOrder: 1, archivedAt: null },
  ]

  it('detects half-open overlaps and allows back-to-back', () => {
    expect(
      staysOverlap(
        { checkInDate: '2026-07-01', checkOutDate: '2026-07-03' },
        { checkInDate: '2026-07-03', checkOutDate: '2026-07-05' },
      ),
    ).toBe(false)
    expect(
      staysOverlap(
        { checkInDate: '2026-07-01', checkOutDate: '2026-07-04' },
        { checkInDate: '2026-07-03', checkOutDate: '2026-07-05' },
      ),
    ).toBe(true)
  })

  it('picks first free room and keeps current when still valid', () => {
    const stay = {
      id: 100,
      roomId: null,
      roomTypeId: 10,
      checkInDate: '2026-07-01',
      checkOutDate: '2026-07-03',
      status: 'confirmed',
    }
    expect(assignPhysicalRoom(stay, rooms, [])).toBe(1)

    const occupied = [
      {
        id: 99,
        roomId: 1,
        roomTypeId: 10,
        checkInDate: '2026-07-01',
        checkOutDate: '2026-07-03',
        status: 'confirmed',
      },
    ]
    expect(assignPhysicalRoom(stay, rooms, occupied)).toBe(2)

    const keep = { ...stay, roomId: 2 }
    expect(assignPhysicalRoom(keep, rooms, occupied)).toBe(2)
  })

  it('returns null when inventory is full or cancelled', () => {
    const stay = {
      id: 100,
      roomId: null,
      roomTypeId: 10,
      checkInDate: '2026-07-01',
      checkOutDate: '2026-07-03',
      status: 'confirmed',
    }
    const occupied = [
      {
        id: 1,
        roomId: 1,
        roomTypeId: 10,
        checkInDate: '2026-07-01',
        checkOutDate: '2026-07-03',
        status: 'confirmed',
      },
      {
        id: 2,
        roomId: 2,
        roomTypeId: 10,
        checkInDate: '2026-07-01',
        checkOutDate: '2026-07-03',
        status: 'confirmed',
      },
    ]
    expect(assignPhysicalRoom(stay, rooms, occupied)).toBeNull()
    expect(
      assignPhysicalRoom({ ...stay, status: 'cancelled' }, rooms, []),
    ).toBeNull()
  })
})
