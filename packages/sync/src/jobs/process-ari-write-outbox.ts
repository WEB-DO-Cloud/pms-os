/**
 * Drain ARI write-intent outbox lanes (availability, restrictions, rate_plan).
 *
 * Absolute payloads only. Restart-safe: accepted/reconciling/partial never blind re-POST.
 */
import type { AriWriteIntentRecord, AriWriteLane } from '@pms/domain'
import type { ChannexClient } from '../channex/client'
import { ChannexApiError } from '../channex/client'
import type {
  ChannexAvailabilityValue,
  ChannexRestrictionUpdateValue,
  ChannexRestrictionValues,
} from '../channex/types'
import { ARI_RESTRICTION_FIELDS, channexRateToMinor } from './pull-ari'
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

type RestrictionsPayload = {
  values: Array<{
    property_id: string | null
    rate_plan_id: string
    date?: string
    date_from?: string
    date_to?: string
    rate?: number
    min_stay_arrival?: number
    min_stay_through?: number
    max_stay?: number
    closed_to_arrival?: boolean
    closed_to_departure?: boolean
    stop_sell?: boolean
  }>
  _local?: {
    propertyChannexId?: string | null
    fields?: {
      rateMinor?: number
      minStayArrival?: number
      minStayThrough?: number
      maxStay?: number
      closedToArrival?: boolean
      closedToDeparture?: boolean
      stopSell?: boolean
    }
  }
}

type RatePlanPayload = {
  rate_plan: {
    options: Array<{
      occupancy: number
      is_primary: boolean
      derived_option: { rate: [string, string][] }
    }>
  }
  _local?: {
    propertyChannexId?: string | null
    ratePlanChannexId?: string
    occupancy?: number
  }
}

const RESUME_STATUSES = new Set([
  'accepted',
  'partial',
  'reconciling',
])

const SENDABLE = new Set(['queued', 'retry'])

const DEFAULT_LANES: AriWriteLane[] = [
  'availability',
  'restrictions',
  'rate_plan',
]

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
  data?: Array<{ id?: string } | string> | { id?: string }
  meta?: { task_id?: string }
}): string[] {
  const ids: string[] = []
  if (res.meta?.task_id) ids.push(res.meta.task_id)
  const data = res.data
  if (Array.isArray(data)) {
    for (const row of data) {
      if (typeof row === 'string') ids.push(row)
      else if (row?.id) ids.push(row.id)
    }
  } else if (data && typeof data === 'object' && 'id' in data && data.id) {
    ids.push(data.id)
  }
  return ids
}

function resolvePropertyChannexId(
  store: SyncStore,
  networkId: number,
  intent: AriWriteIntentRecord,
): string | null {
  const payload = intent.payload as {
    _local?: { propertyChannexId?: string | null }
    values?: Array<{ property_id?: string | null }>
  }
  const local = payload._local?.propertyChannexId
  if (local) return local
  const fromValue = payload.values?.[0]?.property_id
  if (fromValue) return fromValue
  return store.listProperties(networkId).find((p) => p.id === intent.propertyId)?.channexId ?? null
}

function touch(intent: AriWriteIntentRecord) {
  intent.updatedAt = new Date().toISOString()
}

