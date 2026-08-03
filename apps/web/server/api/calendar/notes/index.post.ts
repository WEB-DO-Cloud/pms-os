import { principalCanAccessProperty } from '@pms/auth'
import type { CalendarNoteRecord } from '@pms/domain'
import { getDb, requirePrincipal } from '../../../utils/auth'
import { parseNetworkId } from '../../../utils/integrations'
import { requireOpsModule, runOpsCommand } from '../../../utils/operations'
import { getDomainStore } from '../../../utils/reservations'
import { ensureSecretsHydrated } from '../../../utils/sync'

/** POST /api/calendar/notes — createCalendarNote on a property-local date (R8). */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    networkId: number
    propertyId: number
    date: string
    body: string
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'calendar')
  if (!principalCanAccessProperty(principal, body.propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }
  await ensureSecretsHydrated(networkId)

  const result = await runOpsCommand('createCalendarNote', principal, body.propertyId, {
    propertyId: body.propertyId,
    date: body.date,
    body: body.body,
  })
  const note = result.data as CalendarNoteRecord

  // Write-through: notes must survive restarts; memory id follows the PG serial.
  if (process.env.DATABASE_URL) {
    const { persistCalendarNote } = await import('../../../lib/ari-persistence')
    const persisted = await persistCalendarNote(getDb(), note)
    const memory = getDomainStore(networkId).calendarNotes.find(
      (n) => n.id === note.id && n.networkId === networkId,
    )
    if (memory) memory.id = persisted.id
    note.id = persisted.id
  }

  return { note }
})
