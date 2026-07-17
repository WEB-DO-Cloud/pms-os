import type { ActorKind } from './context'

export type AuditEventRecord = {
  id: number
  networkId: number | null
  principalType: ActorKind
  principalId: string | null
  action: string
  resourceType: string | null
  resourceId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export type AuditWriteInput = {
  networkId: number
  principalType: ActorKind
  principalId: string
  action: string
  resourceType?: string | null
  resourceId?: string | null
  metadata?: Record<string, unknown> | null
}

/** Append-only audit helper — never mutates prior rows. */
export function buildAuditEvent(
  input: AuditWriteInput,
  id: number,
  createdAt = new Date().toISOString(),
): AuditEventRecord {
  return {
    id,
    networkId: input.networkId,
    principalType: input.principalType,
    principalId: input.principalId,
    action: input.action,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    metadata: input.metadata ?? null,
    createdAt,
  }
}
