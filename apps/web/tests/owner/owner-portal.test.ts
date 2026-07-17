import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  computeReportSummary,
  type ReservationRecord,
} from '@pms/domain'
import {
  assertOwnerBookingSafe,
  canAccessOwnerPortal,
  filterOwnerBookings,
  toOwnerBooking,
  toOwnerProperty,
} from '../../server/utils/owner'
import type { PropertyRow } from '@pms/sync'

function owner(
  overrides: Partial<Parameters<typeof buildPrincipal>[0]> = {},
) {
  return buildPrincipal({
    userId: 'owner-1',
    networkId: 1,
    role: 'property_owner',
    propertyIds: [],
    ownerPropertyIds: [10],
    networkWide: false,
    ...overrides,
  })!
}

function reservation(
  partial: Partial<ReservationRecord> &
    Pick<ReservationRecord, 'id' | 'propertyId'>,
): ReservationRecord {
  return {
    networkId: 1,
    status: 'confirmed',
    checkInDate: '2026-07-01',
    checkOutDate: '2026-07-05',
    currency: 'USD',
    staffNotes: 'Do not show to owner',
    channexBookingId: 'secret-bk',
    pendingSyncReason: 'retry',
    guestName: 'Ada Lovelace',
    guestEmail: 'ada@example.com',
    channel: 'airbnb',
    paymentCollect: 'property',
    paymentType: 'credit_card',
    totalAmountMinor: 40_000,
    channexRaw: { api_key: 'nope' },
    sourceRevisionId: 'rev-1',
    ...partial,
  }
}

function property(id: number, name: string): PropertyRow {
  return {
    id,
    networkId: 1,
    channexId: `chx-${id}`,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    address: 'hidden street',
    city: 'Las Terrenas',
    country: 'DO',
    timezone: 'America/Santo_Domingo',
    currency: 'USD',
    channexTitle: name,
    channexRaw: { token: 'secret' },
    sourceUpdatedAt: null,
    lastSyncedAt: null,
  }
}

describe('owner portal scope', () => {
  it('allows property_owner and denies staff sibling modules via owner gate', () => {
    expect(canAccessOwnerPortal(owner())).toBe(true)
    expect(
      canAccessOwnerPortal(
        buildPrincipal({
          userId: 'mgr',
          networkId: 1,
          role: 'manager',
          propertyIds: [10],
          networkWide: true,
        })!,
      ),
    ).toBe(false)
  })

  it('owner cannot see sibling property bookings', () => {
    const rows = filterOwnerBookings(
      [
        reservation({ id: 1, propertyId: 10, guestName: 'Mine' }),
        reservation({ id: 2, propertyId: 11, guestName: 'Sibling' }),
      ],
      owner({ ownerPropertyIds: [10] }),
    )
    expect(rows.map((r) => r.id)).toEqual([1])
    expect(rows[0]?.guestName).toBe('Mine')
  })

  it('owner revenue summary matches scoped report helpers and hides unassigned properties', () => {
    const principal = owner({ ownerPropertyIds: [10] })
    const summary = computeReportSummary(
      [
        reservation({ id: 1, propertyId: 10 }),
        reservation({
          id: 2,
          propertyId: 11,
          totalAmountMinor: 99_000,
          guestName: 'Other',
        }),
      ],
      principal,
      [
        { propertyId: 10, unitCount: 1, name: 'Casa' },
        { propertyId: 11, unitCount: 1, name: 'Sibling' },
      ],
      {
        status: 'healthy',
        lastPullAt: '2026-07-16T08:00:00.000Z',
        updatedAt: '2026-07-16T08:00:00.000Z',
      },
      { from: '2026-07-01', to: '2026-07-10', ownerScoped: true },
      Date.parse('2026-07-16T12:00:00.000Z'),
    )

    expect(summary.byProperty.map((p) => p.propertyId)).toEqual([10])
    expect(summary.excludedPropertyIds).toContain(11)
    expect(summary.revenueMinor).toBe(40_000)
  })

  it('owner projections omit staff notes, secrets, sync details, and guest email', () => {
    const booking = toOwnerBooking(reservation({ id: 9, propertyId: 10 }))
    assertOwnerBookingSafe(booking)
    expect(booking).toEqual({
      id: 9,
      propertyId: 10,
      status: 'confirmed',
      checkInDate: '2026-07-01',
      checkOutDate: '2026-07-05',
      currency: 'USD',
      guestName: 'Ada Lovelace',
      channel: 'airbnb',
      totalAmountMinor: 40_000,
    })
    expect(JSON.stringify(booking)).not.toMatch(/staffNotes|guestEmail|channex|secret/i)

    const prop = toOwnerProperty(property(10, 'Casa del Mar'))
    expect(prop).toEqual({
      id: 10,
      name: 'Casa del Mar',
      city: 'Las Terrenas',
      country: 'DO',
      timezone: 'America/Santo_Domingo',
      currency: 'USD',
    })
    expect(JSON.stringify(prop)).not.toMatch(/channex|token|address/i)
  })
})
