import { describe, expect, it, vi } from 'vitest'
import { createChannexClient } from './client'

describe('Channex message client', () => {
  it('sends replies to inquiry threads', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            id: 'message-1',
            type: 'message',
            attributes: {
              message: 'Thanks for your inquiry',
              sender: 'property',
              inserted_at: '2026-07-17T20:00:00.000Z',
            },
          },
        }),
        { status: 200 },
      ),
    )
    const client = createChannexClient({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/api/v1',
      fetchFn: fetchFn as typeof fetch,
    })

    const response = await client.sendThreadMessage(
      'thread with spaces',
      'Thanks for your inquiry',
    )

    expect(response.data.id).toBe('message-1')
    expect(fetchFn).toHaveBeenCalledWith(
      'https://example.test/api/v1/message_threads/thread%20with%20spaces/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ message: { message: 'Thanks for your inquiry' } }),
      }),
    )
  })

  it('sends replies to reservation bookings', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            id: 'message-2',
            type: 'message',
            attributes: { message: 'See you soon', sender: 'property' },
          },
        }),
        { status: 200 },
      ),
    )
    const client = createChannexClient({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/api/v1',
      fetchFn: fetchFn as typeof fetch,
    })

    await client.sendBookingMessage('booking/1', 'See you soon')

    expect(fetchFn).toHaveBeenCalledWith(
      'https://example.test/api/v1/bookings/booking%2F1/messages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ message: { message: 'See you soon' } }),
      }),
    )
  })
})

describe('Channex ARI client', () => {
  function jsonClient(payload: unknown) {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify(payload), { status: 200 }),
    )
    const client = createChannexClient({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/api/v1',
      fetchFn: fetchFn as typeof fetch,
    })
    return { fetchFn, client }
  }

  it('reads availability scoped to property and date range', async () => {
    const { fetchFn, client } = jsonClient({ data: { 'room-1': { '2026-08-01': 2 } } })
    const res = await client.getAvailability('prop-1', '2026-08-01', '2026-08-02')
    expect(res.data['room-1']?.['2026-08-01']).toBe(2)
    expect(fetchFn).toHaveBeenCalledWith(
      'https://example.test/api/v1/availability?filter[property_id]=prop-1&filter[date][gte]=2026-08-01&filter[date][lte]=2026-08-02',
      expect.anything(),
    )
  })

  it('reads restrictions with an explicit restriction field list', async () => {
    const { fetchFn, client } = jsonClient({
      data: { 'plan-1': { '2026-08-01': { rate: '200.00', stop_sell: false } } },
    })
    const res = await client.getRestrictions('prop-1', '2026-08-01', '2026-08-02', [
      'rate',
      'stop_sell',
    ])
    expect(res.data['plan-1']?.['2026-08-01']?.rate).toBe('200.00')
    expect(fetchFn).toHaveBeenCalledWith(
      'https://example.test/api/v1/restrictions?filter[property_id]=prop-1&filter[date][gte]=2026-08-01&filter[date][lte]=2026-08-02&filter[restrictions]=rate,stop_sell',
      expect.anything(),
    )
  })

  it('lists rate plans filtered by property', async () => {
    const { fetchFn, client } = jsonClient({ data: [] })
    await client.listRatePlans('prop-1')
    expect(fetchFn).toHaveBeenCalledWith(
      'https://example.test/api/v1/rate_plans?filter[property_id]=prop-1&pagination[page]=1&pagination[limit]=100',
      expect.anything(),
    )
  })
})
