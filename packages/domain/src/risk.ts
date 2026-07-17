/** Risk, approval, and compensating-action metadata for domain commands. */

export const RISK_LEVELS = ['low', 'medium', 'high'] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

export const COMPENSATING_ACTIONS = [
  'none',
  'reverse_ledger',
  'cancel_booking',
  'retract_message',
  'undo_task',
  'external_sync',
] as const
export type CompensatingAction = (typeof COMPENSATING_ACTIONS)[number]

export type CommandRiskMeta = {
  risk: RiskLevel
  /** When true, automation (and explicit forceApproval) holds for human approval. */
  requiresApproval: boolean
  supportsDryRun: boolean
  needsExternalSyncRecovery: boolean
  compensatingAction: CompensatingAction
}
