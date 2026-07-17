import type { PrincipalContext } from '@pms/auth'
import type {
  principalCanAccessModule,
  principalCanAccessProperty,
  principalCanPerformAction,
} from '@pms/auth'
import type { AppModule, PrivilegedAction } from '@pms/auth'

/** Who is invoking the command — shapes audit principalType and approval gating. */
export const ACTOR_KINDS = ['user', 'automation', 'sync'] as const
export type ActorKind = (typeof ACTOR_KINDS)[number]

export type CommandContext = {
  principal: PrincipalContext
  actorKind: ActorKind
  /** Target network — must match principal.networkId. */
  networkId: number
  propertyId?: number
  idempotencyKey?: string
  dryRun?: boolean
  /** Force approval hold even for user actors (tests / future UI). */
  forceApproval?: boolean
}

export type ScopeError =
  | { code: 'NETWORK_SCOPE'; message: string }
  | { code: 'PROPERTY_SCOPE'; message: string }
  | { code: 'MODULE_DENIED'; message: string }
  | { code: 'ACTION_DENIED'; message: string }
  | { code: 'PRINCIPAL_TYPE'; message: string }

export function assertNetworkScope(ctx: CommandContext): ScopeError | null {
  if (ctx.principal.networkId == null) {
    return {
      code: 'NETWORK_SCOPE',
      message: 'Principal has no network membership',
    }
  }
  if (ctx.principal.networkId !== ctx.networkId) {
    return {
      code: 'NETWORK_SCOPE',
      message: `Principal network ${ctx.principal.networkId} cannot act on network ${ctx.networkId}`,
    }
  }
  return null
}

export function assertPropertyScope(
  ctx: CommandContext,
  propertyId: number,
  canAccess: typeof principalCanAccessProperty,
): ScopeError | null {
  // Sync is network-scoped; entity lookup still enforces networkId match.
  if (ctx.actorKind === 'sync') return null
  if (!canAccess(ctx.principal, propertyId)) {
    return {
      code: 'PROPERTY_SCOPE',
      message: `Principal cannot access property ${propertyId}`,
    }
  }
  return null
}

export function assertModuleAccess(
  ctx: CommandContext,
  module: AppModule,
  canAccess: typeof principalCanAccessModule,
): ScopeError | null {
  if (ctx.actorKind === 'sync') return null
  if (!canAccess(ctx.principal, module)) {
    return {
      code: 'MODULE_DENIED',
      message: `Role ${ctx.principal.role} cannot access module ${module}`,
    }
  }
  return null
}

export function assertPrivilegedAction(
  ctx: CommandContext,
  action: PrivilegedAction | undefined,
  canPerform: typeof principalCanPerformAction,
): ScopeError | null {
  if (!action) return null
  if (ctx.actorKind === 'sync') return null
  if (!canPerform(ctx.principal, action)) {
    return {
      code: 'ACTION_DENIED',
      message: `Role ${ctx.principal.role} cannot perform ${action}`,
    }
  }
  return null
}

export function assertActorKindAllowed(
  ctx: CommandContext,
  allowed: readonly ActorKind[],
): ScopeError | null {
  if (!allowed.includes(ctx.actorKind)) {
    return {
      code: 'PRINCIPAL_TYPE',
      message: `Actor kind ${ctx.actorKind} cannot run this command`,
    }
  }
  return null
}
