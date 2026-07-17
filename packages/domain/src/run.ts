import { buildAuditEvent } from './audit'
import {
  assertActorKindAllowed,
  assertModuleAccess,
  assertNetworkScope,
  assertPrivilegedAction,
  assertPropertyScope,
  type CommandContext,
} from './context'
import {
  commandRegistry,
  type CommandInputMap,
  type CommandName,
  type CommandOutputMap,
} from './commands'
import {
  awaitingApprovalResult,
  okResult,
  rejectedResult,
  type CommandErrorCode,
  type CommandResult,
} from './result'
import {
  defaultGates,
  type AnyCommandDefinition,
  type CommandDeps,
} from './store'
import type { CommandRiskMeta } from './risk'
import type { CommandResultMeta } from './result'

function riskMeta(
  name: string,
  def: {
    risk: CommandRiskMeta['risk']
    requiresApproval: boolean
    supportsDryRun: boolean
    needsExternalSyncRecovery: boolean
    compensatingAction: CommandRiskMeta['compensatingAction']
  },
  actorKind: string,
  audited: boolean,
): CommandResultMeta {
  return {
    command: name,
    actorKind,
    audited,
    risk: def.risk,
    requiresApproval: def.requiresApproval,
    supportsDryRun: def.supportsDryRun,
    needsExternalSyncRecovery: def.needsExternalSyncRecovery,
    compensatingAction: def.compensatingAction,
  }
}

function shouldAwaitApproval(
  ctx: CommandContext,
  requiresApproval: boolean,
): boolean {
  if (!requiresApproval) return false
  return ctx.actorKind === 'automation' || ctx.forceApproval === true
}

function codedError(err: unknown): {
  code: CommandErrorCode
  message: string
} {
  if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    return {
      code: (err as { code: CommandErrorCode }).code,
      message: String((err as { message: string }).message),
    }
  }
  return {
    code: 'VALIDATION',
    message: err instanceof Error ? err.message : 'Command failed',
  }
}

/**
 * Single entry for all domain writes (UI, sync, automation, future agents).
 * Enforces network/property/module gates, idempotency, audit, and approval holds.
 */
