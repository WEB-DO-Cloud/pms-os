import {
  principalCanAccessProperty,
  type PrincipalContext,
} from '@pms/auth'
import type {
  GuestRecord,
  PropertyOpsRecord,
  ReservationRecord,
  ReviewRecord,
  TaskRecord,
} from './store'

export type TaskListFilter = {
  propertyId?: number
  status?: string
  category?: string
}

/**
 * Task list scope: property access + housekeeping assignment filter.
 * Pure — used by APIs and operations tests.
 */
export function filterTasksForPrincipal(
  tasks: readonly TaskRecord[],
  principal: PrincipalContext,
  filter: TaskListFilter = {},
): TaskRecord[] {
  return tasks.filter((t) => {
    if (t.networkId !== principal.networkId) return false
    if (t.propertyId == null) return false
    if (!principalCanAccessProperty(principal, t.propertyId)) return false
    if (principal.role === 'housekeeping') {
      if (t.assignedToUserId !== principal.userId) return false
    }
    if (filter.propertyId != null && t.propertyId !== filter.propertyId) {
      return false
    }
    if (filter.status && t.status !== filter.status) return false
    if (filter.category && t.category !== filter.category) return false
    return true
  })
}

export function isPropertyArchived(
  ops: Pick<PropertyOpsRecord, 'status' | 'archivedAt'>,
): boolean {
  return ops.status === 'archived' || ops.archivedAt != null
}

export function filterPropertyOpsActive(
  rows: readonly PropertyOpsRecord[],
): PropertyOpsRecord[] {
  return rows.filter((r) => !isPropertyArchived(r))
}

export type GuestProjection = {
  guestKey: string
  displayName: string
  email: string | null
  propertyIds: number[]
  reservationIds: number[]
  stayCount: number
  vip: boolean
  notes: string | null
  enrichmentId: number | null
}

export function guestKeyFromReservation(
  r: Pick<ReservationRecord, 'guestEmail' | 'guestName'>,
): string | null {
  const email = r.guestEmail?.trim().toLowerCase()
  if (email) return email
  const name = r.guestName?.trim().toLowerCase()
  return name || null
}

/** Merge reservation-derived guests with local enrichments within property scope. */
export function projectGuestsForPrincipal(
  reservations: readonly ReservationRecord[],
  enrichments: readonly GuestRecord[],
  principal: PrincipalContext,
): GuestProjection[] {
  const byKey = new Map<string, GuestProjection>()
  for (const r of reservations) {
    if (r.networkId !== principal.networkId) continue
    if (!principalCanAccessProperty(principal, r.propertyId)) continue
    const key = guestKeyFromReservation(r)
    if (!key) continue
    const existing = byKey.get(key)
    if (existing) {
      if (!existing.propertyIds.includes(r.propertyId)) {
        existing.propertyIds.push(r.propertyId)
      }
      existing.reservationIds.push(r.id)
      existing.stayCount += 1
    } else {
      byKey.set(key, {
        guestKey: key,
        displayName: r.guestName ?? key,
        email: r.guestEmail ?? null,
        propertyIds: [r.propertyId],
        reservationIds: [r.id],
        stayCount: 1,
        vip: false,
        notes: null,
        enrichmentId: null,
      })
    }
  }
  for (const g of enrichments) {
    if (g.networkId !== principal.networkId) continue
    const row = byKey.get(g.guestKey)
    if (row) {
      row.vip = g.vip
      row.notes = g.notes
      row.enrichmentId = g.id
      if (g.displayName) row.displayName = g.displayName
      if (g.email) row.email = g.email
    } else {
      // Enrichment-only guests still listed if principal is network-wide / has any props;
      // property scope for enrichment-only rows is deferred — require a linked reservation.
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  )
}

export function filterMessagesForPrincipal<
  T extends { networkId: number; propertyId: number; reservationId: number | null },
>(
  messages: readonly T[],
  principal: PrincipalContext,
  filter: { propertyId?: number; reservationId?: number } = {},
): T[] {
  return messages.filter((m) => {
    if (m.networkId !== principal.networkId) return false
    if (!principalCanAccessProperty(principal, m.propertyId)) return false
    if (filter.propertyId != null && m.propertyId !== filter.propertyId) {
      return false
    }
    if (
      filter.reservationId != null &&
      m.reservationId !== filter.reservationId
    ) {
      return false
    }
    return true
  })
}

export function filterReviewsForPrincipal(
  reviews: readonly ReviewRecord[],
  principal: PrincipalContext,
  filter: { propertyId?: number; status?: string } = {},
): ReviewRecord[] {
  return reviews.filter((r) => {
    if (r.networkId !== principal.networkId) return false
    if (!principalCanAccessProperty(principal, r.propertyId)) return false
    if (filter.propertyId != null && r.propertyId !== filter.propertyId) {
      return false
    }
    if (filter.status && r.status !== filter.status) return false
    return true
  })
}