function matchesRestrictionField(
  actual: ChannexRestrictionValues,
  fields: NonNullable<RestrictionsPayload['_local']>['fields'],
): boolean {
  if (!fields) return false
  if (fields.rateMinor !== undefined) {
    if (channexRateToMinor(actual.rate) !== fields.rateMinor) return false
  }
  if (
    fields.minStayArrival !== undefined &&
    actual.min_stay_arrival !== fields.minStayArrival
  ) {
    return false
  }
  if (
    fields.minStayThrough !== undefined &&
    actual.min_stay_through !== fields.minStayThrough
  ) {
    return false
  }
  if (fields.maxStay !== undefined && actual.max_stay !== fields.maxStay) {
    return false
  }
  if (
    fields.closedToArrival !== undefined &&
    actual.closed_to_arrival !== fields.closedToArrival
  ) {
    return false
  }
  if (
    fields.closedToDeparture !== undefined &&
    actual.closed_to_departure !== fields.closedToDeparture
  ) {
    return false
  }
  if (fields.stopSell !== undefined && actual.stop_sell !== fields.stopSell) {
    return false
  }
  return true
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
    const now = new Date().toISOString()
    const version = intent.baseSnapshotVersion ?? 0
    const roomTypeId =
      (intent.payload as AvailabilityPayload)._local?.roomTypeId ??
      store
        .listRoomTypes(networkId, intent.propertyId)
        .find((r) => r.channexId === scope.roomTypeChannexId)?.id
    for (const date of dates) {
      const existing = store.domain.ariAvailability.find(
        (a) =>
          a.networkId === networkId &&
          a.propertyId === intent.propertyId &&
          (roomTypeId != null
            ? a.roomTypeId === roomTypeId
            : (a as { roomTypeChannexId?: string }).roomTypeChannexId ===
              scope.roomTypeChannexId) &&
          a.date === date,
      )
      if (existing) {
        existing.availability = desired
        existing.pulledAt = now
      } else if (roomTypeId != null) {
        store.domain.ariAvailability.push({
          networkId,
          propertyId: intent.propertyId,
          roomTypeId,
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

async function reconcileRestrictions(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  intent: AriWriteIntentRecord,
  propertyChannexId: string,
): Promise<'reconciled' | 'drifted' | 'reconciling'> {
  const scope = intent.resourceScope
  const fields = (intent.payload as RestrictionsPayload)._local?.fields
  if (!scope?.ratePlanChannexId || !fields) {
    intent.status = 'failed'
    intent.lastError = 'missing_resource_scope_or_desired'
    touch(intent)
    return 'drifted'
  }

  intent.status = 'reconciling'
  touch(intent)

  const dates = eachDateInclusive(scope.dateFrom, scope.dateTo)
  const res = await client.getRestrictions(
    propertyChannexId,
    scope.dateFrom,
    scope.dateTo,
    ARI_RESTRICTION_FIELDS,
  )
  const byDate = res.data[scope.ratePlanChannexId] ?? {}
  let allMatch = true
  for (const date of dates) {
    if (!matchesRestrictionField(byDate[date] ?? {}, fields)) {
      allMatch = false
      break
    }
  }

  if (allMatch) {
    intent.status = 'reconciled'
    intent.reconciledAt = new Date().toISOString()
    intent.lastError = null
    touch(intent)
    const now = new Date().toISOString()
    const version = intent.baseSnapshotVersion ?? 0
    for (const date of dates) {
      const existing = store.domain.ariRestrictions.find(
        (r) =>
          r.networkId === networkId &&
          r.propertyId === intent.propertyId &&
          r.ratePlanChannexId === scope.ratePlanChannexId &&
          r.date === date,
      )
      const next = {
        rateMinor:
          fields.rateMinor !== undefined
            ? fields.rateMinor
            : (existing?.rateMinor ?? null),
        minStayArrival:
          fields.minStayArrival !== undefined
            ? fields.minStayArrival
            : (existing?.minStayArrival ?? null),
        minStayThrough:
          fields.minStayThrough !== undefined
            ? fields.minStayThrough
            : (existing?.minStayThrough ?? null),
        maxStay:
          fields.maxStay !== undefined
            ? fields.maxStay
            : (existing?.maxStay ?? null),
        closedToArrival:
          fields.closedToArrival !== undefined
            ? fields.closedToArrival
            : (existing?.closedToArrival ?? null),
        closedToDeparture:
          fields.closedToDeparture !== undefined
            ? fields.closedToDeparture
            : (existing?.closedToDeparture ?? null),
        stopSell:
          fields.stopSell !== undefined
            ? fields.stopSell
            : (existing?.stopSell ?? null),
      }
      if (existing) {
        Object.assign(existing, next)
        existing.pulledAt = now
      } else {
        store.domain.ariRestrictions.push({
          networkId,
          propertyId: intent.propertyId,
          ratePlanChannexId: scope.ratePlanChannexId,
          date,
          ...next,
          snapshotVersion: version,
          pulledAt: now,
        })
      }
    }
    return 'reconciled'
  }

  intent.status = 'drifted'
  intent.lastError = 'restrictions_mismatch_after_accept'
  touch(intent)
  return 'drifted'
}

function derivedOptionMatches(
  actual: unknown,
  desired: { rate: [string, string][] },
): boolean {
  const opts = actual as
    | {
        options?: Array<{
          occupancy?: number
          derived_option?: { rate?: [string, string][] }
        }>
      }
    | null
  if (!opts?.options?.length) return false
  return opts.options.some((o) => {
    const rate = o.derived_option?.rate
    if (!rate || rate.length !== desired.rate.length) return false
    return desired.rate.every(
      ([op, arg], i) => rate[i]?.[0] === op && rate[i]?.[1] === arg,
    )
  })
}

async function reconcileRatePlan(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  intent: AriWriteIntentRecord,
): Promise<'reconciled' | 'drifted' | 'reconciling'> {
  const scope = intent.resourceScope
  const payload = intent.payload as RatePlanPayload
  const desired = payload.rate_plan?.options?.[0]?.derived_option
  const ratePlanId =
    scope?.ratePlanChannexId ?? payload._local?.ratePlanChannexId
  if (!ratePlanId || !desired) {
    intent.status = 'failed'
    intent.lastError = 'missing_resource_scope_or_desired'
    touch(intent)
    return 'drifted'
  }

  intent.status = 'reconciling'
  touch(intent)

  const res = await client.getRatePlan(ratePlanId)
  const attrs = res.data?.attributes
  if (derivedOptionMatches(attrs, desired)) {
    intent.status = 'reconciled'
    intent.reconciledAt = new Date().toISOString()
    intent.lastError = null
    touch(intent)
    const plan = store.domain.ratePlans.find(
      (p) =>
        p.networkId === networkId &&
        p.propertyId === intent.propertyId &&
        p.channexId === ratePlanId,
    )
    if (plan) {
      plan.channexRaw = attrs
      plan.pulledAt = new Date().toISOString()
    }
    return 'reconciled'
  }

  intent.status = 'drifted'
  intent.lastError = 'rate_plan_mismatch_after_accept'
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
      : {
          date_from: v.date_from ?? intent.resourceScope?.dateFrom,
          date_to: v.date_to ?? intent.resourceScope?.dateTo,
        }),
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
      intent.status = 'partial'
      touch(intent)
      return 'partial'
    }

    intent.status = 'accepted'
    touch(intent)
    return 'accepted'
  } catch (err) {
    return handleSendError(intent, err)
  }
}

async function sendRestrictions(
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

  const payload = intent.payload as RestrictionsPayload
  const values: ChannexRestrictionUpdateValue[] = (payload.values ?? []).map(
    (v) => ({
      property_id: propertyChannexId,
      rate_plan_id: v.rate_plan_id,
      ...(v.date
        ? { date: v.date }
        : {
            date_from: v.date_from ?? intent.resourceScope?.dateFrom,
            date_to: v.date_to ?? intent.resourceScope?.dateTo,
          }),
      ...(v.rate !== undefined ? { rate: v.rate } : {}),
      ...(v.min_stay_arrival !== undefined
        ? { min_stay_arrival: v.min_stay_arrival }
        : {}),
      ...(v.min_stay_through !== undefined
        ? { min_stay_through: v.min_stay_through }
        : {}),
      ...(v.max_stay !== undefined ? { max_stay: v.max_stay } : {}),
      ...(v.closed_to_arrival !== undefined
        ? { closed_to_arrival: v.closed_to_arrival }
        : {}),
      ...(v.closed_to_departure !== undefined
        ? { closed_to_departure: v.closed_to_departure }
        : {}),
      ...(v.stop_sell !== undefined ? { stop_sell: v.stop_sell } : {}),
    }),
  )

  intent.status = 'sending'
  intent.attempts += 1
  touch(intent)

  try {
    const res = await client.updateRestrictions(values)
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
    return handleSendError(intent, err)
  }
}

async function sendRatePlan(
  _store: SyncStore,
  client: ChannexClient,
  _networkId: number,
  intent: AriWriteIntentRecord,
): Promise<'accepted' | 'partial' | 'retry' | 'failed' | 'skipped'> {
  const payload = intent.payload as RatePlanPayload
  const ratePlanId =
    intent.resourceScope?.ratePlanChannexId ??
    payload._local?.ratePlanChannexId
  if (!ratePlanId || !payload.rate_plan) {
    intent.status = 'failed'
    intent.lastError = 'rate_plan_id_missing'
    touch(intent)
    return 'failed'
  }

  intent.status = 'sending'
  intent.attempts += 1
  touch(intent)

  try {
    const res = await client.updateRatePlan(ratePlanId, payload.rate_plan)
    intent.channexTaskIds = extractTaskIds(res)
    intent.warnings = []
    intent.lastError = null
    intent.status = 'accepted'
    touch(intent)
    return 'accepted'
  } catch (err) {
    return handleSendError(intent, err)
  }
}

function handleSendError(
  intent: AriWriteIntentRecord,
  err: unknown,
): 'retry' | 'failed' {
  const reason =
    err instanceof ChannexApiError
      ? `channex_${err.status}`
      : err instanceof Error
        ? err.message
        : 'channex_write_failed'
  intent.lastError = reason
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

/**
 * Select the latest sendable intent per property+resource key;
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
    const resource =
      intent.resourceScope?.ratePlanChannexId ??
      intent.resourceScope?.roomTypeChannexId ??
      ''
    const key = `${intent.lane}:${intent.propertyId}:${resource}`
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

async function reconcileLane(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  intent: AriWriteIntentRecord,
  propertyChannexId: string,
): Promise<'reconciled' | 'drifted' | 'reconciling'> {
  if (intent.lane === 'availability') {
    return reconcileAvailability(store, client, networkId, intent, propertyChannexId)
  }
  if (intent.lane === 'restrictions') {
    return reconcileRestrictions(store, client, networkId, intent, propertyChannexId)
  }
  if (intent.lane === 'rate_plan') {
    return reconcileRatePlan(store, client, networkId, intent)
  }
  return 'drifted'
}

async function sendLane(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  intent: AriWriteIntentRecord,
): Promise<'accepted' | 'partial' | 'retry' | 'failed' | 'skipped'> {
  if (intent.lane === 'availability') {
    return sendAvailability(store, client, networkId, intent)
  }
  if (intent.lane === 'restrictions') {
    return sendRestrictions(store, client, networkId, intent)
  }
  if (intent.lane === 'rate_plan') {
    return sendRatePlan(store, client, networkId, intent)
  }
  return 'skipped'
}

export async function processAriWriteOutbox(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  opts?: { lanes?: AriWriteLane[] },
): Promise<AriWriteOutboxResult> {
  const lanes = new Set(opts?.lanes ?? DEFAULT_LANES)
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
    if (
      intent.lane !== 'availability' &&
      intent.lane !== 'restrictions' &&
      intent.lane !== 'rate_plan'
    ) {
      continue
    }
    result.processed++
    const propertyChannexId = resolvePropertyChannexId(store, networkId, intent)
    if (!propertyChannexId && intent.lane !== 'rate_plan') {
      intent.status = 'failed'
      intent.lastError = 'property_channex_id_missing'
      touch(intent)
      result.failed++
      continue
    }
    try {
      const outcome = await reconcileLane(
        store,
        client,
        networkId,
        intent,
        propertyChannexId ?? '',
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
      if (
        intent.lane !== 'availability' &&
        intent.lane !== 'restrictions' &&
        intent.lane !== 'rate_plan'
      ) {
        result.skipped++
        continue
      }
      result.processed++
      const sendOutcome = await sendLane(store, client, networkId, intent)
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
        result.partial++
        continue
      }

      const propertyChannexId = resolvePropertyChannexId(store, networkId, intent)
      if (!propertyChannexId && intent.lane !== 'rate_plan') {
        result.failed++
        continue
      }
      try {
        const outcome = await reconcileLane(
          store,
          client,
          networkId,
          intent,
          propertyChannexId ?? '',
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
