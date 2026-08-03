import type { CommandRiskMeta } from './risk'

export type CommandErrorCode =
  | 'NETWORK_SCOPE'
  | 'PROPERTY_SCOPE'
  | 'MODULE_DENIED'
  | 'ACTION_DENIED'
  | 'PRINCIPAL_TYPE'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'DRY_RUN'
  /** Per-network operational write gate is off (KTD7). */
  | 'CAPABILITY_OFF'
  /** Editor snapshot version no longer matches reconciled projection (KTD6). */
  | 'STALE_SNAPSHOT'

export type CommandError = {
  code: CommandErrorCode
  message: string
}

export type CommandStatus = 'ok' | 'rejected' | 'awaiting_approval' | 'dry_run'

export type CommandResultMeta = CommandRiskMeta & {
  command: string
  actorKind: string
  audited: boolean
}

export type CommandResult<T = unknown> = {
  status: CommandStatus
  data?: T
  error?: CommandError
  auditId?: string | number
  approvalId?: string
  idempotentReplay?: boolean
  meta?: CommandResultMeta
}

export function okResult<T>(
  data: T,
  meta: CommandResultMeta,
  extra?: Partial<CommandResult<T>>,
): CommandResult<T> {
  return { status: 'ok', data, meta, ...extra }
}

export function rejectedResult(
  error: CommandError,
  meta?: Partial<CommandResultMeta>,
): CommandResult<never> {
  return {
    status: 'rejected',
    error,
    meta: meta as CommandResultMeta | undefined,
  }
}

export function awaitingApprovalResult(
  approvalId: string,
  meta: CommandResultMeta,
  auditId?: string | number,
): CommandResult<never> {
  return {
    status: 'awaiting_approval',
    approvalId,
    auditId,
    meta,
  }
}
