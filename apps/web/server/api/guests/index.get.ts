import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import {
  requireOpsModule,
} from '../../utils/operations'
import {
  getDomainStore,
} from '../../utils/reservations'
import {
  projectGuestsForPrincipal,
} from '@pms/domain'

/** GET /api/guests?networkId= */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const networkId = parseNetworkId(q.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'guests')

  const store = getDomainStore(networkId)
  const guests = projectGuestsForPrincipal(
    store.reservations,
    store.guests,
    principal,
  )

  return { networkId, guests }
})
