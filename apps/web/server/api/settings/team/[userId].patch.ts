import { isMemberRole, type MemberRole } from '@pms/auth'
import { parseNetworkId } from '../../../utils/integrations'
import { requireTeamAccess, updateTeamMember } from '../../../utils/team'

type Body = {
  networkId?: number
  role?: string
  propertyIds?: number[]
}

/** PATCH /api/settings/team/:userId — update role and/or property scope. */
export default defineEventHandler(async (event) => {
  const targetUserId = getRouterParam(event, 'userId')
  if (!targetUserId) {
    throw createError({ statusCode: 400, statusMessage: 'userId required' })
  }

  const body = (await readBody(event).catch(() => ({}))) as Body
  const networkId = parseNetworkId(body.networkId)
  const { session } = await requireTeamAccess(event, networkId)

  if (body.role !== undefined && !isMemberRole(body.role)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid role' })
  }

  const result = await updateTeamMember({
    networkId,
    actorUserId: session.user.id,
    targetUserId,
    role: body.role as MemberRole | undefined,
    propertyIds: Array.isArray(body.propertyIds)
      ? body.propertyIds.map(Number)
      : undefined,
  })

  return { ok: true, ...result }
})
