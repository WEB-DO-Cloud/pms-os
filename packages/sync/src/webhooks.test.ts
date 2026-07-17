import { describe, expect, it } from 'vitest'
import {
  extractRevisionIdFromWebhook,
  verifyChannexWebhook,
  webhookDeliveryKey,
} from './webhooks'
import { createMemorySyncStore } from './store'
import { FIXTURE_NETWORK_ID } from './fixtures/channex'

describe('webhook auth and dedupe', () => {
  it('rejects missing or invalid secrets', () => {
    const store = createMemorySyncStore()
    store.setSecret(FIXTURE_NETWORK_ID, 'channex_webhook_secret', 'whsec-test')

    const body = JSON.stringify({
      event: 'booking_revision',
      payload: { booking_revision_id: 'rev-1' },
      timestamp: '2026-07-16T12:00:00Z',
    })

    expect(verifyChannexWebhook(store, FIXTURE_NETWORK_ID, undefined, body).ok).toBe(false)
    expect(
      verifyChannexWebhook(store, FIXTURE_NETWORK_ID, 'wrong', body).ok,
    ).toBe(false)
  })

  it('accepts valid secret and dedupes replays', () => {
    const store = createMemorySyncStore()
    store.setSecret(FIXTURE_NETWORK_ID, 'channex_webhook_secret', 'whsec-test')

    const body = JSON.stringify({
      event: 'booking_revision',
      payload: { booking_revision_id: 'rev-1' },
      timestamp: '2026-07-16T12:00:00Z',
    })

    const first = verifyChannexWebhook(store, FIXTURE_NETWORK_ID, 'whsec-test', body)
    expect(first.ok).toBe(true)
    if (first.ok) {
      expect(extractRevisionIdFromWebhook(first.payload)).toBe('rev-1')
    }

    const replay = verifyChannexWebhook(store, FIXTURE_NETWORK_ID, 'whsec-test', body)
    expect(replay.ok).toBe(false)
    if (!replay.ok) expect(replay.code).toBe('DUPLICATE')
  })

  it('delivery key is stable per event', () => {
    const payload = {
      event: 'booking_revision',
      payload: { booking_revision_id: 'rev-9' },
      timestamp: 't1',
    }
    const key = webhookDeliveryKey(FIXTURE_NETWORK_ID, payload, '{}')
    expect(key).toContain('rev-9')
  })
})
