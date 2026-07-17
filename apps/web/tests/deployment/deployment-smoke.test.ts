import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  parseNetworkIds,
  writeWorkerHealth,
  runLocalWorkerCycle,
  createMemorySyncStore,
  encryptSecret,
} from '@pms/sync'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('deployment artifacts (U14)', () => {
  it('ships compose, Dockerfile, and env template without secret values', () => {
    const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8')
    const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8')
    const envExample = readFileSync(join(root, '.env.example'), 'utf8')

    expect(compose).toMatch(/migrate:/)
    expect(compose).toMatch(/service_completed_successfully/)
    expect(compose).toMatch(/^\s+web:/m)
    expect(compose).toMatch(/^\s+website:/m)
    expect(compose).toMatch(/^\s+worker:/m)
    expect(compose).toMatch(/^\s+postgres:/m)
    expect(compose).toContain('PMS_EDITION')
    expect(compose).toContain('SUPER_ADMIN_EMAILS')
    expect(compose).toContain('127.0.0.1:33101:3000')

    expect(dockerfile).toMatch(/AS web/)
    expect(dockerfile).toMatch(/AS website/)
    expect(dockerfile).toMatch(/AS worker/)
    expect(dockerfile).toMatch(/AS migrate/)

    for (const key of [
      'DATABASE_URL',
      'BETTER_AUTH_SECRET',
      'BETTER_AUTH_URL',
      'PMS_EDITION',
      'SUPER_ADMIN_EMAILS',
      'SECRETS_ENCRYPTION_KEY',
      'SYNC_INTERNAL_SECRET',
      'CHANNEX_API_BASE',
    ]) {
      expect(envExample).toContain(key)
    }
    expect(envExample).toContain('http://localhost:3000')
    expect(envExample).toMatch(/PMS_EDITION=community/)
    expect(envExample).toContain('SUPER_ADMIN_EMAILS')

    const banned = [
      /chx_live_[a-zA-Z0-9]{8,}/,
      /postgresql:\/\/[^:]+:(?!change-me)[^@\s]{12,}@/,
    ]
    for (const pattern of banned) {
      expect(envExample).not.toMatch(pattern)
      expect(compose).not.toMatch(pattern)
      expect(dockerfile).not.toMatch(pattern)
    }
  })

  it('documents launch ops surfaces', () => {
    const docs = [
      'docs/deployment/launch-checklist.md',
      'docs/deployment/verification-queries.md',
      'docs/deployment/rollback.md',
      'docs/deployment/backup-restore.md',
      'docs/deployment/channex-webhooks.md',
      'CONTRIBUTING.md',
    ]
    for (const rel of docs) {
      expect(existsSync(join(root, rel)), rel).toBe(true)
    }
    const checklist = readFileSync(join(root, 'docs/deployment/launch-checklist.md'), 'utf8')
    expect(checklist.toLowerCase()).toContain('backup')
    expect(checklist.toLowerCase()).toContain('migrate')
    expect(checklist.toLowerCase()).toContain('rollback')
    expect(checklist.toLowerCase()).toMatch(/stop\/go|no-go/)
  })

  it('exposes web health route and nitro node preset', () => {
    expect(existsSync(join(root, 'apps/web/server/api/health.get.ts'))).toBe(true)
    const nitro = readFileSync(join(root, 'apps/web/nitro.config.ts'), 'utf8')
    expect(nitro).toContain('node-server')
  })
})

describe('sync worker helpers', () => {
  it('parses network ids and writes health snapshots', () => {
    expect(parseNetworkIds('1, 2,x,3')).toEqual([1, 2, 3])
    expect(parseNetworkIds('')).toEqual([])

    const file = join(dirname(fileURLToPath(import.meta.url)), '.tmp-worker-health.json')
    writeWorkerHealth(file, {
      lastTickAt: new Date().toISOString(),
      ok: true,
      mode: 'local',
      networks: [1],
      errors: [],
    })
    const snap = JSON.parse(readFileSync(file, 'utf8'))
    expect(snap.ok).toBe(true)
    expect(snap.networks).toEqual([1])
  })

  it('local cycle requires channex secret', async () => {
    const empty = createMemorySyncStore()
    await expect(
      runLocalWorkerCycle({ networkIds: [1], getStore: () => empty }),
    ).rejects.toThrow(/missing channex_api_key/)

    const store = createMemorySyncStore()
    const enc = encryptSecret('test-api-key-not-real')
    store.setSecret(1, 'channex_api_key', enc.ciphertext, enc.iv, enc.keyVersion)
    expect(store.getSecret(1, 'channex_api_key')).toBeTruthy()
  })
})
