import { networks } from '@pms/db'
import { ChannexApiError, mapChannexProperty } from '@pms/sync'
import { eq } from 'drizzle-orm'
import { getDb } from './auth'
import { isCommercialEdition } from './edition'
import {
  ensureSecretsHydrated,
  getChannexClientForNetwork,
} from './sync'

export type OnboardingPropertyInput = {
  title: string
  propertyType: string
  currency: string
  timezone: string
  address: string
  city: string
  country: string
  state?: string
  zipCode?: string
}

/** Ensure the tenant has a Channex group (one per network) for property scoping. */
export async function ensureNetworkChannexGroup(networkId: number): Promise<string> {
  const db = getDb()
  const [net] = await db
    .select({
      id: networks.id,
      name: networks.name,
      channexGroupId: networks.channexGroupId,
    })
    .from(networks)
    .where(eq(networks.id, networkId))
    .limit(1)
  if (!net) {
    throw createError({ statusCode: 404, statusMessage: 'Network not found' })
  }
  if (net.channexGroupId) return net.channexGroupId

  const store = await ensureSecretsHydrated(networkId)
  const client = getChannexClientForNetwork(store, networkId)
  const res = await client.createGroup(net.name)
  const groupId = res.data.id
  await db
    .update(networks)
    .set({ channexGroupId: groupId, updatedAt: new Date() })
    .where(eq(networks.id, networkId))
  return groupId
}

/**
 * Commercial onboarding: create property in Channex under the tenant's group,
 * then upsert into the local sync catalog.
 */
export async function provisionOnboardingProperty(
  networkId: number,
  input: OnboardingPropertyInput,
) {
  if (!isCommercialEdition()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Property onboarding is only available on the commercial platform',
    })
  }

  const title = input.title.trim()
  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'Property name required' })
  }

  const groupId = await ensureNetworkChannexGroup(networkId)
  const store = await ensureSecretsHydrated(networkId)
  const client = getChannexClientForNetwork(store, networkId)

  try {
    const res = await client.createProperty({
      title,
      currency: input.currency.trim(),
      country: input.country.trim().toUpperCase(),
      city: input.city.trim(),
      address: input.address.trim(),
      timezone: input.timezone.trim(),
      property_type: input.propertyType.trim() || 'hotel',
      group_id: groupId,
      state: input.state?.trim() || undefined,
      zip_code: input.zipCode?.trim() || undefined,
    })

    const item = res.data
    const mapped = mapChannexProperty(networkId, item.id, item.attributes, item)
    const row = store.upsertProperty({
      ...mapped,
      timezone: mapped.timezone ?? null,
      currency: mapped.currency ?? null,
      address: mapped.address ?? null,
      city: mapped.city ?? null,
      country: mapped.country ?? null,
      channexTitle: mapped.channexTitle ?? null,
      sourceUpdatedAt: mapped.sourceUpdatedAt ?? null,
    })

    return {
      property: {
        id: row.id,
        channexId: row.channexId,
        name: row.name,
        slug: row.slug,
      },
      channexGroupId: groupId,
    }
  } catch (err) {
    if (err instanceof ChannexApiError) {
      throw createError({
        statusCode: err.status >= 400 && err.status < 500 ? err.status : 502,
        statusMessage: 'Channex could not create the property',
        data: { code: 'CHANNEX_CREATE_FAILED', message: err.message, body: err.body },
      })
    }
    throw err
  }
}
