/**
 * Bounded nightly ARI drift detection — detect and report only.
 *
 * Compares local availability/restriction projection to a targeted Channex GET
 * for sampled dates. Never POSTs corrective writes. Skips dates covered by
 * unresolved staff intents so open desired-state work is not overwritten.
 *
 * ponytail: samples first N room-type/date cells per property (default 14 days
 * from today × all rooms) — upgrade to stratified sampling / cursor when catalogs grow.
 */
import type { AriWriteIntentRecord } from '@pms/domain'
import type { ChannexClient } from '../channex/client'
import type { SyncStore } from '../store'
import { ARI_RESTRICTION_FIELDS, channexRateToMinor } from './pull-ari'

const LEASE_TTL_MS = 300_000
const OPEN_INTENT_STATUSES = new Set([
  'queued',
  'sending',
  'accepted',
  'partial',
  'retry',
  'reconciling',
])

export type AriDriftRecord = {
  networkId: number
  propertyId: number
  kind: 'availability' | 'restrictions'
  roomTypeId?: number
  roomTypeChannexId?: string
  ratePlanChannexId?: string
  date: string
  projected: number | boolean | string | null
  remote: number | boolean | string | null
  field?: string
}

export type AriDriftDetectResult =
  | { skipped: true; reason: 'lease' | 'no_properties' }
  | {
      skipped: false
      sampledAvailability: number
      sampledRestrictions: number
      skippedOpenIntentDates: number
      drifts: AriDriftRecord[]
    }

function isoDatePlusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

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

/** True when an open staff intent covers this property + date (+ optional resource). */
export function dateHasOpenStaffIntent(
  intents: AriWriteIntentRecord[],
  opts: {
    networkId: number
    propertyId: number
    date: string
    roomTypeChannexId?: string
    ratePlanChannexId?: string
    lane?: 'availability' | 'restrictions'
  },
): boolean {
  return intents.some((i) => {
    if (i.networkId !== opts.networkId || i.propertyId !== opts.propertyId) return false
    if (!OPEN_INTENT_STATUSES.has(i.status)) return false
    if (opts.lane && i.lane !== opts.lane) return false
    const scope = i.resourceScope
    if (!scope) return true
    if (opts.date < scope.dateFrom || opts.date > scope.dateTo) return false
    if (
      opts.roomTypeChannexId &&
      scope.roomTypeChannexId &&
      scope.roomTypeChannexId !== opts.roomTypeChannexId
    ) {
      return false
    }
    if (
      opts.ratePlanChannexId &&
      scope.ratePlanChannexId &&
      scope.ratePlanChannexId !== opts.ratePlanChannexId
    ) {
      return false
    }
    return true
  })
}

/**
 * Detect projection vs Channex drift for a network. Detect-only: no updates,
 * no compensation enqueue, no intent status mutation.
 */
