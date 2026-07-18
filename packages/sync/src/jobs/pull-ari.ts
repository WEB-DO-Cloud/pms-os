import type {
  AriAvailabilityRecord,
  AriRestrictionRecord,
  RatePlanRecord,
} from '@pms/domain'
import type { ChannexClient } from '../channex/client'
import type { ChannexRestrictionValues } from '../channex/types'
import type { SyncStore } from '../store'

const LEASE_TTL_MS = 120_000

/** Default pull window; calendar surfaces never look further out today. */
const DEFAULT_HORIZON_DAYS = 90

export const ARI_RESTRICTION_FIELDS = [
  'rate',
  'min_stay_arrival',
  'min_stay_through',
  'max_stay',
  'closed_to_arrival',
  'closed_to_departure',
  'stop_sell',
] as const

export type AriPullResult =
  | { skipped: true; reason: 'lease' }
  | {
      skipped: false
      properties: number
      /** Projection rows created or value-updated in this pull. */
      changed: number
      /** Highest reconciled snapshot version after this pull. */
      snapshotVersion: number
      degraded: { propertyId: number; reason: 'no_room_types' | 'no_rate_plans' }[]
    }

/** Channex returns decimal strings ("200.00"); integers are already cents. */
export function channexRateToMinor(
  value: string | number | null | undefined,
): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Math.round(value)
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null
}

function isoDatePlusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Pull Channex ARI (room-type availability + rate-plan restrictions) for every
 * local property into the domain projection with a monotonic snapshot version.
 * Unchanged values never bump the version, so stale-write checks see no false
 * drift. Master-key data outside the local catalog is dropped.
 *
 * ponytail: 2 GETs + 1 rate-plan list per property per pull, single page each —
 * upgrade path is per-property cursors and pagination when catalogs outgrow 100.
 */
