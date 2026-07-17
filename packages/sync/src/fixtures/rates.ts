import type { RateCacheRow } from '@pms/domain'

/**
 * Stub Channex ARI cache for Rates v1 (read-only).
 * ponytail: no live ARI pull yet — fixture rows stand in until catalog/ARI sync lands.
 */
export function fixtureRateCache(propertyIds: readonly number[]): RateCacheRow[] {
  const rows: RateCacheRow[] = []
  for (const propertyId of propertyIds) {
    rows.push({
      propertyId,
      ratePlanId: `rp-${propertyId}-std`,
      ratePlanName: 'Standard BAR',
      currency: 'USD',
      amountMinor: 12_500,
      dateFrom: '2026-07-01',
      dateTo: '2026-09-30',
      minStay: 2,
      stopSell: false,
      parityWarning: null,
      cachedAt: '2026-07-16T08:00:00.000Z',
    })
    rows.push({
      propertyId,
      ratePlanId: `rp-${propertyId}-wknd`,
      ratePlanName: 'Weekend',
      currency: 'USD',
      amountMinor: 15_000,
      dateFrom: '2026-07-01',
      dateTo: '2026-09-30',
      minStay: 3,
      stopSell: propertyId % 2 === 0,
      parityWarning:
        propertyId % 2 === 0 ? 'Channel parity drift vs Airbnb' : null,
      cachedAt: '2026-07-16T08:00:00.000Z',
    })
  }
  return rows
}

/** Explicit cache-miss row for tests / empty properties. */
export function fixtureRateCacheMiss(propertyId: number): RateCacheRow {
  return {
    propertyId,
    ratePlanId: `rp-${propertyId}-miss`,
    ratePlanName: 'Unsynced plan',
    currency: 'USD',
    amountMinor: null,
    dateFrom: '2026-07-01',
    dateTo: '2026-07-31',
    minStay: null,
    stopSell: false,
    parityWarning: null,
    cachedAt: null,
  }
}
