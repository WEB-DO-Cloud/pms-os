import type { PrincipalContext } from '@pms/auth'
import {
  resolveMobileDeepLink,
  type DeepLinkResult,
} from '../../app/utils/mobile'

export type PushPlatform = 'ios' | 'android' | 'web'

export type PushTokenRecord = {
  userId: string
  networkId: number
  propertyId: number | null
  token: string
  platform: PushPlatform
  updatedAt: string
}

/** ponytail: in-memory device registry until a durable push_tokens table ships. */
const tokensByUser = new Map<string, PushTokenRecord[]>()

export function clearPushTokenStore() {
  tokensByUser.clear()
}

export function registerPushToken(input: {
  userId: string
  networkId: number
  propertyId: number | null
  token: string
  platform: PushPlatform
}): PushTokenRecord {
  const record: PushTokenRecord = {
    ...input,
    updatedAt: new Date().toISOString(),
  }
  const existing = tokensByUser.get(input.userId) ?? []
  const next = [
    ...existing.filter((row) => row.token !== input.token),
    record,
  ]
  tokensByUser.set(input.userId, next)
  return record
}

export function listPushTokensForUser(userId: string): PushTokenRecord[] {
  return [...(tokensByUser.get(userId) ?? [])]
}

export function authorizeNotificationDeepLink(
  path: string,
  principal: PrincipalContext | null | undefined,
): DeepLinkResult {
  return resolveMobileDeepLink(path, principal)
}
