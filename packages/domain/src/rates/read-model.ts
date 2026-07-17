import { principalCanAccessProperty, type PrincipalContext } from '@pms/auth'
import { isSyncDataStale, type SyncFreshnessInput } from '../reports/summaries'

export type RateCacheRow = {
  propertyId: number
  ratePlanId: string
  ratePlanName: string
  currency: string
  /** Nightly amount in minor units when cached. */
  amountMinor: number | null
  dateFrom: string
  dateTo: string
  minStay: number | null
  stopSell: boolean
  parityWarning: string | null
  /** ISO timestamp when this row was cached; null = cache miss / unavailable. */
  cachedAt: string | null
}

export type RatePlanView = RateCacheRow & {
  propertyName: string
  state: 'cached' | 'unavailable' | 'cache_miss'
  managedInChannex: true
  readOnly: true
}

export type RatesReadModel = {
  managedInChannex: true
  readOnly: true
  ariWriteEnabled: false
  plans: RatePlanView[]
  freshness: {
    status: string
    lastPullAt: string | null
    updatedAt: string
    stale: boolean
    staleReason: string | null
  }
}

/**
 * Read-only rates projection. No ARI write path in v1 (R9 / KTD11).
 * Missing cache rows surface as unavailable/cache_miss per property.
 */
export function projectRatesReadOnly(
  principal: PrincipalContext,
  properties: readonly { id: number; name: string }[],
  cache: readonly RateCacheRow[],
  freshness: SyncFreshnessInput,
  nowMs = Date.now(),
): RatesReadModel {
  const scoped = properties.filter((p) =>
    principalCanAccessProperty(principal, p.id),
  )
  const byProperty = new Map<number, RateCacheRow[]>()
  for (const row of cache) {
    const list = byProperty.get(row.propertyId) ?? []
    list.push(row)
    byProperty.set(row.propertyId, list)
  }

  const plans: RatePlanView[] = []
  for (const p of scoped) {
    const rows = byProperty.get(p.id)
    if (!rows?.length) {
      plans.push({
        propertyId: p.id,
        propertyName: p.name,
        ratePlanId: '—',
        ratePlanName: 'No cached rate plan',
        currency: 'USD',
        amountMinor: null,
        dateFrom: '',
        dateTo: '',
        minStay: null,
        stopSell: false,
        parityWarning: null,
        cachedAt: null,
        state: 'unavailable',
        managedInChannex: true,
        readOnly: true,
      })
      continue
    }
    for (const row of rows) {
      const miss = row.cachedAt == null || row.amountMinor == null
      plans.push({
        ...row,
        propertyName: p.name,
        state: miss ? 'cache_miss' : 'cached',
        managedInChannex: true,
        readOnly: true,
      })
    }
  }

  const stale = isSyncDataStale(freshness, nowMs)
  return {
    managedInChannex: true,
    readOnly: true,
    ariWriteEnabled: false,
    plans,
    freshness: {
      status: freshness.status,
      lastPullAt: freshness.lastPullAt,
      updatedAt: freshness.updatedAt,
      stale: stale.stale,
      staleReason: stale.reason,
    },
  }
}
