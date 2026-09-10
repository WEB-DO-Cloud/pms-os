import {
  principalCanAccessModule,
  principalCanAccessProperty,
  type PrincipalContext,
} from '@pms/auth'
import {
  computeReportSummary,
  type ReservationRecord,
} from '@pms/domain'
import type { PropertyRow } from '@pms/sync'
import {
  listScopedProperties,
  getDomainStore,
} from './reservations'
import { propertyCapacities, syncFreshness } from './revenue'

/**
 * Owner portal (U12). Read-only, owner_properties-scoped projections with an
 * allowlisted field set — no staff notes, secrets, sync internals, or extra PII.
 */

export type OwnerPropertyView = {
  id: number
  name: string
  city: string | null
  country: string | null
  timezone: string | null
  currency: string | null
}

export type OwnerBookingView = {
  id: number
  propertyId: number
  status: string
  checkInDate: string
  checkOutDate: string
  currency: string
  guestName: string | null
  channel: string | null
  totalAmountMinor: number | null
}

export function canAccessOwnerPortal(principal: PrincipalContext): boolean {
  return principalCanAccessModule(principal, 'owner')
}

export function toOwnerProperty(row: PropertyRow): OwnerPropertyView {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    country: row.country,
    timezone: row.timezone,
    currency: row.currency,
  }
}

/** Explicit allowlist — never spread ReservationRecord. */
export function toOwnerBooking(row: ReservationRecord): OwnerBookingView {
  return {
    id: row.id,
    propertyId: row.propertyId,
    status: row.status,
    checkInDate: row.checkInDate,
    checkOutDate: row.checkOutDate,
    currency: row.currency,
    guestName: row.guestName,
    channel: row.channel ?? null,
    totalAmountMinor: row.totalAmountMinor ?? null,
  }
}

export function filterOwnerBookings(
  reservations: readonly ReservationRecord[],
  principal: PrincipalContext,
  filter: { propertyId?: number } = {},
): OwnerBookingView[] {
  return reservations
    .filter((r) => {
      if (r.networkId !== principal.networkId) return false
      if (!principalCanAccessProperty(principal, r.propertyId)) return false
      if (filter.propertyId != null && r.propertyId !== filter.propertyId) {
        return false
      }
      if (r.status === 'pending_payment') return false
      return true
    })
    .map(toOwnerBooking)
    .sort((a, b) => a.checkInDate.localeCompare(b.checkInDate) || a.id - b.id)
}

export function assertOwnerBookingSafe(view: OwnerBookingView & Record<string, unknown>) {
  const forbidden = [
    'staffNotes',
    'guestEmail',
    'channexBookingId',
    'pendingSyncReason',
    'channexRaw',
    'sourceRevisionId',
    'paymentCollect',
    'paymentType',
  ]
  for (const key of forbidden) {
    if (key in view) {
      throw new Error(`Owner booking leaked field: ${key}`)
    }
  }
}

export function ownerPropertiesPayload(
  networkId: number,
  principal: PrincipalContext,
): OwnerPropertyView[] {
  return listScopedProperties(networkId, principal).map(toOwnerProperty)
}

export function ownerBookingsPayload(
  networkId: number,
  principal: PrincipalContext,
  filter: { propertyId?: number } = {},
) {
  const store = getDomainStore(networkId)
  return filterOwnerBookings(store.reservations, principal, filter)
}

export function ownerSummaryPayload(
  networkId: number,
  principal: PrincipalContext,
  filters: { from: string; to: string; propertyId?: number },
) {
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
      ownerScoped: true,
    },
  )
}

export function ownerPortalPayload(
  networkId: number,
  principal: PrincipalContext,
  filters: { from: string; to: string; propertyId?: number },
) {
  return {
    networkId,
    properties: ownerPropertiesPayload(networkId, principal),
    bookings: ownerBookingsPayload(networkId, principal, {
      propertyId: filters.propertyId,
    }),
    summary: ownerSummaryPayload(networkId, principal, filters),
    readOnly: true as const,
  }
}
