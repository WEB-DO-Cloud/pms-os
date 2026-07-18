import { describe, expect, it } from 'vitest'
import {
  intentRecordToRow,
  intentRowToRecord,
} from '../../server/lib/ari-persistence'
import type { AriWriteIntentRecord } from '@pms/domain'

const record: AriWriteIntentRecord = {
  id: 7,
  networkId: 1,
  propertyId: 10,
  lane: 'availability',
  idempotencyKey: 'close-rt-2026-08-01',
  payload: { values: [{ availability: 0 }] },
  resourceScope: {
    roomTypeChannexId: 'rt-uuid',
    dateFrom: '2026-08-01',
    dateTo: '2026-08-03',
  },
  baseSnapshotVersion: 3,
  status: 'partial',
  channexTaskIds: ['task-1'],
  warnings: [{ warning: { rate: ['is invalid'] } }],
  attempts: 2,
  lastError: 'Channex 429',
  nextAttemptAt: '2026-07-18T12:00:00.000Z',
  actorPrincipalId: 'u-manager',
  approvedByPrincipalId: null,
  compensatesIntentId: null,
  reconciledAt: null,
  createdAt: '2026-07-18T10:00:00.000Z',
  updatedAt: '2026-07-18T11:00:00.000Z',
}

describe('ARI intent row mapping', () => {
  it('round-trips a record through the PG row shape without losing lifecycle state', () => {
    const row = intentRecordToRow(record)
    expect(row.status).toBe('partial')
    expect(row.nextAttemptAt).toBeInstanceOf(Date)

    const back = intentRowToRecord({
      ...row,
      id: record.id,
      resourceScope: row.resourceScope ?? null,
      baseSnapshotVersion: row.baseSnapshotVersion ?? null,
      status: row.status!,
      channexTaskIds: row.channexTaskIds ?? [],
      warnings: row.warnings ?? [],
      attempts: row.attempts ?? 0,
      lastError: row.lastError ?? null,
      nextAttemptAt: row.nextAttemptAt ?? null,
      actorPrincipalId: row.actorPrincipalId ?? null,
      approvedByPrincipalId: row.approvedByPrincipalId ?? null,
      compensatesIntentId: row.compensatesIntentId ?? null,
      reconciledAt: row.reconciledAt ?? null,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    })
    expect(back).toEqual(record)
  })

  it('defaults null jsonb columns to empty arrays', () => {
    const row = intentRecordToRow(record)
    const back = intentRowToRecord({
      ...row,
      id: 1,
      status: 'queued',
      channexTaskIds: null,
      warnings: null,
      attempts: 0,
      resourceScope: null,
      baseSnapshotVersion: null,
      lastError: null,
      nextAttemptAt: null,
      actorPrincipalId: null,
      approvedByPrincipalId: null,
      compensatesIntentId: null,
      reconciledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    expect(back.channexTaskIds).toEqual([])
    expect(back.warnings).toEqual([])
    expect(back.resourceScope).toBeNull()
  })
})
