import {
  principalCanAccessProperty,
  type PrincipalContext,
} from '@pms/auth'
import type { ReservationRecord } from '../store'
import {
  daysInclusive,
  overlappingStayNights,
  stayNights,
} from './money'

export type SyncFreshnessInput = {
  status: string
  lastPullAt: string | null
  updatedAt: string
}

export type PropertyCapacity = {
  propertyId: number
  /** Sellable units (room count). Defaults to 1 when unknown. */
  unitCount: number
  name?: string
}

export type ReportFilters = {
  from: string
  to: string
  propertyId?: number
  /** When true, only ownerPropertyIds (owner portal). Staff uses property membership. */
  ownerScoped?: boolean
}

export type ChannelRevenueRow = {
  channel: string
  revenueMinor: number
  occupiedNights: number
  bookingCount: number
}

export type PropertyReportRow = {
  propertyId: number
  propertyName: string
  occupiedNights: number
  availableNights: number
  occupancyPct: number
  revenueMinor: number
  adrMinor: number
  revparMinor: number
  bookingCount: number
}

export type ReportSummary = {
  from: string
  to: string
  currency: string
  occupiedNights: number
  availableNights: number
  occupancyPct: number
  revenueMinor: number
  adrMinor: number
  revparMinor: number
  bookingCount: number
  byProperty: PropertyReportRow[]
  byChannel: ChannelRevenueRow[]
  freshness: {
    status: string
    lastPullAt: string | null
    updatedAt: string
    stale: boolean
    staleReason: string | null
  }
  excludedPropertyIds: number[]
}

const ACTIVE_STATUSES = new Set([
  'confirmed',
  'new',
  'modified',
  'checked_in',
  'pending_sync',
])

/** Sync older than 24h or failed/warning is stale for report consumers. */
export function isSyncDataStale(
  freshness: SyncFreshnessInput,
  nowMs = Date.now(),
): { stale: boolean; reason: string | null } {
  if (freshness.status === 'failed') {
    return { stale: true, reason: 'sync_failed' }
  }
  if (freshness.status === 'warning') {
    return { stale: true, reason: 'sync_warning' }
  }
  if (!freshness.lastPullAt) {
    return { stale: true, reason: 'no_pull_yet' }
  }
  const pulled = Date.parse(freshness.lastPullAt)
  if (!Number.isFinite(pulled)) {
    return { stale: true, reason: 'invalid_pull_timestamp' }
  }
  if (nowMs - pulled > 24 * 60 * 60 * 1000) {
    return { stale: true, reason: 'pull_older_than_24h' }
  }
  return { stale: false, reason: null }
}

function isReportable(r: ReservationRecord): boolean {
  if (r.status === 'cancelled') return false
  return ACTIVE_STATUSES.has(r.status) || r.status === 'confirmed'
}

function prorateRevenue(
  totalAmountMinor: number | null | undefined,
  stayNightCount: number,
  occupiedInRange: number,
): number {
  if (totalAmountMinor == null || stayNightCount <= 0 || occupiedInRange <= 0) {
    return 0
  }
  // ponytail: integer proportional share; remainder truncates. Upgrade: banker's rounding per night.
  return Math.trunc((totalAmountMinor * occupiedInRange) / stayNightCount)
}

/**
 * Occupancy / ADR / RevPAR / channel revenue from local reservation projections.
 * Excludes properties outside principal scope.
 */
