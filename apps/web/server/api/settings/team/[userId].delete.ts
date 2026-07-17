import { parseNetworkId } from '../../../utils/integrations'
import { removeTeamMember, requireTeamAccess } from '../../../utils/team'

/** DELETE /api/settings/team/:userId?networkId= — remove membership. */
export default defineEventHandler(async (event) => {
  const targetUserId = getRouterParam(event, 'userId')
  if (!targetUserId) {
    throw createError({ statusCode: 400, statusMessage: 'userId required' })
  }

  const networkId = parseNetworkId(getQuery(event).networkId)
  const { session } = await requireTeamAccess(event, networkId)

  return removeTeamMember({
    networkId,
    actorUserId: session.user.id,
    targetUserId,
  })
})
