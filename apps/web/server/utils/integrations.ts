import { canPerformAction, type PrivilegedAction } from '@pms/auth'
import { networkSecrets } from '@pms/db'
import {
  createChannexClient,
  encryptSecret,
  maskSecret,
  toPublicSecretStatus,
  type NetworkSecretKind,
} from '@pms/sync'
import { and, eq } from 'drizzle-orm'
import { getDb, requirePrincipal } from './auth'
import { isCommercialEdition } from './edition'
import { ensureSecretsHydrated, getSyncStore } from './sync'

type RoleLike = Parameters<typeof canPerformAction>[0]

/** Pure role gate for integrations privileged action (testable without Nuxt). */
export function canManageIntegrations(role: RoleLike): boolean {
  return canPerformAction(role, 'integrations' satisfies PrivilegedAction)
}

export async function requireIntegrationsAccess(event: { headers: Headers }, networkId?: number) {
  const resolved = await requirePrincipal(event, networkId)
  if (!canManageIntegrations(resolved.principal.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return resolved
}

export function parseNetworkId(raw: unknown): number {
  const networkId = Number(raw)
  if (!Number.isFinite(networkId) || networkId < 1) {
    throw createError({ statusCode: 400, statusMessage: 'networkId required' })
  }
  return networkId
}

/**
 * Encrypt + upsert a network secret to PG and the in-memory sync store.
 * Never returns plaintext.
 */
export async function saveNetworkSecret(
  networkId: number,
  kind: NetworkSecretKind,
  plaintext: string,
) {
  const trimmed = plaintext.trim()
  if (!trimmed) {
    throw createError({ statusCode: 400, statusMessage: `${kind} required` })
  }

  const material = encryptSecret(trimmed)
  const db = getDb()
  const existing = await db
    .select({ id: networkSecrets.id })
    .from(networkSecrets)
    .where(and(eq(networkSecrets.networkId, networkId), eq(networkSecrets.kind, kind)))
    .then((rows) => rows[0])

  const now = new Date()
  if (existing) {
    await db
      .update(networkSecrets)
      .set({
        ciphertext: material.ciphertext,
        iv: material.iv,
        keyVersion: material.keyVersion,
        lastRotatedAt: now,
        updatedAt: now,
      })
      .where(eq(networkSecrets.id, existing.id))
  } else {
    await db.insert(networkSecrets).values({
      networkId,
      kind,
      ciphertext: material.ciphertext,
      iv: material.iv,
      keyVersion: material.keyVersion,
      lastRotatedAt: now,
    })
  }

  const store = getSyncStore(networkId)
  store.setSecret(networkId, kind, material.ciphertext, material.iv, material.keyVersion)

  return {
    kind,
    configured: true,
    masked: maskSecret(trimmed),
    rotatedAt: now.toISOString(),
  }
}

export async function validateChannexApiKey(apiKey: string): Promise<void> {
  const client = createChannexClient({ apiKey: apiKey.trim() })
  try {
    await client.listProperties(1)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid Channex credentials'
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Channex API key',
      data: { code: 'CHANNEX_AUTH_FAILED', message },
    })
  }
}

export async function getCredentialStatus(networkId: number) {
  await ensureSecretsHydrated(networkId)
  const store = getSyncStore(networkId)
  return {
    networkId,
    // Commercial uses a platform master key; tenants don't manage Channex credentials.
    managed: isCommercialEdition(),
    apiKey: toPublicSecretStatus(store.getSecret(networkId, 'channex_api_key')),
    webhookSecret: toPublicSecretStatus(store.getSecret(networkId, 'channex_webhook_secret')),
  }
}

export type CredentialStatus = Awaited<ReturnType<typeof getCredentialStatus>>
