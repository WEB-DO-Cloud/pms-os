/**
 * Deployment edition:
 * - community — self-hosted; one-time /setup only, then sign-in
 * - commercial — multi-tenant SaaS (app.pms.do); /signup always available
 */
export type PmsEdition = 'community' | 'commercial'

export function getPmsEdition(): PmsEdition {
  return process.env.PMS_EDITION === 'commercial' ? 'commercial' : 'community'
}

export function isCommercialEdition(): boolean {
  return getPmsEdition() === 'commercial'
}
