import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  createMemoryStore,
  quoteStay,
  runCommand,
  type CommandContext,
} from '@pms/domain'
import { filterOwnerBookings } from '../../server/utils/owner'
import { expirePendingPublicHolds } from '../../server/lib/expire-public-holds'
import { maskEmail } from '../../server/utils/public-booking'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

function ctx(): CommandContext {
  return {
    principal: buildPrincipal({
      userId: 'public-booking:1',
      networkId: 1,
      role: 'front_desk',
      propertyIds: [10],
      networkWide: false,
    })!,
    actorKind: 'user',
    networkId: 1,
    propertyId: 10,
    idempotencyKey: 'idem-1',
  }
}

function seedQuoteable(store: ReturnType<typeof createMemoryStore>) {
  const pulledAt = new Date().toISOString()
  store.networkCapabilities.push({
    networkId: 1,
    bookingCrsWrite: true,
    availabilityWrite: true,
    rateRestrictionWrite: false,
    derivedRateWrite: false,
    aiApply: false,
    updatedAt: pulledAt,
  })
  for (const date of ['2026-10-01', '2026-10-02']) {
    store.ariAvailability.push({
      networkId: 1,
      propertyId: 10,
      roomTypeId: 5,
      date,
      availability: 1,
      snapshotVersion: 4,
      pulledAt,
    })
  }
}

