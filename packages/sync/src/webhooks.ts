import { createHash, timingSafeEqual } from 'node:crypto'
import type { ChannexWebhookPayload } from './channex/types'
import { resolveSecret } from './secrets'
import type { SyncStore } from './store'

export type WebhookVerifyResult =
  | { ok: true; networkId: number; deliveryKey: string; payload: ChannexWebhookPayload }
  | { ok: false; code: string; message: string }

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export function webhookDeliveryKey(
  networkId: number,
  payload: ChannexWebhookPayload,
  rawBody: string,
): string {
  const id =
    payload.payload?.booking_revision_id ??
    payload.payload?.booking_id ??
    createHash('sha256').update(rawBody).digest('hex').slice(0, 32)
  return `${networkId}:${payload.event}:${id}:${payload.timestamp ?? ''}`
}

export function verifyChannexWebhook(
  store: SyncStore,
  networkId: number,
  secretHeader: string | undefined,
  rawBody: string,
): WebhookVerifyResult {
  const secretRow = store.getSecret(networkId, 'channex_webhook_secret')
  if (!secretRow) {
    return { ok: false, code: 'NO_SECRET', message: 'Webhook secret not configured' }
  }
  const expected = resolveSecret(secretRow)
  if (!secretHeader || !safeEqual(secretHeader, expected)) {
    return { ok: false, code: 'INVALID_SECRET', message: 'Invalid webhook secret' }
  }

  let payload: ChannexWebhookPayload
  try {
    payload = JSON.parse(rawBody) as ChannexWebhookPayload
  } catch {
    return { ok: false, code: 'INVALID_PAYLOAD', message: 'Invalid JSON body' }
  }

  const deliveryKey = webhookDeliveryKey(networkId, payload, rawBody)
  if (!store.claimWebhookDelivery(networkId, deliveryKey)) {
    return { ok: false, code: 'DUPLICATE', message: 'Replayed webhook delivery' }
  }

  return { ok: true, networkId, deliveryKey, payload }
}

export type WebhookHandleResult =
  | { status: 'queued'; revisionId: string }
  | { status: 'ignored'; reason: string }
  | { status: 'error'; code: string; message: string }

export function extractRevisionIdFromWebhook(
  payload: ChannexWebhookPayload,
): string | null {
  return payload.payload?.booking_revision_id ?? null
}
