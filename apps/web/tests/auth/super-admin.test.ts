import { describe, expect, it } from 'vitest'
import {
  isSuperAdminEmail,
  parseSuperAdminEmails,
} from '../../server/utils/super-admin'

describe('super admin allowlist', () => {
  it('parses comma-separated emails case-insensitively', () => {
    expect(parseSuperAdminEmails('Ada@Pms.Do, bob@pms.do ,')).toEqual([
      'ada@pms.do',
      'bob@pms.do',
    ])
  })

  it('matches allowlisted emails only', () => {
    const prev = process.env.SUPER_ADMIN_EMAILS
    process.env.SUPER_ADMIN_EMAILS = 'info@pms.do'
    expect(isSuperAdminEmail('INFO@pms.do')).toBe(true)
    expect(isSuperAdminEmail('tenant@example.com')).toBe(false)
    process.env.SUPER_ADMIN_EMAILS = prev
  })
})