describe('public book flow (U3 / AE2 / AE4)', () => {
  it('requires email and snapshots pay-at-hotel without a Stripe session', async () => {
    const book = readFileSync(join(webRoot, 'server/api/public/booking/book.post.ts'), 'utf8')
    expect(book).toContain('consumeQuoteToken')
    expect(book).toContain('stayTotalMinor')
    expect(book).toContain('guestEmail')
    expect(book).toContain('strictObject')

    const store = createMemoryStore()
    seedQuoteable(store)
    const created = await runCommand(
      'createDirectReservation',
      ctx(),
      {
        propertyId: 10,
        checkInDate: '2026-10-01',
        checkOutDate: '2026-10-03',
        guestName: 'Ada Lovelace',
        guestEmail: 'ada@example.com',
        roomTypeId: 5,
        roomTypeChannexId: 'rt',
        ratePlanChannexId: 'rp',
        days: { '2026-10-01': '100.00', '2026-10-02': '110.00' },
        adults: 2,
        requireEmail: true,
        failClosedMissingAri: true,
        paymentCollect: 'pay_at_hotel',
        totalAmountMinor: 21000,
        paymentTermsSnapshot: {
          collectionType: 'pay_at_hotel',
          percent: null,
          fixedAmountMinor: null,
          termsText: 'Pay at the hotel.',
          stayTotalMinor: 21000,
          depositMinor: 0,
          currency: 'USD',
          snapshottedAt: new Date().toISOString(),
        },
        confirmationToken: 'a'.repeat(32),
        reservationStatus: 'pending_sync',
        enqueueCrs: true,
      },
      { store },
    )
    expect(created.status).toBe('ok')
    const row = store.reservations[0]!
    expect(row.guestEmail).toBe('ada@example.com')
    expect(row.paymentTermsSnapshot?.collectionType).toBe('pay_at_hotel')
    expect(store.ariWriteIntents.some((i) => i.lane === 'booking_crs')).toBe(true)
    expect(maskEmail(row.guestEmail)).toBe('a***@example.com')
  })

  it('rejects a public create when a stay night has no ARI', async () => {
    const store = createMemoryStore()
    store.networkCapabilities.push({
      networkId: 1,
      bookingCrsWrite: true,
      availabilityWrite: false,
      rateRestrictionWrite: false,
      derivedRateWrite: false,
      aiApply: false,
      updatedAt: new Date().toISOString(),
    })
    const created = await runCommand(
      'createDirectReservation',
      ctx(),
      {
        propertyId: 10,
        checkInDate: '2026-10-01',
        checkOutDate: '2026-10-03',
        guestName: 'Guest',
        guestEmail: 'g@example.com',
        roomTypeId: 5,
        roomTypeChannexId: 'rt',
        ratePlanChannexId: 'rp',
        days: { '2026-10-01': '100.00', '2026-10-02': '110.00' },
        adults: 1,
        requireEmail: true,
        failClosedMissingAri: true,
      },
      { store },
    )
    expect(created.status).toBe('rejected')
    expect(created.error?.code).toBe('CONFLICT')
    expect(store.reservations).toHaveLength(0)
  })

  it('excludes pending_payment from owner totals and expires unpaid holds', () => {
    const store = createMemoryStore()
    store.reservations.push({
      id: 1,
      networkId: 1,
      propertyId: 10,
      status: 'pending_payment',
      checkInDate: '2026-10-01',
      checkOutDate: '2026-10-03',
      currency: 'USD',
      staffNotes: null,
      channexBookingId: null,
      pendingSyncReason: null,
      guestName: 'Hold',
      totalAmountMinor: 21000,
      checkoutExpiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    const owner = buildPrincipal({
      userId: 'owner-1',
      networkId: 1,
      role: 'property_owner',
      ownerPropertyIds: [10],
      propertyIds: [10],
      networkWide: false,
    })!
    expect(filterOwnerBookings(store.reservations, owner)).toHaveLength(0)
    expect(expirePendingPublicHolds(store)).toBe(1)
    expect(store.reservations[0]!.status).toBe('released')
  })

  it('does not TTL-release a Stripe-bound hold without Stripe retrieve', () => {
    const store = createMemoryStore()
    store.reservations.push({
      id: 2,
      networkId: 1,
      propertyId: 10,
      status: 'pending_payment',
      checkInDate: '2026-10-01',
      checkOutDate: '2026-10-03',
      currency: 'USD',
      staffNotes: null,
      channexBookingId: null,
      pendingSyncReason: null,
      guestName: 'Paid',
      stripeCheckoutSessionId: 'cs_paid',
      stripeConnectedAccountId: 'acct_1',
      checkoutExpiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    expect(expirePendingPublicHolds(store)).toBe(0)
    expect(store.reservations[0]!.status).toBe('pending_payment')
  })

  it('ignores client depositMinor and uses the quote token amounts (AE4)', () => {
    const book = readFileSync(join(webRoot, 'server/api/public/booking/book.post.ts'), 'utf8')
    expect(book).toContain('Client money fields are ignored')
    expect(book).toContain('payload.stayTotalMinor')
    expect(book).not.toContain('parsed.data.depositMinor')
    expect(book).not.toContain('parsed.data.stayTotalMinor')
  })

  it('rejects a re-validation after stop-sell so book must re-quote (AE5)', () => {
    const store = createMemoryStore()
    seedQuoteable(store)
    store.ratePlans.push({
      networkId: 1,
      propertyId: 10,
      channexId: 'rp',
      roomTypeChannexId: 'rt',
      title: 'BAR',
      currency: 'USD',
      parentRatePlanChannexId: null,
      channexRaw: null,
      pulledAt: new Date().toISOString(),
    })
    for (const date of ['2026-10-01', '2026-10-02']) {
      store.ariRestrictions.push({
        networkId: 1,
        propertyId: 10,
        ratePlanChannexId: 'rp',
        date,
        rateMinor: 10000,
        minStayArrival: 1,
        minStayThrough: null,
        maxStay: null,
        closedToArrival: false,
        closedToDeparture: false,
        stopSell: false,
        snapshotVersion: 4,
        pulledAt: new Date().toISOString(),
      })
    }
    const quoteInput = {
      networkId: 1,
      propertyId: 10,
      roomTypeId: 5,
      ratePlanChannexId: 'rp',
      checkInDate: '2026-10-01',
      checkOutDate: '2026-10-03',
      adults: 1,
      occupancyCap: 2,
      timeZone: 'UTC',
    }
    expect(quoteStay(store, quoteInput).ok).toBe(true)
    store.ariRestrictions[0]!.stopSell = true
    expect(quoteStay(store, quoteInput)).toEqual({
      ok: false,
      reason: 'stop_sell',
    })
    const book = readFileSync(join(webRoot, 'server/api/public/booking/book.post.ts'), 'utf8')
    expect(book).toContain("statusMessage: 'Quote expired. Please re-quote.'")
  })

  it('keeps staff create working without email', async () => {
    const store = createMemoryStore()
    seedQuoteable(store)
    const created = await runCommand(
      'createDirectReservation',
      {
        ...ctx(),
        principal: buildPrincipal({
          userId: 'staff-1',
          networkId: 1,
          role: 'front_desk',
          propertyIds: [10],
          networkWide: false,
        })!,
      },
      {
        propertyId: 10,
        checkInDate: '2026-10-01',
        checkOutDate: '2026-10-03',
        guestName: 'Walk In',
        roomTypeId: 5,
        roomTypeChannexId: 'rt',
        ratePlanChannexId: 'rp',
        days: { '2026-10-01': '100.00', '2026-10-02': '110.00' },
        adults: 1,
      },
      { store },
    )
    expect(created.status).toBe('ok')
    expect(created.data?.guestEmail).toBeNull()
  })
})
