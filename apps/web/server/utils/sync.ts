import {
  authorizeInternalSync,
  createChannexClient,
  createMemorySyncStore,
  encryptSecret,
  fetchAndApplyRevision,
  markSyncHealthy,
  processAckOutbox,
  processAriWriteOutbox,
  resolveSecret,
  runAriPull,
  runBookingRevisionPull,
  runCatalogImport,
  runMessagePull,
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
const catalogHydrated = new Set<number>()

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

  // Durable ARI state (capabilities, write intents, projections, notes) — the
  // memory store is a cache; PG rows survive restarts (R15).
  if (process.env.DATABASE_URL) {
    try {
      const { hydrateAriState } = await import('../lib/ari-persistence')
      await hydrateAriState(getDb(), store.domain, networkId)
    } catch {
      // Missing migration / unit tests without PG — memory-only still works.
    }
  }

  hydrated.add(networkId)

  // Self-heal the catalog: the memory store starts empty after every restart,
  // so re-import properties/room types from Channex on first touch.
  // ponytail: once per process — if Channex is down on first try, the manual
  // Settings → Integrations import (or a restart) is the retry path.
  if (!catalogHydrated.has(networkId)) {
    catalogHydrated.add(networkId)
    if (store.listProperties(networkId).length === 0) {
      try {
        await runInternalImport(networkId)
      } catch {
        // No Channex key/group configured yet — pages keep their empty states.
      }
    }
  }
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

export async function getScopedChannexMessagingClient(
  networkId: number,
  propertyId: number,
) {
  const store = await ensureSecretsHydrated(networkId)
  const property = store
    .listProperties(networkId)
    .find((candidate) => candidate.id === propertyId)
  if (!property) {
    throw createError({ statusCode: 404, statusMessage: 'Property not found' })
  }
  const client = getChannexClientForNetwork(store, networkId)
  if (isCommercialEdition()) {
    const groupId = await getNetworkChannexGroupId(networkId)
    if (!groupId) {
      throw createError({ statusCode: 403, statusMessage: 'Channex group not configured' })
    }
    const allowed = await client.listGroupPropertyIds(groupId)
    if (!allowed.includes(property.channexId)) {
      throw createError({ statusCode: 403, statusMessage: 'Channex property out of scope' })
    }
  }
  return { client, property }
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

  if (verified.payload.event === 'ari') {
    // ARI changed at Channex — targeted re-pull, never a direct projection write
    // from webhook values (out-of-order deliveries would corrupt the snapshot).
    const channexPropertyId =
      verified.payload.payload?.property_id ?? verified.payload.property_id
    const property = channexPropertyId
      ? store.findPropertyByChannexId(networkId, channexPropertyId)
      : null
    const result = await runInternalAriPull(
      networkId,
      property ? { propertyId: property.id } : undefined,
    )
    return { status: 'processed', result }
  }

  if (verified.payload.event === 'message') {
    // Guest chat message registered at Channex — pull threads into the Inbox.
    const client = getChannexClientForNetwork(store, networkId)
    const result = await runMessagePull(store, client, networkId, `webhook-${Date.now()}`)
    return { status: 'processed', result }
  }

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
  const pull = await runBookingRevisionPull(store, client, networkId, `web-${Date.now()}`)
  // Chat messages ride the same worker tick; app-not-installed is a silent skip.
  let messages
  try {
    messages = await runMessagePull(store, client, networkId, `web-${Date.now()}`)
  } catch (err) {
    messages = { skipped: true as const, reason: err instanceof Error ? err.message : 'error' }
  }
  // Live ARI projection rides the same tick; failures never block booking sync.
  let ari
  try {
    ari = await runInternalAriPull(networkId)
  } catch (err) {
    ari = { skipped: true as const, reason: err instanceof Error ? err.message : 'error' }
  }
  return { ...pull, messages, ari }
}

/**
 * Pull Channex ARI into the in-memory projection and write changed rows
 * through to PG so snapshot versions survive restarts.
 */
export async function runInternalAriPull(
  networkId: number,
  opts?: { propertyId?: number; dateFrom?: string; dateTo?: string },
) {
  const store = await ensureSecretsHydrated(networkId)
  const client = getChannexClientForNetwork(store, networkId)
  const result = await runAriPull(store, client, networkId, `web-${Date.now()}`, opts)
  if (!result.skipped && result.changed > 0 && process.env.DATABASE_URL) {
    try {
      const { persistAriProjection } = await import('../lib/ari-persistence')
      const changedAvailability = store.domain.ariAvailability.filter(
        (a) => a.networkId === networkId && a.snapshotVersion === result.snapshotVersion,
      )
      const changedRestrictions = store.domain.ariRestrictions.filter(
        (r) => r.networkId === networkId && r.snapshotVersion === result.snapshotVersion,
      )
      await persistAriProjection(getDb(), networkId, changedAvailability, changedRestrictions)
    } catch {
      // Best-effort: memory projection still serves reads; next pull retries.
    }
  }
  return result
}

export async function runInternalMessagePull(networkId: number) {
  const store = await ensureSecretsHydrated(networkId)
  const client = getChannexClientForNetwork(store, networkId)
  return runMessagePull(store, client, networkId, `inbox-${Date.now()}`)
}

export async function runInternalAck(networkId: number) {
  const store = await ensureSecretsHydrated(networkId)
  const client = getChannexClientForNetwork(store, networkId)
  return processAckOutbox(store, client, networkId)
}

/** Drain availability (and future ARI) write intents for a network. */
export async function runInternalAriWrite(networkId: number) {
  const store = await ensureSecretsHydrated(networkId)
  const client = getChannexClientForNetwork(store, networkId)
  const result = await processAriWriteOutbox(store, client, networkId)
  // ponytail: best-effort PG status write-through; memory is authoritative in-process.
  if (process.env.DATABASE_URL && result.processed > 0) {
    try {
      const { persistAriIntentStatus } = await import('../lib/ari-persistence')
      for (const intent of store.domain.ariWriteIntents.filter(
        (i) => i.networkId === networkId && i.lane === 'availability',
      )) {
        await persistAriIntentStatus(getDb(), intent)
      }
    } catch {
      // Missing migration / unit tests without PG.
    }
  }
  return result
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
