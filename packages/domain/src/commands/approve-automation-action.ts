import type { CommandDefinition } from '../store'

export type ApproveAutomationActionInput = {
  approvalId: string
}

export type ApproveAutomationActionOutput = {
  approvalId: string
  executedCommand: string
  execution: unknown
}

/**
 * Human approval gate for high-risk automation holds.
 * Re-runs the held command as actorKind=user under the approver.
 */
export const approveAutomationAction: CommandDefinition<
  ApproveAutomationActionInput,
  ApproveAutomationActionOutput
> = {
  name: 'approveAutomationAction',
  module: 'automation',
  privilegedAction: 'automation_approval',
  allowedActorKinds: ['user'],
  risk: 'medium',
  requiresApproval: false,
  supportsDryRun: false,
  needsExternalSyncRecovery: false,
  compensatingAction: 'none',
  resolvePropertyId: () => undefined,
  async execute(ctx, input, deps) {
    const approval = deps.store.pendingApprovals.find(
      (a) => a.id === input.approvalId && a.networkId === ctx.networkId,
    )
    if (!approval) {
      throw Object.assign(new Error('Approval not found in scope'), {
        code: 'NOT_FOUND',
      })
    }
    if (approval.status !== 'awaiting_approval') {
      throw Object.assign(new Error('Approval is not awaiting'), {
        code: 'CONFLICT',
      })
    }

    // Deferred execute is handled in runCommand to avoid circular imports.
    return {
      data: {
        approvalId: approval.id,
        executedCommand: approval.commandName,
        execution: null,
      },
      resourceType: 'automation_approval',
      resourceId: approval.id,
    }
  },
}
