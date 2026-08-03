/**
 * Drain booking_crs write intents (Offline / Booking CRS create).
 *
 * Resume-safe: accepted/reconciling/reconciled never blind re-POST.
 * Reconciliation to confirmed continues via booking revision pull (AE3).
 */
import type { AriWriteIntentRecord } from '@pms/domain'
import { getNetworkCapabilities } from '@pms/domain'
import type { ChannexClient } from '../channex/client'
import { ChannexApiError } from '../channex/client'
import type { ChannexCreateBookingInput } from '../channex/types'
import type { SyncStore } from '../store'

export type BookingCrsOutboxResult = {
  processed: number
  sent: number
  skipped: number
  failed: number
  retried: number
}

export type BookingCrsSendResult =
  | { ok: true; channexBookingId: string; reconciled: boolean; posted: boolean }
  | { ok: false; reason: string; posted: boolean }

/** Absolute CRS payload stored on the intent (+ local join keys). */
export type BookingCrsIntentPayload = ChannexCreateBookingInput & {
  _local?: { reservationId: number; roomTypeId: number }
  property_id: string | null
}

const SKIP_POST = new Set(['accepted', 'reconciling', 'reconciled'])
const SENDABLE = new Set(['queued', 'retry'])

function touch(intent: AriWriteIntentRecord) {
  intent.updatedAt = new Date().toISOString()
}

export function bookingCrsCreateBody(
  payload: BookingCrsIntentPayload,
  propertyChannexId: string,
): ChannexCreateBookingInput {
  return {
    property_id: propertyChannexId,
    ota_reservation_code: payload.ota_reservation_code,
    ota_name: 'Offline',
    arrival_date: payload.arrival_date,
    departure_date: payload.departure_date,
    currency: payload.currency,
    customer: payload.customer,
    rooms: payload.rooms,
  }
}

function findReservation(store: SyncStore, intent: AriWriteIntentRecord) {
  const localId = (intent.payload as BookingCrsIntentPayload)._local?.reservationId
  if (localId != null) {
    return store.domain.reservations.find((r) => r.id === localId) ?? null
  }
  const code = (intent.payload as BookingCrsIntentPayload).ota_reservation_code
  if (!code) return null
  return (
    store.domain.reservations.find(
      (r) => r.networkId === intent.networkId && r.otaReservationCode === code,
    ) ?? null
  )
}

function applyAcceptedToReservation(
  store: SyncStore,
  intent: AriWriteIntentRecord,
  bookingId: string,
  reconciled: boolean,
) {
  const reservation = findReservation(store, intent)
  if (!reservation) return
  reservation.channexBookingId = bookingId
  if (reconciled) {
    reservation.status = 'confirmed'
    reservation.pendingSyncReason = null
  } else {
    reservation.status = 'pending_sync'
    reservation.pendingSyncReason = 'awaiting_channex_revision'
  }
}

function resolvePropertyChannexId(
  store: SyncStore,
  networkId: number,
  intent: AriWriteIntentRecord,
): string | null {
  const payload = intent.payload as BookingCrsIntentPayload
  if (payload.property_id) return payload.property_id
  return (
    store.listProperties(networkId).find((p) => p.id === intent.propertyId)
      ?.channexId ?? null
  )
}

/**
 * Resume-safe create for one booking_crs intent.
 * Never re-POSTs when status is accepted/reconciling/reconciled.
 */
