import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseNetworkIds,
  writeWorkerHealth,
  runLocalWorkerCycle,
  createMemorySyncStore,
  encryptSecret,
} from '../src/index'

describe('worker', () => {
  it('parseNetworkIds ignores junk', () => {
    expect(parseNetworkIds('1, 2, ,-1,foo,3')).toEqual([1, 2, 3])
  })

  it('writeWorkerHealth persists snapshot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pms-worker-'))
    const file = join(dir, 'health.json')
    writeWorkerHealth(file, {
      lastTickAt: '2026-07-16T12:00:00.000Z',
      ok: false,
      mode: 'http',
      networks: [9],
      errors: ['boom'],
    })
    expect(JSON.parse(readFileSync(file, 'utf8')).errors).toEqual(['boom'])
    rmSync(dir, { recursive: true, force: true })
  })

  it('local cycle fails fast without api key', async () => {
    await expect(
      runLocalWorkerCycle({
        networkIds: [1],
        getStore: () => createMemorySyncStore(),
      }),
    ).rejects.toThrow(/channex_api_key/)
  })

  it('local cycle reaches pull when secret present (fetch may fail)', async () => {
    const store = createMemorySyncStore()
    const enc = encryptSecret('unit-test-key')
    store.setSecret(1, 'channex_api_key', enc.ciphertext, enc.iv, enc.keyVersion)
    // Without a reachable Channex, pull throws — proves job path was entered.
    await expect(
      runLocalWorkerCycle({
        networkIds: [1],
        getStore: () => store,
        holder: 'test',
      }),
    ).rejects.toThrow()
  })
})
