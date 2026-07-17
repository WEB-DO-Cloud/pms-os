import {
  authorizeInternalSync,
  createChannexClient,
  createMemorySyncStore,
  encryptSecret,
  fetchAndApplyRevision,
  markSyncHealthy,
  processAckOutbox,
  resolveSecret,
  runBookingRevisionPull,
  runCatalogImport,
  toPublicSyncHealth,
  verifyChannexWebhook,
  extractRevisionIdFromWebhook,
  type NetworkSecretKind,
  type SyncStore,
} from '@pms/sync'
import { eq } from 'drizzle-orm'
import { networks, networkSecrets } from '@pms/db'
import { getDb } from './auth'
import { isCommercialEdition } from './edition'

const stores = new Map<number, SyncStore>()
const hydrated = new Set<number>()

export function getSyncStore(networkId: number): SyncStore {
  let store = stores.get(networkId)
  if (!store) {
    store = createMemorySyncStore()
    stores.set(networkId, store)
  }
  return store
}

/** Load encrypted secrets from PG into the memory store once per process. */
export async function ensureSecretsHydrated(networkId: number): Promise<SyncStore> {
  const store = getSyncStore(networkId)
  if (hydrated.has(networkId)) return store

  try {
    const db = getDb()
    const secretRows = await db
      .select()
      .from(networkSecrets)
      .where(eq(networkSecrets.networkId, networkId))
    for (const s of secretRows) {
      store.setSecret(
        networkId,
        s.kind as NetworkSecretKind,
        s.ciphertext,
        s.iv,
        s.keyVersion,
      )
    }
  } catch {
    // ponytail: DB may be unavailable in unit tests; memory/fixture secrets still work
  }

  // Commercial: the platform owns one Channex account. Seed the master API key and
  // webhook secret from env so tenants never supply (or see) Channex credentials.
  // Env overrides any per-network row. Community keeps per-network secrets.
  if (isCommercialEdition()) {
    seedEnvSecret(store, networkId, 'channex_api_key', process.env.CHANNEX_API_KEY)
    seedEnvSecret(store, networkId, 'channex_webhook_secret', process.env.CHANNEX_WEBHOOK_SECRET)
  }

  try {
    const { hydratePhysicalRooms } = await import('./physical-rooms')
    await hydratePhysicalRooms(store, networkId)
  } catch {
    // optional
  }

  hydrated.add(networkId)
  return store
}

function seedEnvSecret(
  store: SyncStore,
  networkId: number,
  kind: NetworkSecretKind,
  value: string | undefined,
) {
  const trimmed = value?.trim()
  if (!trimmed) return
  const material = encryptSecret(trimmed)
  store.setSecret(networkId, kind, material.ciphertext, material.iv, material.keyVersion)
}

export function getChannexClientForNetwork(store: SyncStore, networkId: number) {
  const row = store.getSecret(networkId, 'channex_api_key')
  if (!row) {
    throw createError({ statusCode: 400, statusMessage: 'Channex API key not configured' })
  }
  const apiKey = resolveSecret(row)
  return createChannexClient({ apiKey })
}

export async function requireInternalSyncAuth(
  event: {
    headers: Headers
    node?: { req?: { headers?: Record<string, string | string[] | undefined> } }
  },
  networkId?: number,
) {
  const secretHeader =
    event.headers.get('x-sync-internal-secret') ??
    event.headers.get('x-pms-sync-secret') ??
    undefined

  const secretAuth = authorizeInternalSync({ secretHeader })
  if (secretAuth) {
    return secretAuth
  }

  if (networkId == null) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const { resolveRequestPrincipal } = await import('./auth')
  const resolved = await resolveRequestPrincipal(event, networkId)
  const auth = authorizeInternalSync({
    sessionRole: resolved?.principal.role,
  })
  if (!auth) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return auth
}

