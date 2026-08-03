/**
 * PG write-through + boot hydration for ARI projections, write intents,
 * capabilities, and calendar notes.
 *
 * The DB row is the durable source of truth (R15); the in-memory DomainStore is
 * a per-process cache hydrated on first network touch. Mapping functions are
 * pure and unit-tested; DB calls follow the physical-rooms best-effort pattern
 * except intent enqueue, which MUST be durable before "queued" is reported.
 */
import { and, eq } from 'drizzle-orm'
import {
  ariAvailability,
  ariRestrictions,
  ariWriteIntents,
  calendarNotes,
  networkCapabilities,
  type Db,
} from '@pms/db'
import type {
  AriAvailabilityRecord,
  AriRestrictionRecord,
  AriWriteIntentRecord,
  AriWriteStatus,
  CalendarNoteRecord,
  DomainStore,
  NetworkCapabilityRecord,
} from '@pms/domain'

type IntentRow = typeof ariWriteIntents.$inferSelect

export function intentRowToRecord(row: IntentRow): AriWriteIntentRecord {
  return {
    id: row.id,
    networkId: row.networkId,
    propertyId: row.propertyId,
    lane: row.lane,
    idempotencyKey: row.idempotencyKey,
    payload: row.payload,
    resourceScope:
      (row.resourceScope as AriWriteIntentRecord['resourceScope']) ?? null,
    baseSnapshotVersion: row.baseSnapshotVersion,
    status: row.status as AriWriteStatus,
    channexTaskIds: (row.channexTaskIds as string[]) ?? [],
    warnings: (row.warnings as unknown[]) ?? [],
    attempts: row.attempts,
    lastError: row.lastError,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    actorPrincipalId: row.actorPrincipalId,
    approvedByPrincipalId: row.approvedByPrincipalId,
    compensatesIntentId: row.compensatesIntentId,
    reconciledAt: row.reconciledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function intentRecordToRow(
  record: AriWriteIntentRecord,
): typeof ariWriteIntents.$inferInsert {
  return {
    networkId: record.networkId,
    propertyId: record.propertyId,
    lane: record.lane,
    idempotencyKey: record.idempotencyKey,
    payload: record.payload,
    resourceScope: record.resourceScope,
    baseSnapshotVersion: record.baseSnapshotVersion,
    status: record.status,
    channexTaskIds: record.channexTaskIds,
    warnings: record.warnings,
    attempts: record.attempts,
    lastError: record.lastError,
    nextAttemptAt: record.nextAttemptAt ? new Date(record.nextAttemptAt) : null,
    actorPrincipalId: record.actorPrincipalId,
    approvedByPrincipalId: record.approvedByPrincipalId,
    compensatesIntentId: record.compensatesIntentId,
    reconciledAt: record.reconciledAt ? new Date(record.reconciledAt) : null,
  }
}

/**
 * Durably persist a freshly enqueued intent. Throws on failure — callers must
 * roll the memory intent back rather than report a phantom "queued".
 */
export async function persistAriIntent(
  db: Db,
  record: AriWriteIntentRecord,
): Promise<AriWriteIntentRecord> {
  const [row] = await db
    .insert(ariWriteIntents)
    .values(intentRecordToRow(record))
    .onConflictDoNothing({
      target: [ariWriteIntents.networkId, ariWriteIntents.idempotencyKey],
    })
    .returning()
  if (row) return { ...record, id: row.id }
  // Conflict: an equivalent intent already exists — return the durable one.
  const [existing] = await db
    .select()
    .from(ariWriteIntents)
    .where(
      and(
        eq(ariWriteIntents.networkId, record.networkId),
        eq(ariWriteIntents.idempotencyKey, record.idempotencyKey),
      ),
    )
    .limit(1)
  if (!existing) throw new Error('Intent insert conflict without existing row')
  return intentRowToRecord(existing)
}

export async function persistAriIntentStatus(
  db: Db,
  record: AriWriteIntentRecord,
): Promise<void> {
  await db
    .update(ariWriteIntents)
    .set({
      status: record.status,
      channexTaskIds: record.channexTaskIds,
      warnings: record.warnings,
      attempts: record.attempts,
      lastError: record.lastError,
      nextAttemptAt: record.nextAttemptAt ? new Date(record.nextAttemptAt) : null,
      reconciledAt: record.reconciledAt ? new Date(record.reconciledAt) : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(ariWriteIntents.networkId, record.networkId),
        eq(ariWriteIntents.idempotencyKey, record.idempotencyKey),
      ),
    )
}

/** Upsert the network capability row (org-admin toggles). */
export async function persistNetworkCapabilities(
  db: Db,
  record: NetworkCapabilityRecord,
): Promise<void> {
  const values = {
    networkId: record.networkId,
    bookingCrsWrite: record.bookingCrsWrite,
    availabilityWrite: record.availabilityWrite,
    rateRestrictionWrite: record.rateRestrictionWrite,
    derivedRateWrite: record.derivedRateWrite,
    aiApply: record.aiApply,
    updatedAt: new Date(),
  }
  await db
    .insert(networkCapabilities)
    .values(values)
    .onConflictDoUpdate({ target: networkCapabilities.networkId, set: values })
}

export async function persistCalendarNote(
  db: Db,
  record: CalendarNoteRecord,
): Promise<CalendarNoteRecord> {
  const [row] = await db
    .insert(calendarNotes)
    .values({
      networkId: record.networkId,
      propertyId: record.propertyId,
      date: record.date,
      body: record.body,
      createdByUserId: record.createdByUserId,
    })
    .returning()
  return { ...record, id: row!.id }
}

export async function updatePersistedCalendarNote(
  db: Db,
  record: CalendarNoteRecord,
): Promise<void> {
  await db
    .update(calendarNotes)
    .set({ body: record.body, updatedAt: new Date() })
    .where(
      and(
        eq(calendarNotes.id, record.id),
        eq(calendarNotes.networkId, record.networkId),
      ),
    )
}

export async function deletePersistedCalendarNote(
  db: Db,
  networkId: number,
  noteId: number,
): Promise<void> {
  await db
    .delete(calendarNotes)
    .where(
      and(eq(calendarNotes.id, noteId), eq(calendarNotes.networkId, networkId)),
    )
}

/** Replace the persisted projection rows for the dates a pull touched. */
export async function persistAriProjection(
  db: Db,
  networkId: number,
  availability: readonly AriAvailabilityRecord[],
  restrictions: readonly AriRestrictionRecord[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const row of availability) {
      const values = {
        networkId: row.networkId,
        propertyId: row.propertyId,
        roomTypeId: row.roomTypeId,
        date: row.date,
        availability: row.availability,
        snapshotVersion: row.snapshotVersion,
        pulledAt: new Date(row.pulledAt),
        updatedAt: new Date(),
      }
      await tx
        .insert(ariAvailability)
        .values(values)
        .onConflictDoUpdate({
          target: [ariAvailability.roomTypeId, ariAvailability.date],
          set: values,
        })
    }
    for (const row of restrictions) {
      const values = {
        networkId: row.networkId,
        propertyId: row.propertyId,
        ratePlanChannexId: row.ratePlanChannexId,
        date: row.date,
        rateMinor: row.rateMinor,
        minStayArrival: row.minStayArrival,
        minStayThrough: row.minStayThrough,
        maxStay: row.maxStay,
        closedToArrival: row.closedToArrival,
        closedToDeparture: row.closedToDeparture,
        stopSell: row.stopSell,
        snapshotVersion: row.snapshotVersion,
        pulledAt: new Date(row.pulledAt),
        updatedAt: new Date(),
      }
      await tx
        .insert(ariRestrictions)
        .values(values)
        .onConflictDoUpdate({
          target: [ariRestrictions.ratePlanChannexId, ariRestrictions.date],
          set: values,
        })
    }
  })
}

