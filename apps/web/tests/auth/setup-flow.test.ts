import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

describe('setup / signup edition contract', () => {
  it('documents community one-time setup vs commercial always-on signup', () => {
    const edition = readFileSync(
      join(webRoot, 'server/utils/edition.ts'),
      'utf8',
    )
    expect(edition).toContain("'commercial'")
    expect(edition).toContain("'community'")

    const status = readFileSync(
      join(webRoot, 'server/api/setup/status.get.ts'),
      'utf8',
    )
    expect(status).toContain('signupEnabled')
    expect(status).toContain("edition === 'community'")

    const signup = readFileSync(
      join(webRoot, 'server/api/signup.post.ts'),
      'utf8',
    )
    expect(signup).toContain('isCommercialEdition')
    expect(signup).toContain('provisionTenant')

    const bootstrap = readFileSync(
      join(webRoot, 'server/api/setup/bootstrap.post.ts'),
      'utf8',
    )
    expect(bootstrap).toContain('isCommercialEdition')
    expect(bootstrap).toContain('Use /signup')
  })

  it('fully reloads client state when the authenticated user changes', () => {
    const paths = [
      'app/pages/login.vue',
      'app/pages/signup.vue',
      'app/pages/setup.vue',
      'app/components/layout/AppSidebar.vue',
    ]
    for (const path of paths) {
      expect(readFileSync(join(webRoot, path), 'utf8')).toContain(
        'window.location.replace(',
      )
    }
  })
})