export function computeReportSummary(
  reservations: readonly ReservationRecord[],
  principal: PrincipalContext,
  capacities: readonly PropertyCapacity[],
  freshness: SyncFreshnessInput,
  filters: ReportFilters,
  nowMs = Date.now(),
): ReportSummary {
  const capacityById = new Map(capacities.map((c) => [c.propertyId, c]))
  const excludedPropertyIds: number[] = []
  const scopedPropertyIds = new Set<number>()

  for (const cap of capacities) {
    const allowed = filters.ownerScoped
      ? principal.role === 'property_owner'
        ? principal.ownerPropertyIds.includes(cap.propertyId)
        : false
      : principalCanAccessProperty(principal, cap.propertyId)
    if (!allowed) {
      excludedPropertyIds.push(cap.propertyId)
      continue
    }
    if (filters.propertyId != null && cap.propertyId !== filters.propertyId) {
      continue
    }
    scopedPropertyIds.add(cap.propertyId)
  }

  const rangeDays = daysInclusive(filters.from, filters.to)
  const byProperty = new Map<
    number,
    {
      occupiedNights: number
      revenueMinor: number
      bookingCount: number
      currency: string
    }
  >()
  const byChannel = new Map<string, ChannelRevenueRow>()
  let currency = 'USD'

  for (const r of reservations) {
    if (r.networkId !== principal.networkId) continue
    if (!isReportable(r)) continue
    if (!scopedPropertyIds.has(r.propertyId)) continue

    const nights = overlappingStayNights(
      r.checkInDate,
      r.checkOutDate,
      filters.from,
      filters.to,
    )
    if (nights <= 0) continue

    const fullStay = stayNights(r.checkInDate, r.checkOutDate)
    const revenue = prorateRevenue(r.totalAmountMinor, fullStay, nights)
    currency = r.currency || currency

    const prop = byProperty.get(r.propertyId) ?? {
      occupiedNights: 0,
      revenueMinor: 0,
      bookingCount: 0,
      currency,
    }
    prop.occupiedNights += nights
    prop.revenueMinor += revenue
    prop.bookingCount += 1
    byProperty.set(r.propertyId, prop)

    const channel = r.channel?.trim() || 'direct'
    const ch = byChannel.get(channel) ?? {
      channel,
      revenueMinor: 0,
      occupiedNights: 0,
      bookingCount: 0,
    }
    ch.revenueMinor += revenue
    ch.occupiedNights += nights
    ch.bookingCount += 1
    byChannel.set(channel, ch)
  }

  const propertyRows: PropertyReportRow[] = []
  let occupiedNights = 0
  let availableNights = 0
  let revenueMinor = 0
  let bookingCount = 0

  for (const propertyId of scopedPropertyIds) {
    const cap = capacityById.get(propertyId)
    const units = Math.max(1, cap?.unitCount ?? 1)
    const avail = units * rangeDays
    const row = byProperty.get(propertyId) ?? {
      occupiedNights: 0,
      revenueMinor: 0,
      bookingCount: 0,
      currency,
    }
    const occ = row.occupiedNights
    const rev = row.revenueMinor
    occupiedNights += occ
    availableNights += avail
    revenueMinor += rev
    bookingCount += row.bookingCount
    propertyRows.push({
      propertyId,
      propertyName: cap?.name ?? `Property ${propertyId}`,
      occupiedNights: occ,
      availableNights: avail,
      occupancyPct: avail > 0 ? roundPct((occ / avail) * 100) : 0,
      revenueMinor: rev,
      adrMinor: occ > 0 ? Math.trunc(rev / occ) : 0,
      revparMinor: avail > 0 ? Math.trunc(rev / avail) : 0,
      bookingCount: row.bookingCount,
    })
  }

  propertyRows.sort((a, b) => a.propertyId - b.propertyId)
  const channelRows = [...byChannel.values()].sort((a, b) =>
    a.channel.localeCompare(b.channel),
  )
  const stale = isSyncDataStale(freshness, nowMs)

  return {
    from: filters.from,
    to: filters.to,
    currency,
    occupiedNights,
    availableNights,
    occupancyPct:
      availableNights > 0
        ? roundPct((occupiedNights / availableNights) * 100)
        : 0,
    revenueMinor,
    adrMinor: occupiedNights > 0 ? Math.trunc(revenueMinor / occupiedNights) : 0,
    revparMinor:
      availableNights > 0 ? Math.trunc(revenueMinor / availableNights) : 0,
    bookingCount,
    byProperty: propertyRows,
    byChannel: channelRows,
    freshness: {
      status: freshness.status,
      lastPullAt: freshness.lastPullAt,
      updatedAt: freshness.updatedAt,
      stale: stale.stale,
      staleReason: stale.reason,
    },
    excludedPropertyIds,
  }
}

function roundPct(n: number): number {
  return Math.round(n * 10) / 10
}
