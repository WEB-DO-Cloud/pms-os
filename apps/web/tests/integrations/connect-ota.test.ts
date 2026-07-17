import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const webRoot = join(import.meta.dirname, '../..')

describe('connect-ota auto-provision', () => {
  it('uses locked minimal defaults', () => {
    const util = readFileSync(
      join(webRoot, 'server/utils/channex-connect-ota.ts'),
      'utf8',
    )
    expect(util).toContain("currency: 'USD'")
    expect(util).toContain("timezone: 'America/Santo_Domingo'")
    expect(util).toContain("country: 'DO'")
    expect(util).toContain("city: 'Santo Domingo'")
    expect(util).toContain("address: 'TBD'")
    expect(util).toContain("propertyType: 'apartment'")
    expect(util).toContain("roomTitle: 'Standard'")
    expect(util).toContain("rateTitle: 'Best Available Rate'")
    expect(util).toContain('defaultOccupancy: 2')
    expect(util).toContain('rate: 0')
    expect(util).toContain('AUTO_OTA_DEFAULTS')
  })

  it('Channex client exposes createRoomType and createRatePlan', () => {
    const client = readFileSync(
      join(webRoot, '../../packages/sync/src/channex/client.ts'),
      'utf8',
    )
    expect(client).toContain('createRoomType')
    expect(client).toContain("'/room_types'")
    expect(client).toContain('createRatePlan')
    expect(client).toContain("'/rate_plans'")
  })

  it('connect-ota API wires util and access gate', () => {
    const api = readFileSync(
      join(webRoot, 'server/api/channex/connect-ota.post.ts'),
      'utf8',
    )
    const util = readFileSync(
      join(webRoot, 'server/utils/channex-connect-ota.ts'),
      'utf8',
    )
    expect(api).toContain('connectOtaChannel')
    expect(api).toContain('requireIntegrationsAccess')
    expect(util).toContain('provisionOnboardingProperty')
    expect(util).toContain('createRoomType')
    expect(util).toContain('createRatePlan')
    expect(util).toContain('createChannelIframeSession')
  })

  it('dashboard OTA click calls connect-ota and keeps Manual path', () => {
    const dash = readFileSync(join(webRoot, 'app/pages/dashboard.vue'), 'utf8')
    expect(dash).toContain('/api/channex/connect-ota')
    expect(dash).toContain('Manual property creation')
    expect(dash).toContain('startOta')
    expect(dash).toContain('startManual')
    expect(dash).toContain('initial-url')
    expect(dash).toContain('DashboardPropertyOnboardingWizard')
  })

  it('ChannelConnect accepts initialUrl to skip reminting', () => {
    const panel = readFileSync(
      join(webRoot, 'app/components/integrations/ChannelConnect.vue'),
      'utf8',
    )
    expect(panel).toContain('initialUrl')
    expect(panel).toContain('props.initialUrl')
  })
})