export async function handleChannexWebhook(
  networkId: number,
  secretHeader: string | undefined,
  rawBody: string,
) {
  const store = await ensureSecretsHydrated(networkId)
  const verified = verifyChannexWebhook(store, networkId, secretHeader, rawBody)
  if (!verified.ok) {
    if (verified.code === 'DUPLICATE') {
      return { status: 'duplicate' as const }
    }
    return { status: verified.code, message: verified.message }
  }

  const revisionId = extractRevisionIdFromWebhook(verified.payload)
  markSyncHealthy(store, networkId, { lastWebhookAt: new Date().toISOString() })

  if (!revisionId) {
    return { status: 'ignored', reason: 'no_revision_id' }
  }

  const client = getChannexClientForNetwork(store, networkId)
  const result = await fetchAndApplyRevision(store, client, networkId, revisionId)
  return { status: 'processed', revisionId, result }
}

export async function publicSyncHealth(networkId: number, includeErrorDetail = false) {
  const store = await ensureSecretsHydrated(networkId)
  const health = store.getSyncHealth(networkId)
  const deadLetterCount = store.listDeadLetters(networkId).length
  const pendingAckCount = store.domain.ackOutbox.filter(
    (a) => a.networkId === networkId && a.status !== 'sent',
  ).length
  return toPublicSyncHealth(health, {
    includeErrorDetail,
    deadLetterCount,
    pendingAckCount,
  })
}

export async function runInternalPull(networkId: number) {
  const store = await ensureSecretsHydrated(networkId)
  const client = getChannexClientForNetwork(store, networkId)
  return runBookingRevisionPull(store, client, networkId, `web-${Date.now()}`)
}

export async function runInternalAck(networkId: number) {
  const store = await ensureSecretsHydrated(networkId)
  const client = getChannexClientForNetwork(store, networkId)
  return processAckOutbox(store, client, networkId)
}

export async function runInternalImport(networkId: number) {
  const store = await ensureSecretsHydrated(networkId)
  const client = getChannexClientForNetwork(store, networkId)

  // Commercial uses one master key that can see every property, so the import MUST be
  // scoped to this tenant's Channex group — otherwise every property leaks into the network.
  let result
  if (isCommercialEdition()) {
    const groupId = await getNetworkChannexGroupId(networkId)
    if (!groupId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No Channex group configured for this network',
      })
    }
    const channexIds = await client.listGroupPropertyIds(groupId)
    result = await runCatalogImport(store, client, networkId, `web-${Date.now()}`, channexIds)
  } else {
    result = await runCatalogImport(store, client, networkId, `web-${Date.now()}`)
  }

  const { persistPhysicalRooms, hydratePhysicalRooms } = await import('./physical-rooms')
  await hydratePhysicalRooms(store, networkId)
  // Re-reconcile after hydrate so counts win, then persist durable labels.
  for (const rt of store.listRoomTypes(networkId)) {
    store.reconcilePhysicalRoomsForType(rt.id)
  }
  await persistPhysicalRooms(store, networkId)
  return result
}

async function getNetworkChannexGroupId(networkId: number): Promise<string | null> {
  const db = getDb()
  const [row] = await db
    .select({ channexGroupId: networks.channexGroupId })
    .from(networks)
    .where(eq(networks.id, networkId))
    .limit(1)
  return row?.channexGroupId ?? null
}

/** Minimal dead-letter retry: re-fetch/apply by external revision id when present. */
export async function runRetryDeadLetters(networkId: number) {
  const store = await ensureSecretsHydrated(networkId)
  const client = getChannexClientForNetwork(store, networkId)
  const letters = store.listDeadLetters(networkId)
  let retried = 0
  let applied = 0
  let failed = 0
  for (const dl of letters) {
    if (!dl.externalId) continue
    retried++
    try {
      const result = await fetchAndApplyRevision(store, client, networkId, dl.externalId)
      if (result.status === 'applied' || result.status === 'duplicate') applied++
      else failed++
    } catch {
      failed++
    }
  }
  for (const ack of store.domain.ackOutbox) {
    if (ack.networkId === networkId && ack.status === 'failed') {
      ack.status = 'pending'
    }
  }
  const ack = await processAckOutbox(store, client, networkId)
  return { retried, applied, failed, ack }
}
