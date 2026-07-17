import { principalCanAccessProperty } from '@pms/auth'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import {
  requireOpsModule,
  runOpsCommand,
} from '../../utils/operations'
import {
  listScopedProperties,
} from '../../utils/reservations'

/**
 * POST /api/reviews/sync — stub Channex review import using local fixtures.
 * Body: { networkId, propertyId?, seed?: boolean }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    networkId: number
    propertyId?: number
    seed?: boolean
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'reviews')

  const properties = listScopedProperties(networkId, principal)
  const propertyId = body.propertyId ?? properties[0]?.id
  if (propertyId == null) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No property in scope for review import',
    })
  }
  if (!principalCanAccessProperty(principal, propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }

  const fixtures =
    body.seed === false
      ? []
      : [
          {
            propertyId,
            guestName: 'Fixture Guest',
            rating: 5,
            title: 'Great stay',
            comment: 'Imported fixture review (Channex sync stub).',
            source: 'fixture',
            status: 'pending' as const,
          },
          {
            propertyId,
            guestName: 'Another Guest',
            rating: 3,
            title: 'Okay',
            comment: 'Could use quieter nights.',
            source: 'fixture',
            status: 'pending' as const,
          },
        ]

  const result = await runOpsCommand(
    'importLocalReviews',
    principal,
    propertyId,
    { propertyId, reviews: fixtures },
  )
  return result.data
})
