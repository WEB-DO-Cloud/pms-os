import {
  principalCanAccessModule,
  principalCanAccessProperty,
  type AppModule,
  type PrincipalContext,
} from '@pms/auth'
import {
  computeReportSummary,
  projectRatesReadOnly,
  runCommand,
  type DomainStore,
  type LedgerRecord,
  type LedgerType,
  type RateCacheRow,
  type ReservationRecord,
} from '@pms/domain'
import { fixtureRateCache } from '@pms/sync'
import {
  commandCtx,
  getDomainStore,
  listScopedProperties,
} from './reservations'
import { getSyncStore } from './sync'

/**
 * Rates / Reports / Payments (U10).
 *
 * ponytail: same process-memory SyncStore.domain as U8/U9. Rates use fixture ARI
 * cache until live Channex ARI pull exists.
 */

export function requireRevenueModule(
  principal: PrincipalContext,
  module: AppModule,
) {
  if (!principalCanAccessModule(principal, module)) {
    throw createError({ statusCode: 403, statusMessage: 'Module denied' })
  }
}

export function syncFreshness(networkId: number) {
  const h = getSyncStore(networkId).getSyncHealth(networkId)
  return {
    status: h.status,
    lastPullAt: h.lastPullAt,
    updatedAt: h.updatedAt,
  }
}

/** In-process rate cache overrides for tests; falls back to fixtures. */
const rateCacheByNetwork = new Map<number, RateCacheRow[]>()

export function setRateCacheForNetwork(
  networkId: number,
  rows: RateCacheRow[] | null,
) {
  if (rows == null) rateCacheByNetwork.delete(networkId)
  else rateCacheByNetwork.set(networkId, rows)
}

export function getRateCache(networkId: number, propertyIds: number[]): RateCacheRow[] {
  const override = rateCacheByNetwork.get(networkId)
  if (override) return override.filter((r) => propertyIds.includes(r.propertyId))
  return fixtureRateCache(propertyIds)
}

export function ratesPayload(networkId: number, principal: PrincipalContext) {
  requireRevenueModule(principal, 'rates')
  const properties = listScopedProperties(networkId, principal).map((p) => ({
    id: p.id,
    name: p.name,
  }))
  const cache = getRateCache(
    networkId,
    properties.map((p) => p.id),
  )
  return projectRatesReadOnly(
    principal,
    properties,
    cache,
    syncFreshness(networkId),
  )
}

export function propertyCapacities(networkId: number, propertyIds: number[]) {
  const sync = getSyncStore(networkId)
  return propertyIds.map((propertyId) => {
    const rooms = sync.listRoomTypes(networkId, propertyId)
    const unitCount = rooms.reduce(
      (sum, r) => sum + Math.max(1, r.countOfRooms ?? 1),
      rooms.length === 0 ? 1 : 0,
    )
    const prop = sync.listProperties(networkId).find((p) => p.id === propertyId)
    return {
      propertyId,
      unitCount: Math.max(1, unitCount),
      name: prop?.name,
    }
  })
}

export function reportsPayload(
  networkId: number,
  principal: PrincipalContext,
  filters: { from: string; to: string; propertyId?: number },
) {
  requireRevenueModule(principal, 'reports')
  const properties = listScopedProperties(networkId, principal)
  const propertyIds = properties.map((p) => p.id)
  const store = getDomainStore(networkId)
  return computeReportSummary(
    store.reservations,
    principal,
    propertyCapacities(networkId, propertyIds),
    syncFreshness(networkId),
    {
      from: filters.from,
      to: filters.to,
      propertyId: filters.propertyId,
      ownerScoped: principal.role === 'property_owner',
    },
  )
}

export type LedgerListRow = LedgerRecord & {
  propertyId: number
  guestName: string | null
  paymentCollect: string | null
  paymentType: string | null
  reservationTotalMinor: number | null
  reservationCurrency: string
}

export function filterLedgerForPrincipal(
  store: DomainStore,
  principal: PrincipalContext,
  filter: { propertyId?: number; reservationId?: number } = {},
): LedgerListRow[] {
  const byRes = new Map(
    store.reservations
      .filter((r) => r.networkId === principal.networkId)
      .map((r) => [r.id, r]),
  )
  return store.ledger
    .filter((entry) => entry.networkId === principal.networkId)
    .map((entry) => {
      const res = byRes.get(entry.reservationId)
      if (!res) return null
      if (!principalCanAccessProperty(principal, res.propertyId)) return null
      if (filter.propertyId != null && res.propertyId !== filter.propertyId) {
        return null
      }
      if (
        filter.reservationId != null &&
        entry.reservationId !== filter.reservationId
      ) {
        return null
      }
      return {
        ...entry,
        propertyId: res.propertyId,
        guestName: res.guestName,
        paymentCollect: res.paymentCollect ?? null,
        paymentType: res.paymentType ?? null,
        reservationTotalMinor: res.totalAmountMinor ?? null,
        reservationCurrency: res.currency,
      } satisfies LedgerListRow
    })
    .filter((x): x is LedgerListRow => x != null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function paymentsListPayload(
  networkId: number,
  principal: PrincipalContext,
  filter: { propertyId?: number; reservationId?: number } = {},
) {
  requireRevenueModule(principal, 'payments')
  const store = getDomainStore(networkId)
  return {
    networkId,
    properties: listScopedProperties(networkId, principal).map((p) => ({
      id: p.id,
      name: p.name,
    })),
    ledger: filterLedgerForPrincipal(store, principal, filter),
    reservations: store.reservations
      .filter(
        (r) =>
          r.networkId === networkId &&
          principalCanAccessProperty(principal, r.propertyId) &&
          (filter.propertyId == null || r.propertyId === filter.propertyId),
      )
      .map((r) => reservationPaymentMeta(r)),
    note: 'Ledger events only — no card capture or gateway charge in v1.',
  }
}

function reservationPaymentMeta(r: ReservationRecord) {
  return {
    id: r.id,
    propertyId: r.propertyId,
    guestName: r.guestName,
    checkInDate: r.checkInDate,
    checkOutDate: r.checkOutDate,
    currency: r.currency,
    totalAmountMinor: r.totalAmountMinor ?? null,
    paymentCollect: r.paymentCollect ?? null,
    paymentType: r.paymentType ?? null,
    status: r.status,
  }
}

export async function recordPayment(
  principal: PrincipalContext,
  input: {
    reservationId: number
    propertyId: number
    type: LedgerType
    amountMinor: number
    currency: string
    note?: string
    compensatesEntryId?: number
  },
) {
  requireRevenueModule(principal, 'payments')
  if (!principalCanAccessProperty(principal, input.propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }
  if (principal.networkId == null) {
    throw createError({ statusCode: 403, statusMessage: 'Network required' })
  }

  const store = getDomainStore(principal.networkId)
  const result = await runCommand(
    'recordLedgerPayment',
    commandCtx(principal, input.propertyId),
    input,
    { store },
  )
  if (result.status !== 'ok') {
    const code = result.error?.code
    throw createError({
      statusCode:
        code === 'PROPERTY_SCOPE' ||
        code === 'MODULE_DENIED' ||
        code === 'NETWORK_SCOPE'
          ? 403
          : code === 'NOT_FOUND'
            ? 404
            : 400,
      statusMessage: result.error?.message ?? 'Ledger write failed',
      data: result,
    })
  }
  return result.data
}
