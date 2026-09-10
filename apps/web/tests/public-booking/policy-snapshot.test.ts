import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  computeDepositMinor,
  snapshotPaymentTerms,
  resolvePublicBookingReadiness,
  type LiveCollectionPolicy,
} from '@pms/domain'
import { canManageBookingPolicy, policyFromRow } from '../../server/utils/booking-policy'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

const policy = (
  overrides: Partial<LiveCollectionPolicy> = {},
): LiveCollectionPolicy => ({
  propertyId: 10,
  collectionType: 'percent',
  percent: 30,
  fixedAmountMinor: null,
  termsText: 'Arrival after 3pm.',
  stripeConnectAccountId: null,
  stripeChargesEnabled: false,
  updatedAt: '2026-09-10T00:00:00.000Z',
  ...overrides,
})

describe('booking policy snapshot (U2)', () => {
  it('exposes staff settings APIs and a dedicated page', () => {
    const page = readFileSync(join(webRoot, 'app/pages/settings/booking.vue'), 'utf8')
    expect(page).toContain('Public booking')
    expect(page).toContain('/api/settings/booking-policy')
    expect(page).toContain('Copy')
    expect(readFileSync(join(webRoot, 'server/api/settings/booking-policy.put.ts'), 'utf8')).toContain(
      'persistLivePolicy',
    )
    expect(canManageBookingPolicy('front_desk')).toBe(false)
    expect(canManageBookingPolicy('org_admin')).toBe(true)
  })

  it('previews deposit from the live policy without mutating a prior snapshot', () => {
    const live = policy({ collectionType: 'percent', percent: 30, stripeChargesEnabled: true })
    const booked = snapshotPaymentTerms(live, 15_000, 'USD', new Date('2026-09-01Z'))
    const switched = snapshotPaymentTerms(
      policy({ collectionType: 'full', percent: null, termsText: 'New' }),
      15_000,
      'USD',
      new Date('2026-09-10Z'),
    )
    expect(computeDepositMinor(live, 15_000)).toBe(4500)
    expect(booked.depositMinor).toBe(4500)
    expect(booked.collectionType).toBe('percent')
    expect(switched.collectionType).toBe('full')
    expect(booked.termsText).not.toBe(switched.termsText)
  })

  it('keeps collect-now without charges as not-ready (no silent pay-at-hotel)', () => {
    const readiness = resolvePublicBookingReadiness({
      archived: false,
      bookingCrsWrite: true,
      policy: policy({ collectionType: 'percent', percent: 30, stripeChargesEnabled: false }),
      mappedRoomTypes: 2,
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
    })
    expect(readiness).toEqual({
      status: 'not_ready',
      reason: 'collect_now_charges_disabled',
    })
  })

  it('does not invent a policy from empty property columns', () => {
    expect(
      policyFromRow({
        propertyId: 10,
        bookingCollectionType: null,
        bookingCollectionPercent: null,
        bookingCollectionFixedMinor: null,
        bookingTermsText: null,
        stripeConnectAccountId: null,
        stripeChargesEnabled: false,
        bookingPolicyUpdatedAt: null,
      }),
    ).toBeNull()
  })
})
