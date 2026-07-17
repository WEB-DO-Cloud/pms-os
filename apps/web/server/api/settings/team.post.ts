import { isMemberRole, type MemberRole } from '@pms/auth'
import { parseNetworkId } from '../../utils/integrations'
import { inviteTeamMember, requireTeamAccess } from '../../utils/team'

type Body = {
  networkId?: number
  name?: string
  email?: string
  password?: string
  role?: string
  propertyIds?: number[]
}

/** POST /api/settings/team — invite / add a network member. */
export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) as Body
  const networkId = parseNetworkId(body.networkId)
  const { session } = await requireTeamAccess(event, networkId)

  if (!isMemberRole(body.role)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid role' })
  }

  const result = await inviteTeamMember({
    networkId,
    actorUserId: session.user.id,
    name: body.name ?? '',
    email: body.email ?? '',
    password: body.password,
    role: body.role as MemberRole,
    propertyIds: Array.isArray(body.propertyIds) ? body.propertyIds.map(Number) : [],
  })

  return { ok: true, ...result }
})
