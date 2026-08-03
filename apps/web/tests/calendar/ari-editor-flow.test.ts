import { describe, expect, it, vi } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  setCalendarDerivedModifier,
  setCalendarRestrictions,
} from '../../server/utils/calendar-ari'
import { getSyncStore } from '../../server/utils/sync'
import { projectRatesReadOnly } from '@pms/domain'

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

function seedRateCatalog(opts?: { derivedWrite?: boolean }) {
  const sync = getSyncStore(1)
  sync.domain.networkCapabilities = [
    {
      networkId: 1,
      bookingCrsWrite: false,
      availabilityWrite: false,
      rateRestrictionWrite: true,
      derivedRateWrite: opts?.derivedWrite ?? false,
      aiApply: false,
      updatedAt: new Date().toISOString(),
    },
  ]
  sync.domain.ariWriteIntents = []
  const property = sync.upsertProperty({
    networkId: 1,
    id: 10,
    channexId: 'prop-cx-rate',
    name: 'Cabin',
    slug: 'cabin-rate',
    timezone: 'UTC',
    currency: 'USD',
    channexRaw: null,
  })
  sync.domain.ratePlans = [
    {
      networkId: 1,
      propertyId: property.id,
      channexId: 'rp-manual',
      roomTypeChannexId: 'rt-1',
      title: 'BAR',
      currency: 'USD',
      parentRatePlanChannexId: null,
      channexRaw: { rate_mode: 'manual' },
      pulledAt: new Date().toISOString(),
    },
    {
      networkId: 1,
      propertyId: property.id,
      channexId: 'rp-derived',
      roomTypeChannexId: 'rt-1',
      title: 'Airbnb',
      currency: 'USD',
      parentRatePlanChannexId: 'rp-manual',
      channexRaw: {
        rate_mode: 'derived',
        options: [
          {
            occupancy: 2,
            is_primary: true,
            derived_option: { rate: [['increase_by_percent', '10']] },
          },
        ],
      },
      pulledAt: new Date().toISOString(),
    },
  ]
  sync.domain.ariRestrictions = [
    {
      networkId: 1,
      propertyId: property.id,
      ratePlanChannexId: 'rp-manual',
      date: '2026-08-20',
      rateMinor: 20_000,
      minStayArrival: 1,
      minStayThrough: null,
      maxStay: null,
      closedToArrival: false,
      closedToDeparture: false,
      stopSell: false,
      snapshotVersion: 4,
      pulledAt: new Date().toISOString(),
    },
  ]
  return { sync, property }
}

