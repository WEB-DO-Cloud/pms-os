import type { ChannexPropertyAttrs } from '../channex/types'

export type PropertyUpsertInput = {
  networkId: number
  channexId: string
  name: string
  slug: string
  address?: string | null
  city?: string | null
  country?: string | null
  timezone?: string | null
  currency?: string | null
  channexTitle?: string | null
  channexRaw: unknown
  sourceUpdatedAt?: string | null
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'property'
}

export function mapChannexProperty(
  networkId: number,
  channexId: string,
  attrs: ChannexPropertyAttrs,
  raw: unknown,
): PropertyUpsertInput {
  const title = attrs.title?.trim() || `Property ${channexId}`
  return {
    networkId,
    channexId,
    name: title,
    slug: slugify(title),
    address: attrs.address ?? null,
    city: attrs.city ?? null,
    country: attrs.country ?? null,
    timezone: attrs.timezone ?? null,
    currency: attrs.currency ?? null,
    channexTitle: title,
    channexRaw: raw,
    sourceUpdatedAt: attrs.updated_at ?? null,
  }
}