export async function runAriPull(
  store: SyncStore,
  client: ChannexClient,
  networkId: number,
  holder: string,
  opts?: { propertyId?: number; dateFrom?: string; dateTo?: string },
): Promise<AriPullResult> {
  if (!store.tryAcquireLease(networkId, 'pull_ari', holder, LEASE_TTL_MS)) {
    return { skipped: true, reason: 'lease' }
  }
  try {
    const today = new Date().toISOString().slice(0, 10)
    const dateFrom = opts?.dateFrom ?? today
    const dateTo = opts?.dateTo ?? isoDatePlusDays(dateFrom, DEFAULT_HORIZON_DAYS)
    const pulledAt = new Date().toISOString()
    const domain = store.domain

    let maxVersion = 0
    for (const row of domain.ariAvailability) {
      if (row.networkId === networkId && row.snapshotVersion > maxVersion) {
        maxVersion = row.snapshotVersion
      }
    }
    for (const row of domain.ariRestrictions) {
      if (row.networkId === networkId && row.snapshotVersion > maxVersion) {
        maxVersion = row.snapshotVersion
      }
    }
    const candidateVersion = maxVersion + 1

    const properties = store
      .listProperties(networkId)
      .filter((p) => opts?.propertyId == null || p.id === opts.propertyId)

    let changed = 0
    const degraded: { propertyId: number; reason: 'no_room_types' | 'no_rate_plans' }[] = []

    for (const property of properties) {
      const roomsByChannexId = new Map(
        store.listRoomTypes(networkId, property.id).map((r) => [r.channexId, r]),
      )
      if (roomsByChannexId.size === 0) {
        degraded.push({ propertyId: property.id, reason: 'no_room_types' })
      } else {
        const avail = await client.getAvailability(property.channexId, dateFrom, dateTo)
        for (const [roomChannexId, byDate] of Object.entries(avail.data ?? {})) {
          const room = roomsByChannexId.get(roomChannexId)
          // Master key sees every tenant's rooms — only project ours.
          if (!room) continue
          for (const [date, availability] of Object.entries(byDate)) {
            const existing = domain.ariAvailability.find(
              (a) => a.roomTypeId === room.id && a.date === date,
            )
            if (existing) {
              existing.pulledAt = pulledAt
              if (existing.availability !== availability) {
                existing.availability = availability
                existing.snapshotVersion = candidateVersion
                changed++
              }
            } else {
              const record: AriAvailabilityRecord = {
                networkId,
                propertyId: property.id,
                roomTypeId: room.id,
                date,
                availability,
                snapshotVersion: candidateVersion,
                pulledAt,
              }
              domain.ariAvailability.push(record)
              changed++
            }
          }
        }
      }

      const plansRes = await client.listRatePlans(property.channexId)
      const plans = plansRes.data ?? []
      if (plans.length === 0) {
        degraded.push({ propertyId: property.id, reason: 'no_rate_plans' })
        continue
      }
      const planIds = new Set(plans.map((p) => p.id))
      // Replace the catalog rows for this property; plans are Channex-owned.
      for (let i = domain.ratePlans.length - 1; i >= 0; i--) {
        if (domain.ratePlans[i]!.propertyId === property.id) domain.ratePlans.splice(i, 1)
      }
      for (const plan of plans) {
        const record: RatePlanRecord = {
          networkId,
          propertyId: property.id,
          channexId: plan.id,
          roomTypeChannexId: plan.attributes.room_type_id ?? null,
          title: plan.attributes.title,
          currency: plan.attributes.currency ?? property.currency ?? null,
          parentRatePlanChannexId: plan.attributes.parent_rate_plan_id ?? null,
          channexRaw: plan.attributes,
          pulledAt,
        }
        domain.ratePlans.push(record)
      }

      const restr = await client.getRestrictions(
        property.channexId,
        dateFrom,
        dateTo,
        ARI_RESTRICTION_FIELDS,
      )
      for (const [planChannexId, byDate] of Object.entries(restr.data ?? {})) {
        // Only ingest plans confirmed to belong to this property.
        if (!planIds.has(planChannexId)) continue
        for (const [date, values] of Object.entries(byDate)) {
          upsertRestriction(
            domain.ariRestrictions,
            networkId,
            property.id,
            planChannexId,
            date,
            values,
            candidateVersion,
            pulledAt,
            () => changed++,
          )
        }
      }
    }

    let snapshotVersion = 0
    for (const row of domain.ariAvailability) {
      if (row.networkId === networkId && row.snapshotVersion > snapshotVersion) {
        snapshotVersion = row.snapshotVersion
      }
    }
    for (const row of domain.ariRestrictions) {
      if (row.networkId === networkId && row.snapshotVersion > snapshotVersion) {
        snapshotVersion = row.snapshotVersion
      }
    }

    return { skipped: false, properties: properties.length, changed, snapshotVersion, degraded }
  } finally {
    store.releaseLease(networkId, 'pull_ari', holder)
  }
}

function upsertRestriction(
  rows: AriRestrictionRecord[],
  networkId: number,
  propertyId: number,
  ratePlanChannexId: string,
  date: string,
  values: ChannexRestrictionValues,
  candidateVersion: number,
  pulledAt: string,
  onChange: () => void,
): void {
  const next = {
    rateMinor: channexRateToMinor(values.rate),
    minStayArrival: values.min_stay_arrival ?? null,
    minStayThrough: values.min_stay_through ?? null,
    maxStay: values.max_stay ?? null,
    closedToArrival: values.closed_to_arrival ?? null,
    closedToDeparture: values.closed_to_departure ?? null,
    stopSell: values.stop_sell ?? null,
  }
  const existing = rows.find(
    (r) => r.ratePlanChannexId === ratePlanChannexId && r.date === date,
  )
  if (existing) {
    existing.pulledAt = pulledAt
    const dirty = (Object.keys(next) as (keyof typeof next)[]).some(
      (k) => existing[k] !== next[k],
    )
    if (dirty) {
      Object.assign(existing, next)
      existing.snapshotVersion = candidateVersion
      onChange()
    }
    return
  }
  rows.push({
    networkId,
    propertyId,
    ratePlanChannexId,
    date,
    ...next,
    snapshotVersion: candidateVersion,
    pulledAt,
  })
  onChange()
}
