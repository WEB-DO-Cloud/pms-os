export const packageName = '@pms/sync' as const

export {
  createChannexClient,
  channexBaseUrl,
  channexAppBaseUrl,
  ChannexApiError,
} from './channex/client'
export type { ChannexClient, ChannexOneTimeTokenInput } from './channex/client'
export * from './channex/types'
export { importProperties } from './channex/properties'
export { importAllRoomTypes, importRoomTypesForProperty } from './channex/room-types'
export { pullBookingRevisionFeed, fetchAndApplyRevision } from './channex/booking-revisions'

export { mapChannexProperty, slugify } from './mappers/property'
export { mapChannexRoomType } from './mappers/room-type'
export { mapChannexBookingRevision, guestNameFromRevision } from './mappers/booking-revision'

export { applyBookingRevision } from './apply-revision'
export type { ApplyRevisionResult } from './apply-revision'

export {
  verifyChannexWebhook,
  extractRevisionIdFromWebhook,
  webhookDeliveryKey,
} from './webhooks'
export type { WebhookVerifyResult, WebhookHandleResult } from './webhooks'

export {
  toPublicSyncHealth,
  markSyncRunning,
  markSyncHealthy,
  markSyncFailed,
} from './sync-health'
export type { SyncHealthPublic } from './sync-health'

export {
  resolveSecret,
  decryptSecret,
  encryptSecret,
  maskSecret,
  toPublicSecretStatus,
} from './secrets'
export type { EncryptedSecret, NetworkSecretMaterial, SecretPublicStatus } from './secrets'

export { runCatalogImport } from './jobs/import-catalog'
export { runBookingRevisionPull } from './jobs/pull-booking-revisions'
export { processAckOutbox } from './jobs/process-ack-outbox'
export {
  processAriWriteOutbox,
  type AriWriteOutboxResult,
} from './jobs/process-ari-write-outbox'
export { channexTimestamp, runMessagePull } from './jobs/pull-messages'
export {
  ARI_RESTRICTION_FIELDS,
  channexRateToMinor,
  runAriPull,
  type AriPullResult,
} from './jobs/pull-ari'
export type { MessagePullResult } from './jobs/pull-messages'

export { authorizeInternalSync, verifyInternalSecret, isManagerRole } from './internal-auth'
export type { InternalAuthPrincipal } from './internal-auth'

export {
  createMemorySyncStore,
  createDrizzleSyncStore,
  createDb,
  type SyncStore,
  type PropertyRow,
  type RoomTypeRow,
  type PhysicalRoomRow,
  type DeadLetterRow,
  type SyncHealthRow,
  type NetworkSecretKind,
} from './store'

export { reconcilePhysicalRooms } from './physical-rooms'
export type { PhysicalRoomSeed, ReconcileResult } from './physical-rooms'

export { fixtureRateCache, fixtureRateCacheMiss } from './fixtures/rates'

export {
  parseNetworkIds,
  writeWorkerHealth,
  runHttpWorkerCycle,
  runLocalWorkerCycle,
  runWorkerTick,
  startWorkerLoop,
} from './worker'
export type { WorkerHealthSnapshot, WorkerCycleResult } from './worker'
