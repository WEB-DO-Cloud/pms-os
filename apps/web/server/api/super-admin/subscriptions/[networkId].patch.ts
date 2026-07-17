import { eq } from 'drizzle-orm'
import { networkEntitlements, networks } from '@pms/db'
import { billingSnapshot } from '@pms/licensing'
import { getDb, requirePlatformAdmin } from '../../../utils/auth'
import { writeAuditEvent } from '../../../utils/audit'

/**
 * PATCH /api/super-admin/subscriptions/:networkId
 * Update SaaS entitlements / active flag for a tenant network.
 */
export default defineEventHandler(async (event) => {
  const admin = await requirePlatformAdmin(event)
  const networkId = Number(getRouterParam(event, 'networkId'))
  if (!Number.isFinite(networkId)) {
    throw createError({ statusCode: 400, statusMessage: 'networkId required' })
  }

  const body = await readBody<{
    multiNetwork?: boolean
    whiteLabel?: boolean
    isActive?: boolean
    channexGroupId?: string | null
  }>(event)

  const db = getDb()
  const [network] = await db
    .select()
    .from(networks)
    .where(eq(networks.id, networkId))
    .limit(1)
  if (!network) {
    throw createError({ statusCode: 404, statusMessage: 'Network not found' })
  }

  if (body.isActive !== undefined || body.channexGroupId !== undefined) {
    const patch: { isActive?: boolean; channexGroupId?: string | null; updatedAt: Date } = {
      updatedAt: new Date(),
    }
    if (body.isActive !== undefined) patch.isActive = body.isActive === true
    if (body.channexGroupId !== undefined) {
      const trimmed = body.channexGroupId?.trim()
      patch.channexGroupId = trimmed ? trimmed : null
    }
    await db.update(networks).set(patch).where(eq(networks.id, networkId))
  }

  if (body.multiNetwork !== undefined || body.whiteLabel !== undefined) {
    const [existing] = await db
      .select()
      .from(networkEntitlements)
      .where(eq(networkEntitlements.networkId, networkId))
      .limit(1)

    if (existing) {
      await db
        .update(networkEntitlements)
        .set({
          multiNetwork:
            body.multiNetwork !== undefined
              ? body.multiNetwork === true
              : existing.multiNetwork,
          whiteLabel:
            body.whiteLabel !== undefined
              ? body.whiteLabel === true
              : existing.whiteLabel,
          updatedAt: new Date(),
        })
        .where(eq(networkEntitlements.networkId, networkId))
    } else {
      await db.insert(networkEntitlements).values({
        networkId,
        multiNetwork: body.multiNetwork === true,
        whiteLabel: body.whiteLabel === true,
      })
    }
  }

  const [ent] = await db
    .select()
    .from(networkEntitlements)
    .where(eq(networkEntitlements.networkId, networkId))
    .limit(1)
  const [fresh] = await db
    .select()
    .from(networks)
    .where(eq(networks.id, networkId))
    .limit(1)

  const entitlements = {
    multiNetwork: ent?.multiNetwork === true,
    whiteLabel: ent?.whiteLabel === true,
  }

  await writeAuditEvent({
    networkId,
    principalType: 'super_admin',
    principalId: admin.user.id,
    action: 'super_admin.subscription.update',
    resourceType: 'network',
    resourceId: String(networkId),
    metadata: {
      entitlements,
      isActive: fresh?.isActive,
      channexGroupId: fresh?.channexGroupId,
    },
  })

  return {
    network: {
      id: fresh!.id,
      name: fresh!.name,
      slug: fresh!.slug,
      isActive: fresh!.isActive,
      channexGroupId: fresh!.channexGroupId,
      entitlements,
      billing: billingSnapshot(entitlements),
    },
  }
})
