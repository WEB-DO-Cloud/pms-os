import { describe, expect, it } from 'vitest'
import { createMemoryStore } from './store'
import {
  computeDepositMinor,
  snapshotPaymentTerms,
  mintQuoteToken,
  verifyQuoteToken,
  resolvePublicBookingReadiness,
  publicVacancyForNight,
  type LiveCollectionPolicy,
} from './public-booking'
import { quoteStay } from './rates/stay-quote'

const policy = (
  overrides: Partial<LiveCollectionPolicy> = {},
): LiveCollectionPolicy => ({
  propertyId: 10,
  collectionType: 'percent',
  percent: 30,
  fixedAmountMinor: null,
  termsText: 'Cancel 48 hours before arrival.',
  stripeConnectAccountId: 'acct_test',
  stripeChargesEnabled: true,
  updatedAt: '2026-09-10T00:00:00.000Z',
  ...overrides,
})

describe('collection policy snapshot (U2)', () => {
  it('computes percent / fixed / full / pay-at-hotel deposits', () => {
    expect(computeDepositMinor(policy({ collectionType: 'percent', percent: 30 }), 10_000)).toBe(
      3000,
    )
    expect(
      computeDepositMinor(
        policy({ collectionType: 'fixed', percent: null, fixedAmountMinor: 1500 }),
        10_000,
      ),
    ).toBe(1500)
    expect(computeDepositMinor(policy({ collectionType: 'full', percent: null }), 10_000)).toBe(
      10_000,
    )
    expect(
      computeDepositMinor(policy({ collectionType: 'pay_at_hotel', percent: null }), 10_000),
    ).toBe(0)
  })

  it('keeps an existing snapshot when the live policy changes', () => {
    const first = snapshotPaymentTerms(policy(), 20_000, 'USD', new Date('2026-09-01T00:00:00Z'))
    const later = snapshotPaymentTerms(
      policy({ collectionType: 'pay_at_hotel', percent: null, termsText: 'New terms' }),
      20_000,
      'USD',
      new Date('2026-09-10T00:00:00Z'),
    )
    expect(first.collectionType).toBe('percent')
    expect(first.depositMinor).toBe(6000)
    expect(first.termsText).toBe('Cancel 48 hours before arrival.')
    expect(later.collectionType).toBe('pay_at_hotel')
    expect(later.depositMinor).toBe(0)
    expect(first).not.toEqual(later)
  })

  it('marks collect-now without charges as not-ready', () => {
    const readiness = resolvePublicBookingReadiness({
      archived: false,
      bookingCrsWrite: true,
      policy: policy({ stripeChargesEnabled: false }),
      mappedRoomTypes: 1,
      parentOrManualPlans: [
        {
          networkId: 1,
          propertyId: 10,
          channexId: 'rp-1',
          roomTypeChannexId: 'rt-1',
          title: 'BAR',
          currency: 'USD',
          parentRatePlanChannexId: null,
          channexRaw: null,
          pulledAt: new Date().toISOString(),
        },
      ],
    })
    expect(readiness).toEqual({
      status: 'not_ready',
      reason: 'collect_now_charges_disabled',
    })
  })
})

