import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { channexAppBaseUrl } from '@pms/sync'
import { OTA_CODES, OTAS, isOtaCode } from '../../shared/otas'
import { buildChannelIframeUrl } from '../../shared/channex-channel-url'

const webRoot = join(import.meta.dirname, '../..')

describe('channel iframe session', () => {
  it('channexAppBaseUrl strips trailing /api/v1', () => {
    expect(channexAppBaseUrl('https://staging.channex.io/api/v1')).toBe(
      'https://staging.channex.io',
    )
    expect(channexAppBaseUrl('https://app.channex.io/api/v1/')).toBe(
      'https://app.channex.io',
    )
  })

  it('OTA_CODES are the five major channels', () => {
    expect([...OTA_CODES]).toEqual(['ABB', 'BDC', 'EXP', 'VRB', 'HWL'])
    expect(OTAS).toHaveLength(5)
    expect(isOtaCode('ABB')).toBe(true)
    expect(isOtaCode('XYZ')).toBe(false)
  })

  it('buildChannelIframeUrl embeds headless channels params', () => {
    const url = buildChannelIframeUrl({
      appBase: 'https://staging.channex.io',
      token: 'ott-test-token',
      propertyId: 'prop-abc',
      groupId: 'grp-xyz',
      channels: ['ABB'],
    })
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe(
      'https://staging.channex.io/auth/exchange',
    )
    expect(parsed.searchParams.get('oauth_session_key')).toBe('ott-test-token')
    expect(parsed.searchParams.get('app_mode')).toBe('headless')
    expect(parsed.searchParams.get('redirect_to')).toBe('/channels')
    expect(parsed.searchParams.get('property_id')).toBe('prop-abc')
    expect(parsed.searchParams.get('group_id')).toBe('grp-xyz')
    expect(parsed.searchParams.get('channels')).toBe('ABB')
  })

  it('defaults to all five codes when no single channel is selected', () => {
    const url = buildChannelIframeUrl({
      appBase: 'https://staging.channex.io',
      token: 't',
      propertyId: 'p',
      groupId: 'g',
      channels: OTA_CODES,
    })
    expect(new URL(url).searchParams.get('channels')).toBe(
      'ABB,BDC,EXP,VRB,HWL',
    )
  })

  it('dashboard empty state shows OTA tiles and manual creation', () => {
    const dash = readFileSync(join(webRoot, 'app/pages/dashboard.vue'), 'utf8')
    expect(dash).toContain('OTAS')
    expect(dash).toContain('Manual property creation')
    expect(dash).toContain("phase === 'choose'")
    expect(dash).toContain('IntegrationsChannelConnect')
    expect(dash).toContain('startOta')
  })

  it('settings integrations hosts ChannelConnect', () => {
    const page = readFileSync(
      join(webRoot, 'app/pages/settings/integrations.vue'),
      'utf8',
    )
    const panel = readFileSync(
      join(webRoot, 'app/components/integrations/ChannelConnect.vue'),
      'utf8',
    )
    expect(page).toContain('IntegrationsChannelConnect')
    expect(panel).toContain('Sales channels')
  })

  it('channel-session API and client expose one-time token', () => {
    const api = readFileSync(
      join(webRoot, 'server/api/channex/channel-session.post.ts'),
      'utf8',
    )
    const client = readFileSync(
      join(webRoot, '../../packages/sync/src/channex/client.ts'),
      'utf8',
    )
    expect(api).toContain('createChannelIframeSession')
    expect(api).toContain('requireIntegrationsAccess')
    expect(client).toContain('createOneTimeToken')
    expect(client).toContain('/auth/one_time_token')
    expect(client).toContain('channexAppBaseUrl')
  })
})