/** Load durable ARI state into a freshly booted memory store. */
export async function hydrateAriState(
  db: Db,
  store: DomainStore,
  networkId: number,
): Promise<void> {
  const [capRows, intentRows, noteRows, availRows, restRows] = await Promise.all([
    db
      .select()
      .from(networkCapabilities)
      .where(eq(networkCapabilities.networkId, networkId)),
    db
      .select()
      .from(ariWriteIntents)
      .where(eq(ariWriteIntents.networkId, networkId)),
    db
      .select()
      .from(calendarNotes)
      .where(eq(calendarNotes.networkId, networkId)),
    db
      .select()
      .from(ariAvailability)
      .where(eq(ariAvailability.networkId, networkId)),
    db
      .select()
      .from(ariRestrictions)
      .where(eq(ariRestrictions.networkId, networkId)),
  ])

  for (const row of capRows) {
    if (!store.networkCapabilities.some((c) => c.networkId === row.networkId)) {
      store.networkCapabilities.push({
        networkId: row.networkId,
        bookingCrsWrite: row.bookingCrsWrite,
        availabilityWrite: row.availabilityWrite,
        rateRestrictionWrite: row.rateRestrictionWrite,
        derivedRateWrite: row.derivedRateWrite,
        aiApply: row.aiApply,
        updatedAt: row.updatedAt.toISOString(),
      })
    }
  }
  for (const row of intentRows) {
    if (
      !store.ariWriteIntents.some(
        (i) => i.networkId === networkId && i.idempotencyKey === row.idempotencyKey,
      )
    ) {
      store.ariWriteIntents.push(intentRowToRecord(row))
    }
  }
  for (const row of noteRows) {
    if (!store.calendarNotes.some((n) => n.id === row.id && n.networkId === networkId)) {
      store.calendarNotes.push({
        id: row.id,
        networkId: row.networkId,
        propertyId: row.propertyId,
        date: row.date,
        body: row.body,
        createdByUserId: row.createdByUserId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })
    }
  }
  for (const row of availRows) {
    if (
      !store.ariAvailability.some(
        (a) => a.roomTypeId === row.roomTypeId && a.date === row.date,
      )
    ) {
      store.ariAvailability.push({
        networkId: row.networkId,
        propertyId: row.propertyId,
        roomTypeId: row.roomTypeId,
        date: row.date,
        availability: row.availability,
        snapshotVersion: row.snapshotVersion,
        pulledAt: row.pulledAt.toISOString(),
      })
    }
  }
  for (const row of restRows) {
    if (
      !store.ariRestrictions.some(
        (r) =>
          r.ratePlanChannexId === row.ratePlanChannexId && r.date === row.date,
      )
    ) {
      store.ariRestrictions.push({
        networkId: row.networkId,
        propertyId: row.propertyId,
        ratePlanChannexId: row.ratePlanChannexId,
        date: row.date,
        rateMinor: row.rateMinor,
        minStayArrival: row.minStayArrival,
        minStayThrough: row.minStayThrough,
        maxStay: row.maxStay,
        closedToArrival: row.closedToArrival,
        closedToDeparture: row.closedToDeparture,
        stopSell: row.stopSell,
        snapshotVersion: row.snapshotVersion,
        pulledAt: row.pulledAt.toISOString(),
      })
    }
  }
}