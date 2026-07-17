/** Internal sync route auth: SYNC_INTERNAL_SECRET header or session org_admin/manager. */
export type InternalAuthPrincipal = {
  kind: 'secret' | 'session'
  userId?: string
  role?: string
}

export function verifyInternalSecret(header: string | undefined): boolean {
  const expected = process.env.SYNC_INTERNAL_SECRET
  if (!expected || !header) return false
  return header === expected
}

export function isManagerRole(role: string | undefined): boolean {
  return role === 'org_admin' || role === 'manager'
}

export function authorizeInternalSync(opts: {
  secretHeader?: string
  sessionRole?: string
}): InternalAuthPrincipal | null {
  if (verifyInternalSecret(opts.secretHeader)) {
    return { kind: 'secret' }
  }
  if (opts.sessionRole && isManagerRole(opts.sessionRole)) {
    return { kind: 'session', role: opts.sessionRole }
  }
  return null
}
