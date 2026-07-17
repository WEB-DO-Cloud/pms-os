import {
  networkEntitlements,
  networkMemberships,
  networks,
} from '@pms/db'
import { and, eq } from 'drizzle-orm'
import { getAuth, getDb } from './auth'

export type ProvisionTenantInput = {
  name: string
  email: string
  password: string
  networkName: string
  headers: Headers
  /** Commercial entitlements for the new network (fail closed by default). */
  entitlements?: { multiNetwork?: boolean; whiteLabel?: boolean }
}

export type ProvisionTenantResult = {
  user: { id: string; email: string; name: string }
  network: { id: number; name: string; slug: string }
}

export function slugifyNetworkName(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'network'
  )
}

async function insertNetworkWithUniqueSlug(input: {
  name: string
  timezone?: string
  currency?: string
}) {
  const db = getDb()
  const baseSlug = slugifyNetworkName(input.name)
  let slug = baseSlug
  let attempt = 0
  while (attempt < 5) {
    try {
      const [created] = await db
        .insert(networks)
        .values({
          name: input.name,
          slug,
          timezone: input.timezone ?? 'America/Santo_Domingo',
          currency: input.currency ?? 'USD',
        })
        .returning()
      return created!
    } catch {
      attempt += 1
      slug = `${baseSlug}-${attempt + 1}`
    }
  }
  throw createError({
    statusCode: 500,
    statusMessage: 'Could not create network',
  })
}

/**
 * Create an org_admin user + network + membership + entitlement row.
 * Shared by community bootstrap and commercial signup.
 */
export async function provisionTenant(
  input: ProvisionTenantInput,
): Promise<ProvisionTenantResult> {
  const auth = getAuth()
  const signUp = await auth.api.signUpEmail({
    body: {
      name: input.name,
      email: input.email,
      password: input.password,
    },
    headers: input.headers,
  })

  const createdUser = signUp?.user
  if (!createdUser?.id) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Could not create user',
    })
  }

  const db = getDb()
  const network = await insertNetworkWithUniqueSlug({
    name: input.networkName,
  })

  await db.insert(networkMemberships).values({
    networkId: network.id,
    userId: createdUser.id,
    role: 'org_admin',
  })
  await db.insert(networkEntitlements).values({
    networkId: network.id,
    multiNetwork: input.entitlements?.multiNetwork === true,
    whiteLabel: input.entitlements?.whiteLabel === true,
  })

  return {
    user: {
      id: createdUser.id,
      email: createdUser.email,
      name: createdUser.name,
    },
    network: {
      id: network.id,
      name: network.name,
      slug: network.slug,
    },
  }
}

/**
 * Add another network for an existing user (commercial multi-network).
 * Copies entitlements / defaults from the source network they administer.
 */
export async function createAdditionalNetwork(input: {
  userId: string
  name: string
  sourceNetworkId: number
}): Promise<{ id: number; name: string; slug: string }> {
  const name = input.name.trim()
  if (name.length < 2) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Network name must be at least 2 characters',
    })
  }

  const db = getDb()
  const [source] = await db
    .select({
      role: networkMemberships.role,
      multiNetwork: networkEntitlements.multiNetwork,
      whiteLabel: networkEntitlements.whiteLabel,
      timezone: networks.timezone,
      currency: networks.currency,
    })
    .from(networkMemberships)
    .innerJoin(networks, eq(networks.id, networkMemberships.networkId))
    .leftJoin(
      networkEntitlements,
      eq(networkEntitlements.networkId, networkMemberships.networkId),
    )
    .where(
      and(
        eq(networkMemberships.userId, input.userId),
        eq(networkMemberships.networkId, input.sourceNetworkId),
      ),
    )
    .limit(1)

  if (!source) {
    throw createError({ statusCode: 403, statusMessage: 'Network access denied' })
  }
  if (source.role !== 'org_admin') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Only organization admins can create networks',
    })
  }
  if (source.multiNetwork !== true) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Multi-network is not enabled for this account',
    })
  }

  const network = await insertNetworkWithUniqueSlug({
    name,
    timezone: source.timezone ?? undefined,
    currency: source.currency ?? undefined,
  })

  await db.insert(networkMemberships).values({
    networkId: network.id,
    userId: input.userId,
    role: 'org_admin',
  })
  await db.insert(networkEntitlements).values({
    networkId: network.id,
    multiNetwork: true,
    whiteLabel: source.whiteLabel === true,
  })

  return {
    id: network.id,
    name: network.name,
    slug: network.slug,
  }
}
