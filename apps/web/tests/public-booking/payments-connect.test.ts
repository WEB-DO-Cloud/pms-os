import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createMemoryStore } from '@pms/domain'
import { fulfillPaidHold, releaseHold } from '../../server/utils/property-stripe'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('property Stripe Connect (U4 / AE3)', () => {
  it('keeps SaaS billing webhook isolated from Connect booking events', () => {
    const saas = readFileSync(join(webRoot, 'server/api/webhooks/stripe.post.ts'), 'utf8')
    const connect = readFileSync(
      join(webRoot, 'server/api/public/booking/stripe-connect/webhook.post.ts'),
      'utf8',
    )
    expect(saas).toContain('handleStripeWebhookEvent')
    expect(saas).not.toContain('fulfillPaidHold')
    expect(connect).toContain('fulfillPaidHold')
    expect(connect).toContain('constructConnectEvent')
    expect(connect).not.toContain('handleStripeWebhookEvent')
  })

  it('fulfills only when session, account, and amount match the hold', () => {
    const store = createMemoryStore()
    store.reservations.push({
      id: 8,
      networkId: 1,
      propertyId: 10,
      roomTypeId: 5,
      status: 'pending_payment',
      checkInDate: '2026-10-01',
      checkOutDate: '2026-10-03',
      currency: 'USD',
      staffNotes: null,
      channexBookingId: null,
      pendingSyncReason: 'public_booking_awaiting_payment',
      guestName: 'Paid Guest',
      guestEmail: 'paid@example.com',
      adults: 2,
      stripeCheckoutSessionId: 'cs_1',
      stripeConnectedAccountId: 'acct_1',
      stripeAmountTotal: 6300,
      channexRaw: {
        pendingPublicCrs: {
          roomTypeChannexId: 'rt',
          ratePlanChannexId: 'rp',
          days: { '2026-10-01': '100.00', '2026-10-02': '110.00' },
        },
      },
    })
    const row = store.reservations[0]!
    expect(
      fulfillPaidHold({
        reservation: row,
        sessionId: 'cs_1',
        accountId: 'acct_other',
        amountTotal: 6300,
        store,
      }).fulfilled,
    ).toBe(false)
    expect(row.status).toBe('pending_payment')
    expect(
      fulfillPaidHold({
        reservation: row,
        sessionId: 'cs_1',
        accountId: 'acct_1',
        amountTotal: 6300,
        store,
      }).fulfilled,
    ).toBe(true)
    expect(row.status).toBe('pending_sync')
    const crs = store.ariWriteIntents.find((i) => i.lane === 'booking_crs')
    expect(crs?.payload).toMatchObject({
      ota_reservation_code: 'PMS-1-8',
      arrival_date: '2026-10-01',
      departure_date: '2026-10-03',
      currency: 'USD',
      customer: { name: 'Paid', surname: 'Guest', mail: 'paid@example.com' },
      rooms: [
        {
          room_type_id: 'rt',
          rate_plan_id: 'rp',
          occupancy: { adults: 2, children: 0, infants: 0 },
        },
      ],
    })
    expect(store.ledger).toHaveLength(1)
    const again = fulfillPaidHold({
      reservation: row,
      sessionId: 'cs_1',
      accountId: 'acct_1',
      amountTotal: 6300,
      store,
    })
    expect(again.fulfilled).toBe(false)
    expect(store.ariWriteIntents.filter((i) => i.lane === 'booking_crs')).toHaveLength(1)
  })

  it('does not mark paid from a success_url hit and releases expired Checkout', () => {
    const confirmation = readFileSync(
      join(webRoot, 'server/api/public/booking/confirmation/[token].get.ts'),
      'utf8',
    )
    expect(confirmation).toContain('Payment is still processing')
    expect(confirmation).not.toContain("status = 'confirmed'")

    const store = createMemoryStore()
    store.reservations.push({
      id: 9,
      networkId: 1,
      propertyId: 10,
      status: 'pending_payment',
      checkInDate: '2026-10-01',
      checkOutDate: '2026-10-03',
      currency: 'USD',
      staffNotes: null,
      channexBookingId: null,
      pendingSyncReason: null,
      guestName: 'Expire',
      stripeCheckoutSessionId: 'cs_exp',
    })
    releaseHold(store.reservations[0]!, 'expired')
    expect(store.reservations[0]!.status).toBe('released')
  })
})