describe('public quote (U1 / AE1 / AE5 / AE6)', () => {
  const pulledAt = '2026-09-10T11:30:00.000Z'

  function seedFreshStay(store: ReturnType<typeof createMemoryStore>) {
    store.ratePlans.push({
      networkId: 1,
      propertyId: 10,
      channexId: 'rp-parent',
      roomTypeChannexId: 'rt-uuid',
      title: 'BAR',
      currency: 'USD',
      parentRatePlanChannexId: null,
      channexRaw: null,
      pulledAt,
    })
    for (const date of ['2026-10-01', '2026-10-02']) {
      store.ariAvailability.push({
        networkId: 1,
        propertyId: 10,
        roomTypeId: 5,
        date,
        availability: 2,
        snapshotVersion: 7,
        pulledAt,
      })
      store.ariRestrictions.push({
        networkId: 1,
        propertyId: 10,
        ratePlanChannexId: 'rp-parent',
        date,
        rateMinor: date === '2026-10-01' ? 10000 : 11000,
        minStayArrival: 1,
        minStayThrough: null,
        maxStay: null,
        closedToArrival: false,
        closedToDeparture: false,
        stopSell: false,
        snapshotVersion: 7,
        pulledAt,
      })
    }
  }

  it('returns per-night amounts for two vacant nights', () => {
    const store = createMemoryStore()
    seedFreshStay(store)
    const quoted = quoteStay(store, {
      networkId: 1,
      propertyId: 10,
      roomTypeId: 5,
      ratePlanChannexId: 'rp-parent',
      checkInDate: '2026-10-01',
      checkOutDate: '2026-10-03',
      adults: 2,
      occupancyCap: 3,
      timeZone: 'UTC',
      nowMs: Date.parse('2026-09-10T12:00:00Z'),
    })
    expect(quoted.ok).toBe(true)
    if (!quoted.ok) return
    expect(quoted.nights).toEqual([
      { date: '2026-10-01', rateMinor: 10000 },
      { date: '2026-10-02', rateMinor: 11000 },
    ])
    expect(quoted.stayTotalMinor).toBe(21000)
    expect(quoted.baseSnapshotVersion).toBe(7)
  })

  it('fails closed on stale ARI instead of skipping the night', () => {
    const store = createMemoryStore()
    seedFreshStay(store)
    store.ariAvailability[0]!.pulledAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    const quoted = quoteStay(store, {
      networkId: 1,
      propertyId: 10,
      roomTypeId: 5,
      ratePlanChannexId: 'rp-parent',
      checkInDate: '2026-10-01',
      checkOutDate: '2026-10-03',
      adults: 2,
      occupancyCap: 3,
      timeZone: 'UTC',
    })
    expect(quoted).toEqual({ ok: false, reason: 'stale_ari' })
  })

  it('omits a stay when stop-sell hits one night', () => {
    const store = createMemoryStore()
    seedFreshStay(store)
    store.ariRestrictions[1]!.stopSell = true
    const quoted = quoteStay(store, {
      networkId: 1,
      propertyId: 10,
      roomTypeId: 5,
      ratePlanChannexId: 'rp-parent',
      checkInDate: '2026-10-01',
      checkOutDate: '2026-10-03',
      adults: 2,
      occupancyCap: 3,
      timeZone: 'UTC',
      nowMs: Date.parse('2026-09-10T12:00:00Z'),
    })
    expect(quoted).toEqual({ ok: false, reason: 'stop_sell' })
  })

  it('rejects check-in after the 90-day horizon and before local today', () => {
    const store = createMemoryStore()
    seedFreshStay(store)
    expect(
      quoteStay(store, {
        networkId: 1,
        propertyId: 10,
        roomTypeId: 5,
        ratePlanChannexId: 'rp-parent',
        checkInDate: '2027-01-01',
        checkOutDate: '2027-01-03',
        adults: 1,
        occupancyCap: 2,
        timeZone: 'UTC',
        nowMs: Date.parse('2026-09-10T12:00:00Z'),
      }).ok,
    ).toBe(false)
    expect(
      quoteStay(store, {
        networkId: 1,
        propertyId: 10,
        roomTypeId: 5,
        ratePlanChannexId: 'rp-parent',
        checkInDate: '2026-09-01',
        checkOutDate: '2026-09-03',
        adults: 1,
        occupancyCap: 2,
        timeZone: 'UTC',
        nowMs: Date.parse('2026-09-10T12:00:00Z'),
      }),
    ).toEqual({ ok: false, reason: 'past_checkin' })
  })

  it('counts pending_payment holds against public vacancy', () => {
    const store = createMemoryStore()
    seedFreshStay(store)
    store.ariAvailability.forEach((row) => {
      row.availability = 1
    })
    store.reservations.push({
      id: 99,
      networkId: 1,
      propertyId: 10,
      roomTypeId: 5,
      status: 'pending_payment',
      checkInDate: '2026-10-01',
      checkOutDate: '2026-10-03',
      currency: 'USD',
      staffNotes: null,
      channexBookingId: null,
      pendingSyncReason: null,
      guestName: 'Hold',
    })
    const night = publicVacancyForNight(store, {
      networkId: 1,
      propertyId: 10,
      roomTypeId: 5,
      night: '2026-10-01',
      nowMs: Date.parse('2026-09-10T12:00:00Z'),
      freshnessMs: 60 * 60 * 1000,
    })
    expect(night).toEqual({ ok: true, remaining: 0 })
  })

  it('mints an HMAC token and rejects a tampered body', () => {
    const minted = mintQuoteToken(
      {
        networkId: 1,
        propertyId: 10,
        checkInDate: '2026-10-01',
        checkOutDate: '2026-10-03',
        roomTypeId: 5,
        ratePlanChannexId: 'rp-parent',
        adults: 2,
        baseSnapshotVersion: 7,
        nights: { '2026-10-01': 10000, '2026-10-02': 11000 },
        currency: 'USD',
        stayTotalMinor: 21000,
        depositMinor: 6300,
        collectionType: 'percent',
      },
      'quote-secret',
      Date.parse('2026-09-10T00:00:00Z'),
    )
    expect(verifyQuoteToken(minted.token, 'quote-secret', Date.parse('2026-09-10T00:01:00Z')).ok).toBe(
      true,
    )
    const [body, mac] = minted.token.split('.')
    const tampered = JSON.parse(Buffer.from(body!, 'base64url').toString('utf8'))
    tampered.depositMinor = 100
    const bad = `${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${mac}`
    expect(verifyQuoteToken(bad, 'quote-secret').ok).toBe(false)
  })

  it('returns not-found for archived slugs and not-ready when CRS is off', () => {
    expect(
      resolvePublicBookingReadiness({
        archived: true,
        bookingCrsWrite: true,
        policy: policy({ collectionType: 'pay_at_hotel', percent: null }),
        mappedRoomTypes: 1,
        parentOrManualPlans: [
          {
            networkId: 1,
            propertyId: 10,
            channexId: 'rp',
            roomTypeChannexId: 'rt',
            title: 'BAR',
            currency: 'USD',
            parentRatePlanChannexId: null,
            channexRaw: null,
            pulledAt: pulledAt,
          },
        ],
      }),
    ).toEqual({ status: 'not_found' })
    expect(
      resolvePublicBookingReadiness({
        archived: false,
        bookingCrsWrite: false,
        policy: policy({ collectionType: 'pay_at_hotel', percent: null }),
        mappedRoomTypes: 1,
        parentOrManualPlans: [
          {
            networkId: 1,
            propertyId: 10,
            channexId: 'rp',
            roomTypeChannexId: 'rt',
            title: 'BAR',
            currency: 'USD',
            parentRatePlanChannexId: null,
            channexRaw: null,
            pulledAt,
          },
        ],
      }),
    ).toEqual({ status: 'not_ready', reason: 'crs_off' })
    expect(
      resolvePublicBookingReadiness({
        archived: false,
        bookingCrsWrite: true,
        policy: null,
        mappedRoomTypes: 1,
        parentOrManualPlans: [
          {
            networkId: 1,
            propertyId: 10,
            channexId: 'rp',
            roomTypeChannexId: 'rt',
            title: 'BAR',
            currency: 'USD',
            parentRatePlanChannexId: null,
            channexRaw: null,
            pulledAt,
          },
        ],
      }),
    ).toEqual({ status: 'not_ready', reason: 'no_policy' })
  })
})