export async function runCommand<N extends CommandName>(
  name: N,
  ctx: CommandContext,
  input: CommandInputMap[N],
  deps: CommandDeps,
): Promise<CommandResult<CommandOutputMap[N]>> {
  const def = commandRegistry[name] as AnyCommandDefinition
  const gates = deps.gates ?? defaultGates
  const metaBase = riskMeta(name, def, ctx.actorKind, false)

  const netErr = assertNetworkScope(ctx)
  if (netErr) return rejectedResult(netErr, metaBase)

  const actorErr = assertActorKindAllowed(ctx, def.allowedActorKinds)
  if (actorErr) return rejectedResult(actorErr, metaBase)

  const modErr = assertModuleAccess(ctx, def.module, gates.canAccessModule)
  if (modErr) return rejectedResult(modErr, metaBase)

  const actionErr = assertPrivilegedAction(
    ctx,
    def.privilegedAction,
    gates.canPerformAction,
  )
  if (actionErr) return rejectedResult(actionErr, metaBase)

  const propertyId =
    def.resolvePropertyId(input) ?? ctx.propertyId ?? undefined
  if (propertyId != null) {
    const propErr = assertPropertyScope(
      ctx,
      propertyId,
      gates.canAccessProperty,
    )
    if (propErr) return rejectedResult(propErr, metaBase)
  }

  if (ctx.idempotencyKey) {
    const hit = deps.store.idempotency.find(
      (r) =>
        r.networkId === ctx.networkId &&
        r.key === ctx.idempotencyKey &&
        r.commandName === name,
    )
    if (hit) {
      const replayed = JSON.parse(hit.resultJson) as CommandResult<
        CommandOutputMap[N]
      >
      return { ...replayed, idempotentReplay: true }
    }
  }

  if (ctx.dryRun && def.supportsDryRun) {
    return {
      status: 'dry_run',
      meta: { ...metaBase, audited: false },
      error: { code: 'DRY_RUN', message: 'Dry-run: no mutation applied' },
    }
  }

  // Approval hold for high-risk automation (and explicit forceApproval)
  if (shouldAwaitApproval(ctx, def.requiresApproval) && name !== 'approveAutomationAction') {
    const approvalId = `appr-${deps.store.nextId('approval')}`
    deps.store.pendingApprovals.push({
      id: approvalId,
      networkId: ctx.networkId,
      commandName: name,
      input,
      requestedByPrincipalId: ctx.principal.userId,
      status: 'awaiting_approval',
      createdAt: new Date().toISOString(),
    })
    const audit = buildAuditEvent(
      {
        networkId: ctx.networkId,
        principalType: ctx.actorKind,
        principalId: ctx.principal.userId,
        action: name,
        resourceType: 'automation_approval',
        resourceId: approvalId,
        metadata: { status: 'awaiting_approval', input },
      },
      deps.store.nextId('audit'),
    )
    deps.store.auditEvents.push(audit)
    const held = awaitingApprovalResult(
      approvalId,
      { ...metaBase, audited: true },
      audit.id,
    )
    if (ctx.idempotencyKey) {
      deps.store.idempotency.push({
        networkId: ctx.networkId,
        key: ctx.idempotencyKey,
        commandName: name,
        resultJson: JSON.stringify(held),
      })
    }
    return held
  }

  // approveAutomationAction: resolve hold then execute underlying command
  if (name === 'approveAutomationAction') {
    const approvalId = (input as CommandInputMap['approveAutomationAction'])
      .approvalId
    const approval = deps.store.pendingApprovals.find(
      (a) => a.id === approvalId && a.networkId === ctx.networkId,
    )
    if (!approval) {
      return rejectedResult({
        code: 'NOT_FOUND',
        message: 'Approval not found in scope',
      }, metaBase)
    }
    if (approval.status !== 'awaiting_approval') {
      return rejectedResult({
        code: 'CONFLICT',
        message: 'Approval is not awaiting',
      }, metaBase)
    }

    const heldName = approval.commandName as CommandName
    const heldInput = approval.input as CommandInputMap[typeof heldName]
    const execCtx: CommandContext = {
      ...ctx,
      actorKind: 'user',
      forceApproval: false,
      // Execute under approver; do not re-hold
      idempotencyKey: undefined,
    }
    const execution = await runCommand(heldName, execCtx, heldInput, deps)
    if (execution.status !== 'ok') {
      return execution as CommandResult<CommandOutputMap[N]>
    }

    approval.status = 'approved'
    approval.resolvedAt = new Date().toISOString()
    approval.resolvedByPrincipalId = ctx.principal.userId

    const audit = buildAuditEvent(
      {
        networkId: ctx.networkId,
        principalType: ctx.actorKind,
        principalId: ctx.principal.userId,
        action: name,
        resourceType: 'automation_approval',
        resourceId: approval.id,
        metadata: {
          executedCommand: heldName,
          executionStatus: execution.status,
        },
      },
      deps.store.nextId('audit'),
    )
    deps.store.auditEvents.push(audit)

    const result = okResult(
      {
        approvalId: approval.id,
        executedCommand: heldName,
        execution: execution.data,
      } as CommandOutputMap[N],
      { ...metaBase, audited: true },
      { auditId: audit.id },
    )
    return result
  }

  try {
    const executed = await def.execute(ctx, input, deps)
    const audit = buildAuditEvent(
      {
        networkId: ctx.networkId,
        principalType: ctx.actorKind,
        principalId: ctx.principal.userId,
        action: name,
        resourceType: executed.resourceType,
        resourceId: executed.resourceId,
        metadata: { status: 'ok' },
      },
      deps.store.nextId('audit'),
    )
    deps.store.auditEvents.push(audit)

    const result = okResult(executed.data as CommandOutputMap[N], {
      ...metaBase,
      audited: true,
    }, { auditId: audit.id })

    if (ctx.idempotencyKey) {
      deps.store.idempotency.push({
        networkId: ctx.networkId,
        key: ctx.idempotencyKey,
        commandName: name,
        resultJson: JSON.stringify(result),
      })
    }
    return result
  } catch (err) {
    return rejectedResult(codedError(err), metaBase)
  }
}
