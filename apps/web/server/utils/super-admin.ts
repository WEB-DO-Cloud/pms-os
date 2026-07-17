/**
 * Platform super-admin allowlist for the commercial SaaS console.
 * Comma-separated emails in SUPER_ADMIN_EMAILS (case-insensitive).
 */
export function parseSuperAdminEmails(
  raw = process.env.SUPER_ADMIN_EMAILS ?? '',
): string[] {
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return parseSuperAdminEmails().includes(email.trim().toLowerCase())
}
