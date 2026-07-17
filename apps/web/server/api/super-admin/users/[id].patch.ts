import { eq } from 'drizzle-orm'
import { user } from '@pms/auth'
import { getDb, requirePlatformAdmin } from '../../../utils/auth'
import { writeAuditEvent } from '../../../utils/audit'
import { isSuperAdminEmail } from '../../../utils/super-admin'

/** PATCH /api/super-admin/users/:id — update profile fields. */
export default defineEventHandler(async (event) => {
  const admin = await requirePlatformAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'User id required' })
  }

  const body = await readBody<{
    name?: string
    email?: string
  }>(event)

  const db = getDb()
  const [existing] = await db.select().from(user).where(eq(user.id, id)).limit(1)
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const nextName = body.name?.trim()
  const nextEmail = body.email?.trim().toLowerCase()
  if (nextName !== undefined && nextName.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  }
  if (nextEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid email is required' })
  }

  // Keep platform admins from demoting themselves via email change off the allowlist.
  if (
    nextEmail &&
    existing.email.toLowerCase() !== nextEmail &&
    isSuperAdminEmail(existing.email) &&
    !isSuperAdminEmail(nextEmail)
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot move a super admin email off the allowlist.',
    })
  }

  const [updated] = await db
    .update(user)
    .set({
      ...(nextName !== undefined ? { name: nextName } : {}),
      ...(nextEmail !== undefined ? { email: nextEmail } : {}),
      updatedAt: new Date(),
    })
    .where(eq(user.id, id))
    .returning()

  await writeAuditEvent({
    principalType: 'super_admin',
    principalId: admin.user.id,
    action: 'super_admin.user.update',
    resourceType: 'user',
    resourceId: id,
    metadata: {
      name: updated?.name,
      email: updated?.email,
    },
  })

  return {
    user: {
      id: updated!.id,
      name: updated!.name,
      email: updated!.email,
      platformRole: updated!.role,
      banned: updated!.banned === true,
    },
  }
})
