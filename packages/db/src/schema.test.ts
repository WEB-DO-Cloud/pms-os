import { describe, expect, it } from 'vitest'
import {
  ackOutbox,
  bookingRevisions,
  fieldOwnership,
  networks,
  ownerProperties,
  paymentLedger,
  physicalRooms,
  properties,
  reservations,
  roomTypes,
  syncCursors,
  syncDeadLetters,
  webhookDedupe,
} from './schema'
import { getTableConfig } from 'drizzle-orm/pg-core'

function uniqueNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).indexes.filter((i) => i.config.unique).map((i) => i.config.name)
}

describe('db schema invariants', () => {
  it('enforces per-network Channex uniqueness indexes', () => {
    expect(uniqueNames(properties)).toContain('properties_network_channex_uidx')
    expect(uniqueNames(roomTypes)).toContain('room_types_network_channex_uidx')
    expect(uniqueNames(reservations)).toContain('reservations_network_channex_booking_uidx')
    expect(uniqueNames(bookingRevisions)).toContain('booking_revisions_network_revision_uidx')
  })

  it('includes sync control tables for cursor, dedupe, ack outbox, and dead letters', () => {
    expect(getTableConfig(syncCursors).name).toBe('sync_cursors')
    expect(getTableConfig(webhookDedupe).name).toBe('webhook_dedupe')
    expect(getTableConfig(ackOutbox).name).toBe('ack_outbox')
    expect(getTableConfig(syncDeadLetters).name).toBe('sync_dead_letters')
  })

  it('stores money as integer minor units and stays as property-local date strings', () => {
    const cols = getTableConfig(reservations).columns
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]))
    expect(byName.total_amount_minor.getSQLType()).toContain('integer')
    expect(byName.check_in_date.getSQLType()).toBe('text')
    expect(byName.check_out_date.getSQLType()).toBe('text')
    expect(byName.currency.getSQLType()).toBe('text')

    const ledgerCols = Object.fromEntries(
      getTableConfig(paymentLedger).columns.map((c) => [c.name, c]),
    )
    expect(ledgerCols.amount_minor.getSQLType()).toContain('integer')
  })

  it('supports owner-property scoping junctions', () => {
    expect(uniqueNames(ownerProperties)).toContain('owner_properties_property_user_uidx')
  })

  it('defines PMS vs Channex field ownership matrix', () => {
    expect(fieldOwnership.reservations.pmsOwned).toContain('staffNotes')
    expect(fieldOwnership.reservations.pmsOwned).toContain('roomId')
    expect(fieldOwnership.reservations.channexOwned).toContain('channexBookingId')
    expect(fieldOwnership.reservations.channexOwned).toContain('roomTypeId')
    expect(fieldOwnership.physicalRooms.pmsOwned).toContain('label')
    expect(fieldOwnership.guests.pmsOwned).toContain('vip')
  })

  it('requires network slug uniqueness', () => {
    expect(uniqueNames(networks)).toContain('networks_slug_uidx')
  })

  it('supports soft-archive without cascade-deleting historical rows', () => {
    const propertyCols = Object.fromEntries(
      getTableConfig(properties).columns.map((c) => [c.name, c]),
    )
    expect(propertyCols.archived_at).toBeDefined()
    expect(propertyCols.status.enumValues).toContain('archived')

    // Historical bookings keep restrict FKs to properties (verified in generated SQL too).
    const propertyFk = getTableConfig(reservations).foreignKeys.find((fk) => {
      const cols = fk.reference().columns.map((c) => c.name)
      return cols.includes('property_id')
    })
    expect(propertyFk?.onDelete).toBe('restrict')
  })

  it('models physical rooms with stable slot uniqueness and reservation room assignment', () => {
    expect(getTableConfig(physicalRooms).name).toBe('physical_rooms')
    expect(uniqueNames(physicalRooms)).toContain('physical_rooms_type_slot_uidx')
    expect(uniqueNames(physicalRooms)).toContain('physical_rooms_property_label_uidx')
    const roomCols = Object.fromEntries(
      getTableConfig(physicalRooms).columns.map((c) => [c.name, c]),
    )
    expect(roomCols.slot_index).toBeDefined()
    expect(roomCols.label).toBeDefined()
    expect(roomCols.archived_at).toBeDefined()

    const resCols = Object.fromEntries(
      getTableConfig(reservations).columns.map((c) => [c.name, c]),
    )
    expect(resCols.room_id).toBeDefined()
    const roomFk = getTableConfig(reservations).foreignKeys.find((fk) =>
      fk.reference().columns.some((c) => c.name === 'room_id'),
    )
    expect(roomFk?.onDelete).toBe('set null')
  })
})
