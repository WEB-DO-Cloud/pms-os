import {
  principalCanAccessProperty,
  type PrincipalContext,
} from '@pms/auth'
import { getDomainStore, listScopedProperties } from './reservations'
import {
  propertyCapacities,
  ratesPayload,
  reportsPayload,
  syncFreshness,
} from './revenue'
import { getSyncStore } from './sync'

export function scopedPropertyIds(
  networkId: number,
  principal: PrincipalContext,
  propertyId?: number,
): number[] {
  const all = listScopedProperties(networkId, principal).map((p) => p.id)
  if (propertyId == null) return all
  if (!principalCanAccessProperty(principal, propertyId)) {
    throw Object.assign(new Error('Property out of scope'), { statusCode: 403 })
  }
  return all.includes(propertyId) ? [propertyId] : []
}

export function buildPricingContext(
  networkId: number,
  principal: PrincipalContext,
  propertyId?: number,
) {
  const rates = ratesPayload(networkId, principal)
  const ids = scopedPropertyIds(networkId, principal, propertyId)
  const plans = rates.plans.filter((p) => ids.includes(p.propertyId))
  const capacities = propertyCapacities(networkId, ids)
  const store = getDomainStore(networkId)
  const live = store.reservations.filter(
    (r) =>
      ids.includes(r.propertyId) &&
      r.status !== 'cancelled' &&
      r.status !== 'no_show',
  )
  return {
    properties: listScopedProperties(networkId, principal)
      .filter((p) => ids.includes(p.id))
      .map((p) => ({ id: p.id, name: p.name })),
    plans: plans.map((p) => ({
      propertyId: p.propertyId,
      propertyName: p.propertyName,
      ratePlanId: p.ratePlanId,
      ratePlanName: p.ratePlanName,
      amountMinor: p.amountMinor,
      currency: p.currency,
      dateFrom: p.dateFrom,
      dateTo: p.dateTo,
      stopSell: p.stopSell,
      state: p.state,
    })),
    capacities,
    activeReservationCount: live.length,
    freshness: rates.freshness,
    ariWriteEnabled: rates.ariWriteEnabled,
  }
}

export function buildForecastContext(
  networkId: number,
  principal: PrincipalContext,
  from: string,
  to: string,
  propertyId?: number,
) {
  const report = reportsPayload(networkId, principal, {
    from,
    to,
    propertyId,
  })
  return {
    from,
    to,
    report: {
      occupancyPct: report.occupancyPct,
      revenueMinor: report.revenueMinor,
      adrMinor: report.adrMinor,
      revparMinor: report.revparMinor,
      byProperty: report.byProperty,
      byChannel: report.byChannel,
    },
    freshness: report.freshness,
  }
}

export function buildConciergeContext(
  networkId: number,
  principal: PrincipalContext,
  reservationId: number,
) {
  const store = getDomainStore(networkId)
  const reservation = store.reservations.find(
    (r) => r.id === reservationId && r.networkId === networkId,
  )
  if (!reservation) {
    throw Object.assign(new Error('Reservation not found'), { statusCode: 404 })
  }
  if (!principalCanAccessProperty(principal, reservation.propertyId)) {
    throw Object.assign(new Error('Property out of scope'), { statusCode: 403 })
  }
  const messages = store.outboundMessages
    .filter((m) => m.reservationId === reservationId)
    .slice(-8)
    .map((m) => ({
      body: m.body,
      status: m.status,
      createdAt: m.createdAt,
      channel: m.channel,
    }))
  const prop = getSyncStore(networkId)
    .listProperties(networkId)
    .find((p) => p.id === reservation.propertyId)
  return {
    reservation: {
      id: reservation.id,
      propertyId: reservation.propertyId,
      propertyName: prop?.name ?? `Property ${reservation.propertyId}`,
      guestName: reservation.guestName,
      checkInDate: reservation.checkInDate,
      checkOutDate: reservation.checkOutDate,
      status: reservation.status,
      channel: reservation.channel ?? null,
      specialRequests: null as string | null,
    },
    recentOutbound: messages,
  }
}

export function buildOpsScheduleContext(
  networkId: number,
  principal: PrincipalContext,
  from: string,
  to: string,
  propertyId?: number,
) {
  const ids = scopedPropertyIds(networkId, principal, propertyId)
  const store = getDomainStore(networkId)
  const checkOuts = store.reservations.filter(
    (r) =>
      ids.includes(r.propertyId) &&
      r.status !== 'cancelled' &&
      r.checkOutDate >= from &&
      r.checkOutDate <= to,
  )
  const openTasks = store.tasks.filter(
    (t) =>
      t.propertyId != null &&
      ids.includes(t.propertyId) &&
      (t.status === 'todo' || t.status === 'in_progress'),
  )
  const properties = listScopedProperties(networkId, principal)
    .filter((p) => ids.includes(p.id))
    .map((p) => {
      const ops = store.propertyOps.find(
        (o) => o.propertyId === p.id && o.networkId === networkId,
      )
      return {
        id: p.id,
        name: p.name,
        notes: ops?.notes ?? null,
        checkOutTime: ops?.checkOutTime ?? '11:00',
      }
    })
  return {
    from,
    to,
    properties,
    checkOuts: checkOuts.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      guestName: r.guestName,
      checkOutDate: r.checkOutDate,
      checkInDate: r.checkInDate,
    })),
    openTasks: openTasks.map((t) => ({
      id: t.id,
      propertyId: t.propertyId,
      title: t.title,
      category: t.category,
      status: t.status,
    })),
    freshness: syncFreshness(networkId),
  }
}
