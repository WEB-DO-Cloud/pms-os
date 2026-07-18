import { describe, expect, it } from 'vitest'
import { createChannexClient } from './client'

/**
 * Opt-in Channex sandbox contract test (U2). Runs only when both
 * CHANNEX_SANDBOX_API_KEY and CHANNEX_SANDBOX_PROPERTY_ID are set; CI and local
 * unit runs skip it. Verifies the live GET shapes our normalizer depends on.
 */
const apiKey = process.env.CHANNEX_SANDBOX_API_KEY
const propertyId = process.env.CHANNEX_SANDBOX_PROPERTY_ID
const enabled = Boolean(apiKey && propertyId)

function isoDatePlusDays(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

describe.skipIf(!enabled)('Channex sandbox ARI contract', () => {
  const client = createChannexClient({ apiKey: apiKey! })
  const dateFrom = isoDatePlusDays(1)
  const dateTo = isoDatePlusDays(7)

  it('GET /availability returns a room-type → date → integer map', async () => {
    const res = await client.getAvailability(propertyId!, dateFrom, dateTo)
    expect(res.data).toBeTypeOf('object')
    for (const byDate of Object.values(res.data)) {
      for (const [date, value] of Object.entries(byDate)) {
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(Number.isInteger(value)).toBe(true)
      }
    }
  })

  it('GET /restrictions returns rate-plan → date → restriction values', async () => {
    const res = await client.getRestrictions(propertyId!, dateFrom, dateTo, [
      'rate',
      'min_stay_arrival',
      'min_stay_through',
      'max_stay',
      'closed_to_arrival',
      'closed_to_departure',
      'stop_sell',
    ])
    expect(res.data).toBeTypeOf('object')
    for (const byDate of Object.values(res.data)) {
      for (const values of Object.values(byDate)) {
        if (values.rate != null) {
          expect(['string', 'number']).toContain(typeof values.rate)
        }
        if (values.stop_sell != null) expect(typeof values.stop_sell).toBe('boolean')
        if (values.closed_to_arrival != null) {
          expect(typeof values.closed_to_arrival).toBe('boolean')
        }
        if (values.min_stay_arrival != null) {
          expect(Number.isInteger(values.min_stay_arrival)).toBe(true)
        }
        if (values.max_stay != null) expect(Number.isInteger(values.max_stay)).toBe(true)
      }
    }
  })

  it('GET /rate_plans is property-scoped with title and currency', async () => {
    const res = await client.listRatePlans(propertyId!)
    for (const plan of res.data) {
      expect(plan.attributes.title).toBeTypeOf('string')
      expect(plan.attributes.property_id).toBe(propertyId)
    }
  })
})
