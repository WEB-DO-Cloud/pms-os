import { principalCanAccessProperty, type PrincipalContext } from '@pms/auth'
import { isSyncDataStale, type SyncFreshnessInput } from '../reports/summaries'
import type { NetworkCapabilityRecord, RatePlanRecord } from '../store'
import { resolveRateMode } from '../commands/set-rate-plan-restrictions'

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
  /** Channex rate_mode when known from catalog. */
  rateMode?: string | null
  parentRatePlanChannexId?: string | null
  /** Documented primary derived_option.rate when present. */
  derivedModifierSummary?: string | null
}

export type RatePlanView = RateCacheRow & {
  propertyName: string
  state: 'cached' | 'unavailable' | 'cache_miss'
  managedInChannex: true
  /** True when this row cannot be nightly-edited locally (always true for derived). */
  readOnly: boolean
  nightlyEditable: boolean
  derivedModifierEditable: boolean
  channelMappingManagedInChannex: true
}

export type RatesReadModel = {
  managedInChannex: true
  /** True when no write capability is on — honest global banner. */
  readOnly: boolean
  /** True when any of rateRestrictionWrite / derivedRateWrite / availabilityWrite is on. */
  ariWriteEnabled: boolean
  rateRestrictionWrite: boolean
  derivedRateWrite: boolean
  plans: RatePlanView[]
  freshness: {
    status: string
    lastPullAt: string | null
    updatedAt: string
    stale: boolean
    staleReason: string | null
  }
}

export type RatesProjectionOptions = {
  capabilities?: Pick<
    NetworkCapabilityRecord,
    'rateRestrictionWrite' | 'derivedRateWrite' | 'availabilityWrite'
  >
  /** Catalog rows for rate_mode / derived_option affordances. */
  ratePlans?: readonly RatePlanRecord[]
}

function derivedSummaryFromRaw(raw: unknown): string | null {
  const attrs = raw as {
    options?: Array<{
      is_primary?: boolean
      derived_option?: { rate?: [string, string][] } | null
    }>
  } | null
  const primary =
    attrs?.options?.find((o) => o.is_primary) ?? attrs?.options?.[0]
  const rule = primary?.derived_option?.rate?.[0]
  if (!rule) return null
  return `${rule[0]} ${rule[1]}`
}

/**
 * Rates projection. Channex remains authoritative — write affordances only
 * surface when network capabilities allow (still no local ARI mutation here).
 */
export function projectRatesReadOnly(
  principal: PrincipalContext,
  properties: readonly { id: number; name: string }[],
  cache: readonly RateCacheRow[],
  freshness: SyncFreshnessInput,
  nowMs = Date.now(),
  options: RatesProjectionOptions = {},
): RatesReadModel {
  const caps = options.capabilities ?? {
    rateRestrictionWrite: false,
    derivedRateWrite: false,
    availabilityWrite: false,
  }
  const ariWriteEnabled =
    caps.rateRestrictionWrite || caps.derivedRateWrite || caps.availabilityWrite
  const plansById = new Map(
    (options.ratePlans ?? []).map((p) => [p.channexId, p] as const),
  )

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
        nightlyEditable: false,
        derivedModifierEditable: false,
        channelMappingManagedInChannex: true,
        rateMode: null,
        parentRatePlanChannexId: null,
        derivedModifierSummary: null,
      })
      continue
    }
    for (const row of rows) {
      const catalog = plansById.get(row.ratePlanId)
      const rateMode =
        row.rateMode ??
        (catalog ? resolveRateMode(catalog) : null) ??
        null
      const parentId =
        row.parentRatePlanChannexId ?? catalog?.parentRatePlanChannexId ?? null
      const isManual =
        rateMode === 'manual' && parentId == null
      const isDerived = rateMode === 'derived'
      const nightlyEditable = caps.rateRestrictionWrite && isManual
      const derivedModifierEditable = caps.derivedRateWrite && isDerived
      const miss = row.cachedAt == null || row.amountMinor == null
      plans.push({
        ...row,
        propertyName: p.name,
        state: miss ? 'cache_miss' : 'cached',
        managedInChannex: true,
        readOnly: !nightlyEditable,
        nightlyEditable,
        derivedModifierEditable,
        channelMappingManagedInChannex: true,
        rateMode,
        parentRatePlanChannexId: parentId,
        derivedModifierSummary:
          row.derivedModifierSummary ??
          (catalog ? derivedSummaryFromRaw(catalog.channexRaw) : null),
      })
    }
  }

  const stale = isSyncDataStale(freshness, nowMs)
  return {
    managedInChannex: true,
    readOnly: !ariWriteEnabled,
    ariWriteEnabled,
    rateRestrictionWrite: caps.rateRestrictionWrite,
    derivedRateWrite: caps.derivedRateWrite,
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
