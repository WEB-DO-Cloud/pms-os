import { eq } from 'drizzle-orm'
import { networks } from '@pms/db'
import type { Entitlements } from '@pms/licensing'
import {
  assertWhiteLabel,
  canConfigureWhiteLabel,
} from '@pms/licensing'
import { getDb } from './auth'

export type NetworkBranding = {
  networkId: number
  displayName: string | null
  logoUrl: string | null
  accentColor: string | null
}

/** In-memory fallback when DATABASE_URL is unset (unit tests). */
const brandingByNetwork = new Map<number, NetworkBranding>()

function emptyBranding(networkId: number): NetworkBranding {
  return {
    networkId,
    displayName: null,
    logoUrl: null,
    accentColor: null,
  }
}

function useDb() {
  return Boolean(process.env.DATABASE_URL)
}

export async function getNetworkBranding(
  networkId: number,
): Promise<NetworkBranding> {
  if (!useDb()) {
    return brandingByNetwork.get(networkId) ?? emptyBranding(networkId)
  }
  const db = getDb()
  const [row] = await db
    .select({
      id: networks.id,
      logoUrl: networks.logoUrl,
      displayName: networks.brandDisplayName,
      accentColor: networks.brandAccentColor,
    })
    .from(networks)
    .where(eq(networks.id, networkId))
    .limit(1)
  if (!row) return emptyBranding(networkId)
  return {
    networkId: row.id,
    displayName: row.displayName,
    logoUrl: row.logoUrl,
    accentColor: row.accentColor,
  }
}

export async function whiteLabelUiState(
  entitlements?: Partial<Entitlements> | null,
  networkId?: number,
) {
  const enabled = canConfigureWhiteLabel(entitlements)
  return {
    enabled,
    branding:
      enabled && networkId != null
        ? await getNetworkBranding(networkId)
        : null,
  }
}

/**
 * Persist white-label branding to the network row.
 * Fail closed without commercial white-label entitlement.
 */
export async function saveNetworkBranding(
  entitlements: Partial<Entitlements> | null | undefined,
  input: {
    networkId: number
    displayName?: string | null
    logoUrl?: string | null
    accentColor?: string | null
  },
): Promise<NetworkBranding> {
  assertWhiteLabel(entitlements)
  const current = await getNetworkBranding(input.networkId)
  const next: NetworkBranding = {
    networkId: input.networkId,
    displayName:
      input.displayName !== undefined
        ? normalizeOptional(input.displayName)
        : current.displayName,
    logoUrl:
      input.logoUrl !== undefined
        ? normalizeLogoUrl(input.logoUrl)
        : current.logoUrl,
    accentColor:
      input.accentColor !== undefined
        ? normalizeAccent(input.accentColor)
        : current.accentColor,
  }

  if (!useDb()) {
    brandingByNetwork.set(input.networkId, next)
    return next
  }

  const db = getDb()
  await db
    .update(networks)
    .set({
      logoUrl: next.logoUrl,
      brandDisplayName: next.displayName,
      brandAccentColor: next.accentColor,
      updatedAt: new Date(),
    })
    .where(eq(networks.id, input.networkId))

  return next
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeLogoUrl(value: string | null | undefined): string | null {
  const trimmed = normalizeOptional(value)
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('logoUrl must be an http(s) URL')
    }
    return url.toString()
  } catch {
    throw new Error('logoUrl must be a valid URL')
  }
}

function normalizeAccent(value: string | null | undefined): string | null {
  const trimmed = normalizeOptional(value)
  if (!trimmed) return null
  if (!/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    throw new Error('accentColor must be a #RRGGBB hex color')
  }
  return trimmed.toLowerCase()
}

/** Test helper to clear in-memory branding. */
export function clearBrandingStore() {
  brandingByNetwork.clear()
}
