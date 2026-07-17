import {
  account,
  isMemberRole,
  isNetworkWideRole,
  type MemberRole,
  user,
} from '@pms/auth'
import {
  networkMemberships,
  ownerProperties,
  properties,
  propertyMemberships,
} from '@pms/db'
import { hashPassword } from 'better-auth/crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDb, requirePrincipal } from './auth'
import { writeAuditEvent } from './audit'

export function requireTeamManager(
  role: string | null | undefined,
): asserts role is 'org_admin' | 'manager' {
  if (role !== 'org_admin' && role !== 'manager') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}

export async function requireTeamAccess(
  event: { headers: Headers },
  networkId: number,
) {
  const resolved = await requirePrincipal(event, networkId)
  if (resolved.principal.networkId !== networkId) {
    throw createError({ statusCode: 403, statusMessage: 'Network mismatch' })
  }
  requireTeamManager(resolved.principal.role)
  return resolved
}

export type TeamMemberRow = {
  userId: string
  name: string
  email: string
  role: MemberRole
  propertyIds: number[]
  ownerPropertyIds: number[]
  networkWide: boolean
  createdAt: string
}

export async function listTeamMembers(networkId: number): Promise<TeamMemberRow[]> {
  const db = getDb()
  const rows = await db
    .select({
      userId: networkMemberships.userId,
      role: networkMemberships.role,
      createdAt: networkMemberships.createdAt,
      name: user.name,
      email: user.email,
    })
    .from(networkMemberships)
    .innerJoin(user, eq(user.id, networkMemberships.userId))
    .where(eq(networkMemberships.networkId, networkId))

  if (rows.length === 0) return []

  const userIds = rows.map((r) => r.userId)
  const [propRows, ownerRows] = await Promise.all([
    db
      .select({
        userId: propertyMemberships.userId,
        propertyId: propertyMemberships.propertyId,
      })
      .from(propertyMemberships)
      .where(
        and(
          eq(propertyMemberships.networkId, networkId),
          inArray(propertyMemberships.userId, userIds),
        ),
      ),
    db
      .select({
        userId: ownerProperties.userId,
        propertyId: ownerProperties.propertyId,
      })
      .from(ownerProperties)
      .where(
        and(
          eq(ownerProperties.networkId, networkId),
          inArray(ownerProperties.userId, userIds),
        ),
      ),
  ])

  const propsByUser = new Map<string, number[]>()
  for (const p of propRows) {
    const list = propsByUser.get(p.userId) ?? []
    list.push(p.propertyId)
    propsByUser.set(p.userId, list)
  }
  const ownersByUser = new Map<string, number[]>()
  for (const p of ownerRows) {
    const list = ownersByUser.get(p.userId) ?? []
    list.push(p.propertyId)
    ownersByUser.set(p.userId, list)
  }

  return rows.map((r) => {
    const role = r.role as MemberRole
    return {
      userId: r.userId,
      name: r.name,
      email: r.email,
      role,
      propertyIds: propsByUser.get(r.userId) ?? [],
      ownerPropertyIds: ownersByUser.get(r.userId) ?? [],
      networkWide: isNetworkWideRole(role),
      createdAt: r.createdAt.toISOString(),
    }
  })
}

export async function listNetworkPropertyOptions(networkId: number) {
  const db = getDb()
  return db
    .select({
      id: properties.id,
      name: properties.name,
      city: properties.city,
    })
    .from(properties)
    .where(eq(properties.networkId, networkId))
}

export async function countOrgAdmins(networkId: number): Promise<number> {
  const db = getDb()
  const rows = await db
    .select({ userId: networkMemberships.userId })
    .from(networkMemberships)
    .where(
      and(
        eq(networkMemberships.networkId, networkId),
        eq(networkMemberships.role, 'org_admin'),
      ),
    )
  return rows.length
}

export async function setMemberPropertyScope(
  networkId: number,
  userId: string,
  role: MemberRole,
  propertyIds: number[],
) {
  const db = getDb()
  const unique = [...new Set(propertyIds.filter((id) => Number.isFinite(id) && id > 0))]

  await db
    .delete(propertyMemberships)
    .where(
      and(
        eq(propertyMemberships.networkId, networkId),
        eq(propertyMemberships.userId, userId),
      ),
    )
  await db
    .delete(ownerProperties)
    .where(
      and(eq(ownerProperties.networkId, networkId), eq(ownerProperties.userId, userId)),
    )

  if (isNetworkWideRole(role)) return

  if (role === 'property_owner') {
    if (unique.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Property owners need at least one property',
      })
    }
    await db.insert(ownerProperties).values(
      unique.map((propertyId) => ({ networkId, userId, propertyId })),
    )
    return
  }

  if (unique.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Scoped roles need at least one property',
    })
  }
  await db.insert(propertyMemberships).values(
    unique.map((propertyId) => ({ networkId, userId, propertyId })),
  )
}

