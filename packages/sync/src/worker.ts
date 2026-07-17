/**
 * Sync worker: ordered pull → ack cycle per network.
 *
 * SYNC_WORKER_MODE=http (default in compose): POST web internal sync routes so
 * jobs share the web process store with webhooks.
 * SYNC_WORKER_MODE=local: call @pms/sync jobs in-process (dev/smoke; no shared store).
 *
 * Health: writes WORKER_HEALTH_FILE JSON { lastTickAt, ok, networks, errors }.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createChannexClient } from './channex/client'
import { runBookingRevisionPull } from './jobs/pull-booking-revisions'
import { processAckOutbox } from './jobs/process-ack-outbox'
import { resolveSecret } from './secrets'
import { createMemorySyncStore, type SyncStore } from './store'

export type WorkerHealthSnapshot = {
  lastTickAt: string
  ok: boolean
  mode: 'http' | 'local'
  networks: number[]
  errors: string[]
}

export type WorkerCycleResult = {
  networkId: number
  pull: unknown
  ack: unknown
}

export function parseNetworkIds(raw: string | undefined): number[] {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1)
}

export function writeWorkerHealth(
  filePath: string,
  snapshot: WorkerHealthSnapshot,
): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(snapshot)}\n`, 'utf8')
}

export async function runHttpWorkerCycle(opts: {
  webBaseUrl: string
  syncSecret: string
  networkIds: number[]
}): Promise<WorkerCycleResult[]> {
  const base = opts.webBaseUrl.replace(/\/$/, '')
  const headers = {
    'Content-Type': 'application/json',
    'x-sync-internal-secret': opts.syncSecret,
  }
  const out: WorkerCycleResult[] = []
  for (const networkId of opts.networkIds) {
    const pullRes = await fetch(`${base}/api/internal/sync/pull`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ networkId }),
    })
    if (!pullRes.ok) {
      throw new Error(`pull network ${networkId}: HTTP ${pullRes.status}`)
    }
    const pull = await pullRes.json()
    const ackRes = await fetch(`${base}/api/internal/sync/ack`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ networkId }),
    })
    if (!ackRes.ok) {
      throw new Error(`ack network ${networkId}: HTTP ${ackRes.status}`)
    }
    const ack = await ackRes.json()
    out.push({ networkId, pull, ack })
  }
  return out
}

/** In-process pull+ack using @pms/sync jobs (local/smoke mode). */
export async function runLocalWorkerCycle(opts: {
  networkIds: number[]
  getStore: (networkId: number) => SyncStore
  holder?: string
}): Promise<WorkerCycleResult[]> {
  const holder = opts.holder ?? `worker-${process.pid}`
  const out: WorkerCycleResult[] = []
  for (const networkId of opts.networkIds) {
    const store = opts.getStore(networkId)
    const secretRow = store.getSecret(networkId, 'channex_api_key')
    if (!secretRow) {
      throw new Error(`network ${networkId}: missing channex_api_key`)
    }
    const client = createChannexClient({ apiKey: resolveSecret(secretRow) })
    const pull = await runBookingRevisionPull(store, client, networkId, holder)
    const ack = await processAckOutbox(store, client, networkId)
    out.push({ networkId, pull, ack })
  }
  return out
}

export async function runWorkerTick(opts: {
  mode: 'http' | 'local'
  networkIds: number[]
  webBaseUrl?: string
  syncSecret?: string
  getStore?: (networkId: number) => SyncStore
}): Promise<WorkerCycleResult[]> {
  if (opts.networkIds.length === 0) {
    throw new Error('SYNC_NETWORK_IDS is empty')
  }
  if (opts.mode === 'http') {
    if (!opts.webBaseUrl || !opts.syncSecret) {
      throw new Error('WEB_INTERNAL_URL and SYNC_INTERNAL_SECRET required for http mode')
    }
    return runHttpWorkerCycle({
      webBaseUrl: opts.webBaseUrl,
      syncSecret: opts.syncSecret,
      networkIds: opts.networkIds,
    })
  }
  const getStore = opts.getStore ?? (() => createMemorySyncStore())
  return runLocalWorkerCycle({ networkIds: opts.networkIds, getStore })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Long-running loop used by the Docker worker entrypoint. */
export async function startWorkerLoop(opts?: {
  signal?: AbortSignal
  once?: boolean
}): Promise<void> {
  const mode = (process.env.SYNC_WORKER_MODE === 'local' ? 'local' : 'http') as
    | 'http'
    | 'local'
  const networkIds = parseNetworkIds(process.env.SYNC_NETWORK_IDS)
  const intervalMs = Number(process.env.SYNC_WORKER_INTERVAL_MS ?? 30_000)
  const healthFile =
    process.env.WORKER_HEALTH_FILE ?? '/tmp/pms-worker-health.json'
  const webBaseUrl = process.env.WEB_INTERNAL_URL ?? 'http://web:3000'
  const syncSecret = process.env.SYNC_INTERNAL_SECRET

  const write = (ok: boolean, errors: string[]) => {
    writeWorkerHealth(healthFile, {
      lastTickAt: new Date().toISOString(),
      ok,
      mode,
      networks: networkIds,
      errors,
    })
  }

  // Mark starting so compose healthcheck can observe the file early.
  write(true, [])

  do {
    if (opts?.signal?.aborted) break
    try {
      await runWorkerTick({
        mode,
        networkIds,
        webBaseUrl,
        syncSecret,
      })
      write(true, [])
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[sync-worker]', message)
      write(false, [message])
    }
    if (opts?.once) break
    await sleep(Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 30_000)
  } while (!opts?.signal?.aborted)
}

const isMain =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('worker.ts') || process.argv[1].endsWith('worker.js'))

if (isMain) {
  startWorkerLoop().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
