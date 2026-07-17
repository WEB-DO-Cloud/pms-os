import {
  APP_MODULES,
  MEMBER_ROLES,
  PRIVILEGED_ACTIONS,
  canAccessModule,
  canPerformAction,
  isNetworkWideRole,
  type MemberRole,
} from '@pms/auth'
import { parseNetworkId } from '../../utils/integrations'
import {
  listNetworkPropertyOptions,
  listTeamMembers,
  requireTeamAccess,
} from '../../utils/team'

/** GET /api/settings/team?networkId= — members, properties, and role matrix. */
export default defineEventHandler(async (event) => {
  const networkId = parseNetworkId(getQuery(event).networkId)
  await requireTeamAccess(event, networkId)

  const [members, propertyOptions] = await Promise.all([
    listTeamMembers(networkId),
    listNetworkPropertyOptions(networkId),
  ])

  const matrix = MEMBER_ROLES.map((role) => ({
    role,
    networkWide: isNetworkWideRole(role),
    modules: APP_MODULES.filter((m) => canAccessModule(role, m)),
    actions: PRIVILEGED_ACTIONS.filter((a) => canPerformAction(role, a)),
  }))

  return {
    networkId,
    roles: MEMBER_ROLES as readonly MemberRole[],
    members,
    properties: propertyOptions,
    matrix,
  }
})
