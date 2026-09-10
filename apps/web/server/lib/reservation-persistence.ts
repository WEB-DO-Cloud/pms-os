import { and, eq } from 'drizzle-orm'
import { reservations, type Db } from '@pms/db'
import type { DomainStore, PaymentTermsSnapshot, ReservationRecord } from '@pms/domain'

type ReservationRow = typeof reservations.$inferSelect

export function reservationRowToRecord(row: ReservationRow): ReservationRecord {
  return {
    id: row.id,
    networkId: row.networkId,
    propertyId: row.propertyId,
    roomTypeId: row.roomTypeId,
    roomId: row.roomId,
    status: row.status,
    checkInDate: row.checkInDate,
    checkOutDate: row.checkOutDate,
    currency: row.currency,
    staffNotes: row.staffNotes,
    channexBookingId: row.channexBookingId,
    pendingSyncReason: row.pendingSyncReason,
    guestName: row.guestName,
    guestEmail: row.guestEmail,
    adults: row.adults,
    children: row.children,
    infants: row.infants,
    channel: row.channel,
    paymentCollect: row.paymentCollect,
    paymentType: row.paymentType,
    totalAmountMinor: row.totalAmountMinor,
    operationalStatus: row.operationalStatus,
    checkedInAt: row.checkedInAt?.toISOString() ?? null,
    checkedOutAt: row.checkedOutAt?.toISOString() ?? null,
    sourceRevisionId: row.sourceRevisionId,
    channexRaw: row.channexRaw,
    paymentTermsSnapshot: (row.paymentTermsSnapshot as PaymentTermsSnapshot | null) ?? null,
    confirmationToken: row.confirmationToken,
    quoteTokenHash: row.quoteTokenHash,
    publicIdempotencyKey: row.publicIdempotencyKey,
    stripeCheckoutSessionId: row.stripeCheckoutSessionId,
    stripeConnectedAccountId: row.stripeConnectedAccountId,
    stripeAmountTotal: row.stripeAmountTotal,
    checkoutExpiresAt: row.checkoutExpiresAt?.toISOString() ?? null,
    channexRaw: row.channexRaw,
  }
}

export async function persistPublicReservation(
  db: Db,
  record: ReservationRecord,
): Promise<ReservationRecord> {
  const [row] = await db
    .insert(reservations)
    .values({
      networkId: record.networkId,
      propertyId: record.propertyId,
      roomTypeId: record.roomTypeId ?? null,
      status: record.status as typeof reservations.$inferInsert.status,
      checkInDate: record.checkInDate,
      checkOutDate: record.checkOutDate,
      currency: record.currency,
      staffNotes: record.staffNotes,
      channexBookingId: record.channexBookingId,
      pendingSyncReason: record.pendingSyncReason,
      guestName: record.guestName,
      guestEmail: record.guestEmail ?? null,
      adults: record.adults ?? 1,
      children: record.children ?? 0,
      infants: record.infants ?? 0,
      channel: record.channel ?? 'direct',
      paymentCollect: record.paymentCollect ?? null,
      paymentType: record.paymentType ?? null,
      totalAmountMinor: record.totalAmountMinor ?? null,
      paymentTermsSnapshot: record.paymentTermsSnapshot ?? null,
      confirmationToken: record.confirmationToken ?? null,
      quoteTokenHash: record.quoteTokenHash ?? null,
      publicIdempotencyKey: record.publicIdempotencyKey ?? null,
      stripeCheckoutSessionId: record.stripeCheckoutSessionId ?? null,
      stripeConnectedAccountId: record.stripeConnectedAccountId ?? null,
      stripeAmountTotal: record.stripeAmountTotal ?? null,
      checkoutExpiresAt: record.checkoutExpiresAt
        ? new Date(record.checkoutExpiresAt)
        : null,
      channexRaw: record.channexRaw ?? null,
    })
    .returning()
  return reservationRowToRecord(row!)
}

export async function updateReservationPaymentHold(
  db: Db,
  id: number,
  patch: Partial<
    Pick<
      ReservationRecord,
      | 'status'
      | 'pendingSyncReason'
      | 'stripeCheckoutSessionId'
      | 'stripeConnectedAccountId'
      | 'stripeAmountTotal'
      | 'checkoutExpiresAt'
    >
  >,
) {
  await db
    .update(reservations)
    .set({
      status: patch.status as typeof reservations.$inferInsert.status | undefined,
      pendingSyncReason: patch.pendingSyncReason,
      stripeCheckoutSessionId: patch.stripeCheckoutSessionId,
      stripeConnectedAccountId: patch.stripeConnectedAccountId,
      stripeAmountTotal: patch.stripeAmountTotal,
      checkoutExpiresAt: patch.checkoutExpiresAt
        ? new Date(patch.checkoutExpiresAt)
        : undefined,
      updatedAt: new Date(),
    })
    .where(eq(reservations.id, id))
}

export async function hydrateReservations(
  db: Db,
  store: DomainStore,
  networkId: number,
) {
  if (store.reservations.some((r) => r.networkId === networkId)) return
  const rows = await db
    .select()
    .from(reservations)
    .where(eq(reservations.networkId, networkId))
  for (const row of rows) {
    const record = reservationRowToRecord(row)
    store.reservations.push(record)
    if (record.quoteTokenHash && !store.usedQuoteTokenHashes.includes(record.quoteTokenHash)) {
      store.usedQuoteTokenHashes.push(record.quoteTokenHash)
    }
  }
}

export async function findReservationByConfirmationToken(
  db: Db,
  token: string,
) {
  const [row] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.confirmationToken, token))
    .limit(1)
  return row ? reservationRowToRecord(row) : null
}

export async function findReservationByIdempotency(
  db: Db,
  networkId: number,
  key: string,
) {
  const [row] = await db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.networkId, networkId),
        eq(reservations.publicIdempotencyKey, key),
      ),
    )
    .limit(1)
  return row ? reservationRowToRecord(row) : null
}

export async function findReservationByQuoteHash(db: Db, hash: string) {
  const [row] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.quoteTokenHash, hash))
    .limit(1)
  return row ? reservationRowToRecord(row) : null
}

export async function findReservationByCheckoutSession(db: Db, sessionId: string) {
  const [row] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.stripeCheckoutSessionId, sessionId))
    .limit(1)
  return row ? reservationRowToRecord(row) : null
}

export async function persistPublicBookingOutcome(
  db: Db,
  reservation: ReservationRecord,
) {
  await updateReservationPaymentHold(db, reservation.id, {
    status: reservation.status,
    pendingSyncReason: reservation.pendingSyncReason,
    stripeCheckoutSessionId: reservation.stripeCheckoutSessionId,
    stripeConnectedAccountId: reservation.stripeConnectedAccountId,
    stripeAmountTotal: reservation.stripeAmountTotal,
    checkoutExpiresAt: reservation.checkoutExpiresAt,
  })
}
