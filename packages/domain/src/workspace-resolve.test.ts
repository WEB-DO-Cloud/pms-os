import { describe, expect, it } from 'vitest'
import * as db from '@pms/db'
import * as auth from '@pms/auth'
import * as licensing from '@pms/licensing'
import * as ee from '@pms/ee'
import { packageName as domain } from './index'

describe('workspace package aliases', () => {
  it('resolves domain peer packages without depending on @pms/sync', () => {
    expect(domain).toBe('@pms/domain')
    expect(db.fieldOwnership).toBeDefined()
    expect(auth.buildPrincipal).toBeTypeOf('function')
    expect(licensing.resolveEntitlements).toBeTypeOf('function')
    expect(ee).toBeTruthy()
  })
})