describe('calendar rate/restriction write flow (U7)', () => {
  it('capability off fails before enqueue', async () => {
    const { sync, property } = seedRateCatalog()
    sync.domain.networkCapabilities[0]!.rateRestrictionWrite = false
    await expect(
      setCalendarRestrictions(principal(), {
        propertyId: property.id,
        ratePlanChannexId: 'rp-manual',
        dateFrom: '2026-08-20',
        dateTo: '2026-08-20',
        fields: { rateMinor: 22_000 },
        baseSnapshotVersion: 4,
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(sync.domain.ariWriteIntents).toHaveLength(0)
  })

  it('queues manual nightly rate as absolute restrictions intent', async () => {
    const { sync, property } = seedRateCatalog()
    const res = await setCalendarRestrictions(principal(), {
      propertyId: property.id,
      ratePlanChannexId: 'rp-manual',
      dateFrom: '2026-08-20',
      dateTo: '2026-08-20',
      fields: { rateMinor: 22_000 },
      baseSnapshotVersion: 4,
    })
    expect(res.preview).toBe(false)
    expect(res.intent?.lane).toBe('restrictions')
    expect(res.intent?.status).toBe('queued')
    const payload = res.intent!.payload as { values: Array<{ rate: number }> }
    expect(payload.values[0]?.rate).toBe(22_000)
  })

  it('AE5: stale snapshot rejects rate write', async () => {
    const { sync, property } = seedRateCatalog()
    await expect(
      setCalendarRestrictions(principal(), {
        propertyId: property.id,
        ratePlanChannexId: 'rp-manual',
        dateFrom: '2026-08-20',
        dateTo: '2026-08-20',
        fields: { stopSell: true },
        baseSnapshotVersion: 1,
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(sync.domain.ariWriteIntents).toHaveLength(0)
  })

  it('rejects nightly edit on derived plan', async () => {
    const { sync, property } = seedRateCatalog()
    await expect(
      setCalendarRestrictions(principal(), {
        propertyId: property.id,
        ratePlanChannexId: 'rp-derived',
        dateFrom: '2026-08-20',
        dateTo: '2026-08-20',
        fields: { rateMinor: 18_000 },
        baseSnapshotVersion: 4,
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(sync.domain.ariWriteIntents).toHaveLength(0)
  })

  it('queues derived modifier when capability on', async () => {
    const { sync, property } = seedRateCatalog({ derivedWrite: true })
    const res = await setCalendarDerivedModifier(principal(), {
      propertyId: property.id,
      ratePlanChannexId: 'rp-derived',
      occupancy: 2,
      isPrimary: true,
      derivedOption: { rate: [['increase_by_percent', '12']] },
      baseSnapshotVersion: 4,
    })
    expect(res.intent?.lane).toBe('rate_plan')
    expect(sync.domain.ariWriteIntents).toHaveLength(1)
  })

  it('fail-closed: persist failure removes in-memory intent and returns 503', async () => {
    const { sync, property } = seedRateCatalog()
    const prevUrl = process.env.DATABASE_URL
    process.env.DATABASE_URL = 'postgresql://test/fail-closed'
    const auth = await import('../../server/utils/auth')
    const spy = vi.spyOn(auth, 'getDb').mockImplementation(() => {
      throw new Error('pg down')
    })
    try {
      await expect(
        setCalendarRestrictions(principal(), {
          propertyId: property.id,
          ratePlanChannexId: 'rp-manual',
          dateFrom: '2026-08-20',
          dateTo: '2026-08-20',
          fields: { rateMinor: 22_000 },
          baseSnapshotVersion: 4,
        }),
      ).rejects.toMatchObject({ statusCode: 503 })
      expect(sync.domain.ariWriteIntents).toHaveLength(0)
    } finally {
      spy.mockRestore()
      if (prevUrl === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = prevUrl
    }
  })
})

describe('rates read model write affordances (U7)', () => {
  it('keeps ariWriteEnabled false when capabilities default off', () => {
    const model = projectRatesReadOnly(
      principal({ role: 'front_desk' }),
      [{ id: 10, name: 'Cabin' }],
      [],
      {
        status: 'healthy',
        lastPullAt: '2026-07-16T08:00:00.000Z',
        updatedAt: '2026-07-16T08:00:00.000Z',
      },
    )
    expect(model.ariWriteEnabled).toBe(false)
    expect(model.readOnly).toBe(true)
  })

  it('marks manual plans nightly-editable when rateRestrictionWrite on', () => {
    const model = projectRatesReadOnly(
      principal(),
      [{ id: 10, name: 'Cabin' }],
      [
        {
          propertyId: 10,
          ratePlanId: 'rp-manual',
          ratePlanName: 'BAR',
          currency: 'USD',
          amountMinor: 20_000,
          dateFrom: '2026-08-20',
          dateTo: '2026-08-20',
          minStay: 1,
          stopSell: false,
          parityWarning: null,
          cachedAt: '2026-08-01T00:00:00.000Z',
          rateMode: 'manual',
          parentRatePlanChannexId: null,
        },
        {
          propertyId: 10,
          ratePlanId: 'rp-derived',
          ratePlanName: 'Airbnb',
          currency: 'USD',
          amountMinor: 18_000,
          dateFrom: '2026-08-20',
          dateTo: '2026-08-20',
          minStay: 1,
          stopSell: false,
          parityWarning: null,
          cachedAt: '2026-08-01T00:00:00.000Z',
          rateMode: 'derived',
          parentRatePlanChannexId: 'rp-manual',
        },
      ],
      {
        status: 'healthy',
        lastPullAt: '2026-07-16T08:00:00.000Z',
        updatedAt: '2026-07-16T08:00:00.000Z',
      },
      Date.parse('2026-07-16T12:00:00.000Z'),
      {
        capabilities: {
          rateRestrictionWrite: true,
          derivedRateWrite: true,
          availabilityWrite: false,
        },
      },
    )
    expect(model.ariWriteEnabled).toBe(true)
    expect(model.readOnly).toBe(false)
    const manual = model.plans.find((p) => p.ratePlanId === 'rp-manual')
    const derived = model.plans.find((p) => p.ratePlanId === 'rp-derived')
    expect(manual?.nightlyEditable).toBe(true)
    expect(derived?.nightlyEditable).toBe(false)
    expect(derived?.derivedModifierEditable).toBe(true)
  })
})
