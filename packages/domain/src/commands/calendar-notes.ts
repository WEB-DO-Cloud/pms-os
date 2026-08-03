import type { CalendarNoteRecord, CommandDefinition } from '../store'

/**
 * PMS-owned lightweight notes on a property-local calendar date (R8).
 * Separate from tasks and reservation staff notes; no Channex coupling.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function findNote(
  store: { calendarNotes: CalendarNoteRecord[] },
  networkId: number,
  propertyId: number,
  noteId: number,
): CalendarNoteRecord {
  const note = store.calendarNotes.find(
    (n) => n.id === noteId && n.networkId === networkId && n.propertyId === propertyId,
  )
  if (!note) {
    throw Object.assign(new Error('Note not found in scope'), { code: 'NOT_FOUND' })
  }
  return note
}

function assertBody(body: string) {
  if (!body.trim()) {
    throw Object.assign(new Error('Note body is required'), { code: 'VALIDATION' })
  }
}

export type CreateCalendarNoteInput = {
  propertyId: number
  /** Property-local calendar date (YYYY-MM-DD). */
  date: string
  body: string
}

export const createCalendarNote: CommandDefinition<
  CreateCalendarNoteInput,
  CalendarNoteRecord
> = {
  name: 'createCalendarNote',
  module: 'calendar',
  allowedActorKinds: ['user'],
  risk: 'low',
  requiresApproval: false,
  supportsDryRun: true,
  needsExternalSyncRecovery: false,
  compensatingAction: 'none',
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, { store }) {
    if (!ISO_DATE.test(input.date)) {
      throw Object.assign(new Error('date must be YYYY-MM-DD'), { code: 'VALIDATION' })
    }
    assertBody(input.body)
    const now = new Date().toISOString()
    const note: CalendarNoteRecord = {
      id: store.nextId('calendar_note'),
      networkId: ctx.networkId,
      propertyId: input.propertyId,
      date: input.date,
      body: input.body.trim(),
      createdByUserId: ctx.principal.userId ?? null,
      createdAt: now,
      updatedAt: now,
    }
    store.calendarNotes.push(note)
    return { data: note, resourceType: 'calendar_note', resourceId: String(note.id) }
  },
}

export type UpdateCalendarNoteInput = {
  noteId: number
  propertyId: number
  body: string
}

export const updateCalendarNote: CommandDefinition<
  UpdateCalendarNoteInput,
  CalendarNoteRecord
> = {
  name: 'updateCalendarNote',
  module: 'calendar',
  allowedActorKinds: ['user'],
  risk: 'low',
  requiresApproval: false,
  supportsDryRun: true,
  needsExternalSyncRecovery: false,
  compensatingAction: 'none',
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, { store }) {
    assertBody(input.body)
    const note = findNote(store, ctx.networkId, input.propertyId, input.noteId)
    note.body = input.body.trim()
    note.updatedAt = new Date().toISOString()
    return { data: note, resourceType: 'calendar_note', resourceId: String(note.id) }
  },
}

export type DeleteCalendarNoteInput = {
  noteId: number
  propertyId: number
}

export const deleteCalendarNote: CommandDefinition<
  DeleteCalendarNoteInput,
  CalendarNoteRecord
> = {
  name: 'deleteCalendarNote',
  module: 'calendar',
  allowedActorKinds: ['user'],
  risk: 'low',
  requiresApproval: false,
  supportsDryRun: true,
  needsExternalSyncRecovery: false,
  compensatingAction: 'none',
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, { store }) {
    const note = findNote(store, ctx.networkId, input.propertyId, input.noteId)
    store.calendarNotes.splice(store.calendarNotes.indexOf(note), 1)
    return { data: note, resourceType: 'calendar_note', resourceId: String(note.id) }
  },
}
