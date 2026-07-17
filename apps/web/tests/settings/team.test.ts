import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isNetworkWideRole, MEMBER_ROLES } from '@pms/auth'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('settings team', () => {
  it('has a dedicated page instead of the settings slug stub', () => {
    const page = readFileSync(join(webRoot, 'app/pages/settings/team.vue'), 'utf8')
    expect(page).toContain('Team & Permissions')
    expect(page).toContain('/api/settings/team')
    expect(page).toContain('Permission matrix')

    const stub = readFileSync(join(webRoot, 'app/pages/[...slug].vue'), 'utf8')
    expect(stub).not.toMatch(/team:\s*\{\s*title:\s*'Team/)
  })

  it('scopes network-wide roles correctly for property assignment UI', () => {
    expect(isNetworkWideRole('org_admin')).toBe(true)
    expect(isNetworkWideRole('manager')).toBe(true)
    expect(isNetworkWideRole('front_desk')).toBe(false)
    expect(MEMBER_ROLES).toContain('property_owner')
  })

  it('exposes invite/update/remove team APIs', () => {
    const get = readFileSync(
      join(webRoot, 'server/api/settings/team.get.ts'),
      'utf8',
    )
    const post = readFileSync(
      join(webRoot, 'server/api/settings/team.post.ts'),
      'utf8',
    )
    const patch = readFileSync(
      join(webRoot, 'server/api/settings/team/[userId].patch.ts'),
      'utf8',
    )
    const del = readFileSync(
      join(webRoot, 'server/api/settings/team/[userId].delete.ts'),
      'utf8',
    )
    expect(get).toContain('listTeamMembers')
    expect(post).toContain('inviteTeamMember')
    expect(patch).toContain('updateTeamMember')
    expect(del).toContain('removeTeamMember')
  })
})