export async function inviteTeamMember(input: {
  networkId: number
  actorUserId: string
  name: string
  email: string
  password?: string
  role: MemberRole
  propertyIds: number[]
}) {
  if (!isMemberRole(input.role)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid role' })
  }

  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  if (!email || !name) {
    throw createError({ statusCode: 400, statusMessage: 'Name and email required' })
  }

  const db = getDb()
  const [existing] = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1)

  let userId = existing?.id
  let createdUser = false

  if (!userId) {
    const password = input.password?.trim() ?? ''
    if (password.length < 8) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Password required (min 8) for new users',
      })
    }
    // Insert user + credential account directly so invite never replaces the
    // admin's browser session the way signUpEmail would.
    userId = randomUUID()
    const now = new Date()
    const hashed = await hashPassword(password)
    await db.insert(user).values({
      id: userId,
      name,
      email,
      emailVerified: false,
      role: 'user',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: hashed,
      createdAt: now,
      updatedAt: now,
    })
    createdUser = true
  }

  const [already] = await db
    .select({ id: networkMemberships.id })
    .from(networkMemberships)
    .where(
      and(
        eq(networkMemberships.networkId, input.networkId),
        eq(networkMemberships.userId, userId),
      ),
    )
    .limit(1)
  if (already) {
    throw createError({
      statusCode: 409,
      statusMessage: 'User is already a member of this network',
    })
  }

  await db.insert(networkMemberships).values({
    networkId: input.networkId,
    userId,
    role: input.role,
  })
  await setMemberPropertyScope(input.networkId, userId, input.role, input.propertyIds)

  await writeAuditEvent({
    networkId: input.networkId,
    principalType: 'user',
    principalId: input.actorUserId,
    action: 'team.member.invite',
    resourceType: 'user',
    resourceId: userId,
    metadata: { role: input.role, createdUser, email },
  })

  return { userId, createdUser, email, role: input.role }
}

export async function updateTeamMember(input: {
  networkId: number
  actorUserId: string
  targetUserId: string
  role?: MemberRole
  propertyIds?: number[]
}) {
  const db = getDb()
  const [row] = await db
    .select()
    .from(networkMemberships)
    .where(
      and(
        eq(networkMemberships.networkId, input.networkId),
        eq(networkMemberships.userId, input.targetUserId),
      ),
    )
    .limit(1)
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  }

  const nextRole = input.role ?? (row.role as MemberRole)
  if (!isMemberRole(nextRole)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid role' })
  }

  if (row.role === 'org_admin' && nextRole !== 'org_admin') {
    const admins = await countOrgAdmins(input.networkId)
    if (admins <= 1) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Cannot demote the last organization admin',
      })
    }
  }

  if (input.role && input.role !== row.role) {
    await db
      .update(networkMemberships)
      .set({ role: nextRole })
      .where(eq(networkMemberships.id, row.id))
  }

  if (input.propertyIds !== undefined || input.role) {
    const propertyIds =
      input.propertyIds ??
      (
        await db
          .select({ propertyId: propertyMemberships.propertyId })
          .from(propertyMemberships)
          .where(
            and(
              eq(propertyMemberships.networkId, input.networkId),
              eq(propertyMemberships.userId, input.targetUserId),
            ),
          )
      ).map((p) => p.propertyId)
    const ownerIds =
      input.propertyIds ??
      (
        await db
          .select({ propertyId: ownerProperties.propertyId })
          .from(ownerProperties)
          .where(
            and(
              eq(ownerProperties.networkId, input.networkId),
              eq(ownerProperties.userId, input.targetUserId),
            ),
          )
      ).map((p) => p.propertyId)

    const ids = input.propertyIds ?? (nextRole === 'property_owner' ? ownerIds : propertyIds)
    await setMemberPropertyScope(input.networkId, input.targetUserId, nextRole, ids)
  }

  await writeAuditEvent({
    networkId: input.networkId,
    principalType: 'user',
    principalId: input.actorUserId,
    action: 'team.member.update',
    resourceType: 'user',
    resourceId: input.targetUserId,
    metadata: { role: nextRole, propertyIds: input.propertyIds },
  })

  return { userId: input.targetUserId, role: nextRole }
}

export async function removeTeamMember(input: {
  networkId: number
  actorUserId: string
  targetUserId: string
}) {
  if (input.actorUserId === input.targetUserId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'You cannot remove yourself',
    })
  }

  const db = getDb()
  const [row] = await db
    .select()
    .from(networkMemberships)
    .where(
      and(
        eq(networkMemberships.networkId, input.networkId),
        eq(networkMemberships.userId, input.targetUserId),
      ),
    )
    .limit(1)
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found' })
  }

  if (row.role === 'org_admin') {
    const admins = await countOrgAdmins(input.networkId)
    if (admins <= 1) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Cannot remove the last organization admin',
      })
    }
  }

  await db
    .delete(propertyMemberships)
    .where(
      and(
        eq(propertyMemberships.networkId, input.networkId),
        eq(propertyMemberships.userId, input.targetUserId),
      ),
    )
  await db
    .delete(ownerProperties)
    .where(
      and(
        eq(ownerProperties.networkId, input.networkId),
        eq(ownerProperties.userId, input.targetUserId),
      ),
    )
  await db.delete(networkMemberships).where(eq(networkMemberships.id, row.id))

  await writeAuditEvent({
    networkId: input.networkId,
    principalType: 'user',
    principalId: input.actorUserId,
    action: 'team.member.remove',
    resourceType: 'user',
    resourceId: input.targetUserId,
    metadata: { role: row.role },
  })

  return { ok: true as const }
}
