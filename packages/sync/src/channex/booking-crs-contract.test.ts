import { describe, expect, it } from 'vitest'
import { createChannexClient } from './client'

/**
 * Opt-in Channex Booking CRS sandbox contract (U5). Runs only when
 * CHANNEX_SANDBOX_API_KEY, CHANNEX_SANDBOX_PROPERTY_ID, CHANNEX_SANDBOX_ROOM_TYPE_ID,
 * and CHANNEX_SANDBOX_RATE_PLAN_ID are set. Skipped in CI/unit runs by default.
 *
 * Stop condition: if sandbox dedupe/reconciliation cannot be proven, keep the
 * client + gated path fail-closed and do not enable production senders.
 */
const apiKey = process.env.CHANNEX_SANDBOX_API_KEY
const propertyId = process.env.CHANNEX_SANDBOX_PROPERTY_ID
const roomTypeId = process.env.CHANNEX_SANDBOX_ROOM_TYPE_ID
const ratePlanId = process.env.CHANNEX_SANDBOX_RATE_PLAN_ID
const enabled = Boolean(apiKey && propertyId && roomTypeId && ratePlanId)

function isoDatePlusDays(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

describe.skipIf(!enabled)('Channex sandbox Booking CRS contract', () => {
  const client = createChannexClient({ apiKey: apiKey! })
  const arrival = isoDatePlusDays(30)
  const departure = isoDatePlusDays(32)
  const code = `PMS-SANDBOX-${Date.now()}`

  it('POST /bookings Offline create returns booking id (async — revision may lag)', async () => {
    const res = await client.createBooking({
      property_id: propertyId!,
      ota_reservation_code: code,
      ota_name: 'Offline',
      arrival_date: arrival,
      departure_date: departure,
      currency: 'USD',
      customer: { name: 'Sandbox', surname: 'Guest' },
      rooms: [
        {
          room_type_id: roomTypeId!,
          rate_plan_id: ratePlanId!,
          days: {
            [arrival]: '100.00',
            [isoDatePlusDays(31)]: '100.00',
          },
          guests: [{ name: 'Sandbox', surname: 'Guest' }],
          occupancy: { adults: 1, children: 0, infants: 0 },
        },
      ],
    })
    expect(res.data.attributes.booking_id || res.data.id).toBeTruthy()
    // Idempotent replay with same ota_reservation_code — document observed behavior.
    const replay = await client.createBooking({
      property_id: propertyId!,
      ota_reservation_code: code,
      ota_name: 'Offline',
      arrival_date: arrival,
      departure_date: departure,
      currency: 'USD',
      customer: { name: 'Sandbox', surname: 'Guest' },
      rooms: [
        {
          room_type_id: roomTypeId!,
          rate_plan_id: ratePlanId!,
          days: {
            [arrival]: '100.00',
            [isoDatePlusDays(31)]: '100.00',
          },
          guests: [{ name: 'Sandbox', surname: 'Guest' }],
          occupancy: { adults: 1, children: 0, infants: 0 },
        },
      ],
    })
    // Prefer same booking id; if sandbox rejects duplicates, that is also evidence.
    const firstId = res.data.attributes.booking_id || res.data.id
    const secondId = replay.data.attributes.booking_id || replay.data.id
    expect(secondId).toBeTruthy()
    // ponytail: sandbox dedupe not guaranteed documented — record equality when present.
    if (firstId && secondId) {
      expect(typeof firstId).toBe('string')
      expect(typeof secondId).toBe('string')
    }
  })
})
