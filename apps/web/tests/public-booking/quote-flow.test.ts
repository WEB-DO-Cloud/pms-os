import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  createMemoryStore,
  mintQuoteToken,
  quoteStay,
  resolvePublicBookingReadiness,
  verifyQuoteToken,
} from '@pms/domain'
import { isAllowedBookingOrigin } from '../../server/utils/public-booking'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('public quote flow (U1 / AE1 / AE5 / AE6)', () => {
  it('registers unauthenticated catalog and quote routes', () => {
    const catalog = readFileSync(
      join(webRoot, 'server/api/public/booking/catalog.get.ts'),
      'utf8',
    )
    const quote = readFileSync(
      join(webRoot, 'server/api/public/booking/quote.post.ts'),
      'utf8',
    )
    expect(catalog).toContain('resolvePublicProperty')
    expect(catalog).not.toContain('requirePrincipal')
    expect(quote).toContain('buildCatalogOffers')
    expect(quote).toContain('strictObject')
    expect(isAllowedBookingOrigin('https://evil.example')).toBe(false)
    expect(isAllowedBookingOrigin('https://book.pms.do')).toBe(true)
  })

  it('returns a token on fresh ARI and not-available on stale ARI', () => {
    const store = createMemoryStore()
    const pulledAt = '2026-09-10T11:30:00.000Z'
    store.ratePlans.push({
      networkId: 1,
      propertyId: 10,
      channexId: 'rp',
      roomTypeChannexId: 'rt',
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
        availability: 1,
        snapshotVersion: 3,
        pulledAt,
      })
      store.ariRestrictions.push({
        networkId: 1,
        propertyId: 10,
        ratePlanChannexId: 'rp',
        date,
        rateMinor: 9000,
        minStayArrival: 1,
        minStayThrough: null,
        maxStay: null,
        closedToArrival: false,
        closedToDeparture: false,
        stopSell: false,
        snapshotVersion: 3,
        pulledAt,
      })
    }
    const ok = quoteStay(store, {
      networkId: 1,
      propertyId: 10,
      roomTypeId: 5,
      ratePlanChannexId: 'rp',
      checkInDate: '2026-10-01',
      checkOutDate: '2026-10-03',
      adults: 1,
      occupancyCap: 2,
      timeZone: 'UTC',
      nowMs: Date.parse('2026-09-10T12:00:00Z'),
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      const minted = mintQuoteToken(
        {
          networkId: 1,
          propertyId: 10,
          checkInDate: '2026-10-01',
          checkOutDate: '2026-10-03',
          roomTypeId: 5,
          ratePlanChannexId: 'rp',
          adults: 1,
          baseSnapshotVersion: ok.baseSnapshotVersion,
          nights: { '2026-10-01': 9000, '2026-10-02': 9000 },
          currency: 'USD',
          stayTotalMinor: 18000,
          depositMinor: 0,
          collectionType: 'pay_at_hotel',
        },
        'secret',
      )
      expect(verifyQuoteToken(minted.token, 'secret').ok).toBe(true)
    }
    store.ariAvailability[0]!.pulledAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    expect(
      quoteStay(store, {
        networkId: 1,
        propertyId: 10,
        roomTypeId: 5,
        ratePlanChannexId: 'rp',
        checkInDate: '2026-10-01',
        checkOutDate: '2026-10-03',
        adults: 1,
        occupancyCap: 2,
        timeZone: 'UTC',
      }),
    ).toEqual({ ok: false, reason: 'stale_ari' })
  })

  it('does not treat archived or CRS-off as an empty offer list', () => {
    expect(
      resolvePublicBookingReadiness({
        archived: true,
        bookingCrsWrite: true,
        policy: {
          propertyId: 10,
          collectionType: 'pay_at_hotel',
          percent: null,
          fixedAmountMinor: null,
          termsText: 'Terms',
          stripeConnectAccountId: null,
          stripeChargesEnabled: false,
          updatedAt: new Date().toISOString(),
        },
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
            pulledAt: new Date().toISOString(),
          },
        ],
      }).status,
    ).toBe('not_found')
    expect(
      resolvePublicBookingReadiness({
        archived: false,
        bookingCrsWrite: false,
        policy: {
          propertyId: 10,
          collectionType: 'pay_at_hotel',
          percent: null,
          fixedAmountMinor: null,
          termsText: 'Terms',
          stripeConnectAccountId: null,
          stripeChargesEnabled: false,
          updatedAt: new Date().toISOString(),
        },
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
            pulledAt: new Date().toISOString(),
          },
        ],
      }),
    ).toEqual({ status: 'not_ready', reason: 'crs_off' })
  })
})
