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
