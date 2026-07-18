/**
 * Drain ARI write-intent outbox lanes (availability first; U7 adds restrictions/rate_plan).
 *
 * Absolute payloads only. Restart-safe: accepted/reconciling/partial never blind re-POST.
 */
import type { AriWriteIntentRecord, AriWriteLane } from '@pms/domain'
import type { ChannexClient } from '../channex/client'
import { ChannexApiError } from '../channex/client'
import type { ChannexAvailabilityValue } from '../channex/types'
import { markSyncFailed, markSyncHealthy } from '../sync-health'
import type { SyncStore } from '../store'

export type AriWriteOutboxResult = {
  processed: number
  sent: number
  reconciled: number
  partial: number
  drifted: number
  failed: number
  skipped: number
  retried: number
}

type AvailabilityPayload = {
  values: Array<{
    property_id: string | null
    room_type_id: string
    date?: string
    date_from?: string
    date_to?: string
    availability: number
  }>
  _local?: { roomTypeId?: number; propertyChannexId?: string | null }
}

const RESUME_STATUSES = new Set([
  'accepted',
  'partial',
  'reconciling',
])

const SENDABLE = new Set(['queued', 'retry'])

function eachDateInclusive(from: string, to: string): string[] {
  const dates: string[] = []
  const cursor = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function desiredAvailability(intent: AriWriteIntentRecord): number | null {
  const payload = intent.payload as AvailabilityPayload
  const v = payload?.values?.[0]?.availability
  return typeof v === 'number' && Number.isInteger(v) ? v : null
}

function extractTaskIds(res: {
  data?: Array<{ id?: string } | string>
  meta?: { task_id?: string }
}): string[] {
  const ids: string[] = []
  if (res.meta?.task_id) ids.push(res.meta.task_id)
  for (const row of res.data ?? []) {
    if (typeof row === 'string') ids.push(row)
    else if (row?.id) ids.push(row.id)
  }
  return ids
}

function resolvePropertyChannexId(
  store: SyncStore,
  networkId: number,
  intent: AriWriteIntentRecord,
): string | null {
  const local = (intent.payload as AvailabilityPayload)._local?.propertyChannexId
  if (local) return local
  const fromValue = (intent.payload as AvailabilityPayload).values?.[0]?.property_id
  if (fromValue) return fromValue
  return store.listProperties(networkId).find((p) => p.id === intent.propertyId)?.channexId ?? null
}

function touch(intent: AriWriteIntentRecord) {
  intent.updatedAt = new Date().toISOString()
}

async function reconcileAvailability(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  intent: AriWriteIntentRecord,
  propertyChannexId: string,
): Promise<'reconciled' | 'drifted' | 'reconciling'> {
  const scope = intent.resourceScope
  const desired = desiredAvailability(intent)
  if (!scope?.roomTypeChannexId || desired == null) {
    intent.status = 'failed'
    intent.lastError = 'missing_resource_scope_or_desired'
    touch(intent)
    return 'drifted'
  }

  intent.status = 'reconciling'
  touch(intent)

  const dates = eachDateInclusive(scope.dateFrom, scope.dateTo)
  const res = await client.getAvailability(
    propertyChannexId,
    scope.dateFrom,
    scope.dateTo,
  )
  const byDate = res.data[scope.roomTypeChannexId] ?? {}
  let allMatch = true
  for (const date of dates) {
    if (byDate[date] !== desired) {
      allMatch = false
      break
    }
  }

  if (allMatch) {
    intent.status = 'reconciled'
    intent.reconciledAt = new Date().toISOString()
    intent.lastError = null
    touch(intent)
    // Best-effort: bump local projection to the reconciled absolute value.
    const now = new Date().toISOString()
    const version = intent.baseSnapshotVersion ?? 0
    for (const date of dates) {
      const existing = store.domain.ariAvailability.find(
        (a) =>
          a.networkId === networkId &&
          a.propertyId === intent.propertyId &&
          a.roomTypeChannexId === scope.roomTypeChannexId &&
          a.date === date,
      )
      if (existing) {
        existing.availability = desired
        existing.pulledAt = now
      } else {
        store.domain.ariAvailability.push({
          networkId,
          propertyId: intent.propertyId,
          roomTypeChannexId: scope.roomTypeChannexId,
          date,
          availability: desired,
          snapshotVersion: version,
          pulledAt: now,
        })
      }
    }
    return 'reconciled'
  }

  // ponytail: single GET attempt per tick — upgrade to retry budget / backoff table.
  intent.status = 'drifted'
  intent.lastError = 'availability_mismatch_after_accept'
  touch(intent)
  return 'drifted'
}

async function sendAvailability(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  intent: AriWriteIntentRecord,
): Promise<'accepted' | 'partial' | 'retry' | 'failed' | 'skipped'> {
  const propertyChannexId = resolvePropertyChannexId(store, networkId, intent)
  if (!propertyChannexId) {
    intent.status = 'failed'
    intent.lastError = 'property_channex_id_missing'
    touch(intent)
    return 'failed'
  }

  const payload = intent.payload as AvailabilityPayload
  const values: ChannexAvailabilityValue[] = (payload.values ?? []).map((v) => ({
    property_id: propertyChannexId,
    room_type_id: v.room_type_id,
    ...(v.date
      ? { date: v.date }
      : { date_from: v.date_from ?? intent.resourceScope?.dateFrom, date_to: v.date_to ?? intent.resourceScope?.dateTo }),
    availability: v.availability,
  }))

  intent.status = 'sending'
  intent.attempts += 1
  touch(intent)

  try {
    const res = await client.updateAvailability(values)
    const warnings = res.meta?.warnings ?? []
    intent.channexTaskIds = extractTaskIds(res)
    intent.warnings = warnings
    intent.lastError = null

    if (warnings.length > 0) {
      // AE4: HTTP success with warnings is partial, not batch success.
      intent.status = 'partial'
      touch(intent)
      return 'partial'
    }

    intent.status = 'accepted'
    touch(intent)
    return 'accepted'
  } catch (err) {
    const reason =
      err instanceof ChannexApiError
        ? `channex_${err.status}`
        : err instanceof Error
          ? err.message
          : 'channex_write_failed'
    intent.lastError = reason
    // Unknown / 5xx / 429: retry without assuming accept (absolute payload is safe to replay).
    if (
      !(err instanceof ChannexApiError) ||
      err.status >= 500 ||
      err.status === 429
    ) {
      intent.status = 'retry'
      intent.nextAttemptAt = new Date(Date.now() + 60_000).toISOString()
      touch(intent)
      return 'retry'
    }
    intent.status = 'failed'
    touch(intent)
    return 'failed'
  }
}

/**
 * Select the latest sendable intent per property+roomType+overlapping scope;
 * older queued siblings are cancelled before send (defense in depth after command coalesce).
 */
function pickSendableByProperty(
  intents: AriWriteIntentRecord[],
): AriWriteIntentRecord[] {
  const byKey = new Map<string, AriWriteIntentRecord[]>()
  for (const intent of intents) {
    if (!SENDABLE.has(intent.status)) continue
    if (intent.nextAttemptAt && intent.nextAttemptAt > new Date().toISOString()) {
      continue
    }
    const key = `${intent.propertyId}:${intent.resourceScope?.roomTypeChannexId ?? ''}`
    const list = byKey.get(key) ?? []
    list.push(intent)
    byKey.set(key, list)
  }
  const picked: AriWriteIntentRecord[] = []
  for (const list of byKey.values()) {
    list.sort((a, b) => a.id - b.id)
    const latest = list[list.length - 1]!
    for (const older of list.slice(0, -1)) {
      older.status = 'cancelled'
      touch(older)
    }
    picked.push(latest)
  }
  return picked
}

export async function processAriWriteOutbox(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  opts?: { lanes?: AriWriteLane[] },
): Promise<AriWriteOutboxResult> {
  const lanes = new Set(opts?.lanes ?? (['availability'] as AriWriteLane[]))
  const result: AriWriteOutboxResult = {
    processed: 0,
    sent: 0,
    reconciled: 0,
    partial: 0,
    drifted: 0,
    failed: 0,
    skipped: 0,
    retried: 0,
  }

  const networkIntents = store.domain.ariWriteIntents.filter(
    (i) => i.networkId === networkId && lanes.has(i.lane),
  )

  // Resume reconcile-only paths first (never re-POST).
  for (const intent of networkIntents) {
    if (!RESUME_STATUSES.has(intent.status)) continue
    if (intent.lane !== 'availability') continue
    result.processed++
    const propertyChannexId = resolvePropertyChannexId(store, networkId, intent)
    if (!propertyChannexId) {
      intent.status = 'failed'
      intent.lastError = 'property_channex_id_missing'
      touch(intent)
      result.failed++
      continue
    }
    try {
      const outcome = await reconcileAvailability(
        store,
        client,
        networkId,
        intent,
        propertyChannexId,
      )
      if (outcome === 'reconciled') result.reconciled++
      else if (outcome === 'drifted') result.drifted++
    } catch (err) {
      intent.status = 'retry'
      intent.lastError = err instanceof Error ? err.message : 'reconcile_failed'
      intent.nextAttemptAt = new Date(Date.now() + 60_000).toISOString()
      touch(intent)
      result.retried++
    }
  }

  // ponytail: sequential per property — Channex 10 req/min/property ceiling; upgrade to token bucket.
  const propertyIds = [
    ...new Set(
      networkIntents.filter((i) => SENDABLE.has(i.status)).map((i) => i.propertyId),
    ),
  ].sort((a, b) => a - b)

  for (const propertyId of propertyIds) {
    const propertyIntents = networkIntents.filter((i) => i.propertyId === propertyId)
    const toSend = pickSendableByProperty(propertyIntents)

    for (const intent of toSend) {
      if (intent.lane !== 'availability') {
        result.skipped++
        continue
      }
      result.processed++
      const sendOutcome = await sendAvailability(store, client, networkId, intent)
      if (sendOutcome === 'failed') {
        result.failed++
        continue
      }
      if (sendOutcome === 'retry') {
        result.retried++
        continue
      }
      if (sendOutcome === 'skipped') {
        result.skipped++
        continue
      }
      result.sent++
      if (sendOutcome === 'partial') {
        // AE4: keep partial visible; do not auto-promote to reconciled this tick.
        result.partial++
        continue
      }

      const propertyChannexId = resolvePropertyChannexId(store, networkId, intent)
      if (!propertyChannexId) {
        result.failed++
        continue
      }
      try {
        const outcome = await reconcileAvailability(
          store,
          client,
          networkId,
          intent,
          propertyChannexId,
        )
        if (outcome === 'reconciled') result.reconciled++
        else if (outcome === 'drifted') result.drifted++
      } catch (err) {
        intent.status = 'accepted'
        intent.lastError = err instanceof Error ? err.message : 'reconcile_failed'
        touch(intent)
        result.retried++
      }
    }
  }

  if (result.failed > 0) {
    markSyncFailed(
      store,
      networkId,
      'ari_write_failed',
      `${result.failed} ARI write intent(s) failed`,
    )
  } else if (result.sent > 0 || result.reconciled > 0) {
    markSyncHealthy(store, networkId, {})
  }

  return result
}
