import { principalCanAccessProperty } from '@pms/auth'
import type { CalendarNoteRecord } from '@pms/domain'
import { getDb, requirePrincipal } from '../../../utils/auth'
import { parseNetworkId } from '../../../utils/integrations'
import { requireOpsModule, runOpsCommand } from '../../../utils/operations'
import { ensureSecretsHydrated } from '../../../utils/sync'

/** PATCH /api/calendar/notes/:id — edit a calendar note body. */
export default defineEventHandler(async (event) => {
  const noteId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(noteId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid note id' })
  }
  const body = await readBody<{
    networkId: number
    propertyId: number
    body: string
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'calendar')
  if (!principalCanAccessProperty(principal, body.propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }
  await ensureSecretsHydrated(networkId)

  const result = await runOpsCommand('updateCalendarNote', principal, body.propertyId, {
    noteId,
    propertyId: body.propertyId,
    body: body.body,
  })
  const note = result.data as CalendarNoteRecord

  if (process.env.DATABASE_URL) {
    const { updatePersistedCalendarNote } = await import('../../../lib/ari-persistence')
    await updatePersistedCalendarNote(getDb(), note)
  }

  return { note }
})
