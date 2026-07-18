import { principalCanAccessProperty } from '@pms/auth'
import { getDb, requirePrincipal } from '../../../utils/auth'
import { parseNetworkId } from '../../../utils/integrations'
import { requireOpsModule, runOpsCommand } from '../../../utils/operations'
import { ensureSecretsHydrated } from '../../../utils/sync'

/** DELETE /api/calendar/notes/:id?networkId=&propertyId= */
export default defineEventHandler(async (event) => {
  const noteId = Number(getRouterParam(event, 'id'))
  if (!Number.isFinite(noteId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid note id' })
  }
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const propertyId = Number(q.propertyId)
  if (!Number.isFinite(propertyId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid propertyId' })
  }
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'calendar')
  if (!principalCanAccessProperty(principal, propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }
  await ensureSecretsHydrated(networkId)

  await runOpsCommand('deleteCalendarNote', principal, propertyId, {
    noteId,
    propertyId,
  })

  if (process.env.DATABASE_URL) {
    const { deletePersistedCalendarNote } = await import('../../../lib/ari-persistence')
    await deletePersistedCalendarNote(getDb(), networkId, noteId)
  }

  return { deleted: true }
})
