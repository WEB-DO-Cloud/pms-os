import { auditEvents } from '@pms/db'
import { getDb } from './auth'

export async function writeAuditEvent(input: {
  networkId?: number | null
  principalType: string
  principalId?: string | null
  action: string
  resourceType?: string
  resourceId?: string
  metadata?: Record<string, unknown>
}) {
  const db = getDb()
  await db.insert(auditEvents).values({
    networkId: input.networkId ?? null,
    principalType: input.principalType,
    principalId: input.principalId ?? null,
    action: input.action,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    metadata: input.metadata ?? null,
  })
}