export async function detectAriDrift(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  holder: string,
  opts?: {
    propertyId?: number
    dateFrom?: string
    /** Inclusive end; default dateFrom + sampleDays - 1 */
    dateTo?: string
    sampleDays?: number
  },
): Promise<AriDriftDetectResult> {
  if (!store.tryAcquireLease(networkId, 'detect_ari_drift', holder, LEASE_TTL_MS)) {
    return { skipped: true, reason: 'lease' }
  }
  try {
    const today = new Date().toISOString().slice(0, 10)
    const sampleDays = opts?.sampleDays ?? 14
    const dateFrom = opts?.dateFrom ?? today
    const dateTo = opts?.dateTo ?? isoDatePlusDays(dateFrom, sampleDays - 1)
    const sampleDates = new Set(eachDateInclusive(dateFrom, dateTo))

    const properties = store
      .listProperties(networkId)
      .filter((p) => opts?.propertyId == null || p.id === opts.propertyId)
    if (properties.length === 0) {
      return { skipped: true, reason: 'no_properties' }
    }

    const intents = store.domain.ariWriteIntents.filter((i) => i.networkId === networkId)
    const drifts: AriDriftRecord[] = []
    let sampledAvailability = 0
    let sampledRestrictions = 0
    let skippedOpenIntentDates = 0

    for (const property of properties) {
      const rooms = store.listRoomTypes(networkId, property.id)
      const roomsByChannexId = new Map(rooms.map((r) => [r.channexId, r]))

      if (rooms.length > 0) {
        const avail = await client.getAvailability(property.channexId, dateFrom, dateTo)
        for (const [roomChannexId, byDate] of Object.entries(avail.data ?? {})) {
          const room = roomsByChannexId.get(roomChannexId)
          if (!room) continue
          for (const [date, remote] of Object.entries(byDate)) {
            if (!sampleDates.has(date)) continue
            if (
              dateHasOpenStaffIntent(intents, {
                networkId,
                propertyId: property.id,
                date,
                roomTypeChannexId: roomChannexId,
                lane: 'availability',
              })
            ) {
              skippedOpenIntentDates++
              continue
            }
            const projected = store.domain.ariAvailability.find(
              (a) =>
                a.networkId === networkId &&
                a.propertyId === property.id &&
                a.roomTypeId === room.id &&
                a.date === date,
            )
            // No local row yet → skip (pull will populate); only report mismatches.
            if (!projected) continue
            sampledAvailability++
            if (projected.availability !== remote) {
              drifts.push({
                networkId,
                propertyId: property.id,
                kind: 'availability',
                roomTypeId: room.id,
                roomTypeChannexId: roomChannexId,
                date,
                projected: projected.availability,
                remote,
              })
            }
          }
        }
      }

      const restr = await client.getRestrictions(
        property.channexId,
        dateFrom,
        dateTo,
        ARI_RESTRICTION_FIELDS,
      )
      for (const [planId, byDate] of Object.entries(restr.data ?? {})) {
        for (const [date, values] of Object.entries(byDate)) {
          if (!sampleDates.has(date)) continue
          if (
            dateHasOpenStaffIntent(intents, {
              networkId,
              propertyId: property.id,
              date,
              ratePlanChannexId: planId,
              lane: 'restrictions',
            })
          ) {
            skippedOpenIntentDates++
            continue
          }
          const projected = store.domain.ariRestrictions.find(
            (r) =>
              r.networkId === networkId &&
              r.propertyId === property.id &&
              r.ratePlanChannexId === planId &&
              r.date === date,
          )
          if (!projected) continue
          sampledRestrictions++
          const remoteRate = channexRateToMinor(values.rate)
          if (projected.rateMinor != null && remoteRate != null && projected.rateMinor !== remoteRate) {
            drifts.push({
              networkId,
              propertyId: property.id,
              kind: 'restrictions',
              ratePlanChannexId: planId,
              date,
              field: 'rate',
              projected: projected.rateMinor,
              remote: remoteRate,
            })
          }
          const pairs: Array<[string, number | boolean | null | undefined, number | boolean | null | undefined]> = [
            ['min_stay_arrival', projected.minStayArrival, values.min_stay_arrival],
            ['min_stay_through', projected.minStayThrough, values.min_stay_through],
            ['max_stay', projected.maxStay, values.max_stay],
            ['closed_to_arrival', projected.closedToArrival, values.closed_to_arrival],
            ['closed_to_departure', projected.closedToDeparture, values.closed_to_departure],
            ['stop_sell', projected.stopSell, values.stop_sell],
          ]
          for (const [field, proj, rem] of pairs) {
            if (proj == null || rem == null) continue
            if (proj !== rem) {
              drifts.push({
                networkId,
                propertyId: property.id,
                kind: 'restrictions',
                ratePlanChannexId: planId,
                date,
                field,
                projected: proj,
                remote: rem,
              })
            }
          }
        }
      }
    }

    return {
      skipped: false,
      sampledAvailability,
      sampledRestrictions,
      skippedOpenIntentDates,
      drifts,
    }
  } finally {
    store.releaseLease(networkId, 'detect_ari_drift', holder)
  }
}