export async function sendOrResumeBookingCrsIntent(
  store: SyncStore,
  client: ChannexClient,
  intent: AriWriteIntentRecord,
  propertyChannexId: string,
): Promise<BookingCrsSendResult> {
  if (SKIP_POST.has(intent.status)) {
    const acceptedId =
      (typeof intent.channexTaskIds[0] === 'string'
        ? intent.channexTaskIds[0]
        : null) ?? findReservation(store, intent)?.channexBookingId ?? null
    if (acceptedId) {
      applyAcceptedToReservation(
        store,
        intent,
        acceptedId,
        intent.status === 'reconciled',
      )
      return {
        ok: true,
        channexBookingId: acceptedId,
        reconciled: intent.status === 'reconciled',
        posted: false,
      }
    }
    return { ok: false, reason: 'awaiting_channex_revision', posted: false }
  }

  if (!SENDABLE.has(intent.status)) {
    return { ok: false, reason: `intent_${intent.status}`, posted: false }
  }

  if (intent.nextAttemptAt && intent.nextAttemptAt > new Date().toISOString()) {
    return { ok: false, reason: 'retry_backoff', posted: false }
  }

  const payload = intent.payload as BookingCrsIntentPayload
  const bookingBody = bookingCrsCreateBody(payload, propertyChannexId)

  intent.status = 'sending'
  intent.attempts += 1
  touch(intent)

  try {
    const res = await client.createBooking(bookingBody)
    const bookingId = res.data.attributes.booking_id || res.data.id
    intent.status = 'accepted'
    intent.channexTaskIds = [bookingId]
    intent.lastError = null
    touch(intent)
    applyAcceptedToReservation(store, intent, bookingId, false)
    return {
      ok: true,
      channexBookingId: bookingId,
      reconciled: false,
      posted: true,
    }
  } catch (err) {
    const reason =
      err instanceof ChannexApiError
        ? `channex_${err.status}`
        : err instanceof Error
          ? err.message
          : 'channex_write_failed'
    // Unknown network outcome: leave retry so worker can resume; accepted
    // path above never blind re-POSTs. (ponytail: no GET-by-ota-code yet.)
    if (err instanceof ChannexApiError && err.status >= 500) {
      intent.status = 'retry'
      intent.nextAttemptAt = new Date(Date.now() + 60_000).toISOString()
    } else if (!(err instanceof ChannexApiError)) {
      intent.status = 'retry'
      intent.nextAttemptAt = new Date(Date.now() + 60_000).toISOString()
    } else {
      intent.status = 'failed'
    }
    intent.lastError = reason
    touch(intent)
    return { ok: false, reason, posted: true }
  }
}

/**
 * Drain queued/retry booking_crs intents for a network.
 * Accepted intents are counted as skipped (no POST); revision pull confirms.
 */
export async function processBookingCrsOutbox(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
): Promise<BookingCrsOutboxResult> {
  const result: BookingCrsOutboxResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    retried: 0,
  }

  if (!getNetworkCapabilities(store.domain, networkId).bookingCrsWrite) {
    return result
  }

  const intents = store.domain.ariWriteIntents.filter(
    (i) => i.networkId === networkId && i.lane === 'booking_crs',
  )

  for (const intent of intents) {
    if (SKIP_POST.has(intent.status)) {
      result.processed++
      const propertyChannexId =
        resolvePropertyChannexId(store, networkId, intent) ?? ''
      // Resume never POSTs; property id only needed if we had to send.
      await sendOrResumeBookingCrsIntent(
        store,
        client,
        intent,
        propertyChannexId,
      )
      result.skipped++
      continue
    }

    if (!SENDABLE.has(intent.status)) continue
    if (intent.nextAttemptAt && intent.nextAttemptAt > new Date().toISOString()) {
      continue
    }

    result.processed++
    const propertyChannexId = resolvePropertyChannexId(store, networkId, intent)
    if (!propertyChannexId) {
      intent.status = 'failed'
      intent.lastError = 'property_channex_id_missing'
      touch(intent)
      result.failed++
      continue
    }

    const outcome = await sendOrResumeBookingCrsIntent(
      store,
      client,
      intent,
      propertyChannexId,
    )
    if (outcome.ok && outcome.posted) {
      result.sent++
    } else if (outcome.ok) {
      result.skipped++
    } else if (intent.status === 'retry') {
      result.retried++
    } else if (intent.status === 'failed') {
      result.failed++
    } else {
      result.skipped++
    }
  }

  return result
}
