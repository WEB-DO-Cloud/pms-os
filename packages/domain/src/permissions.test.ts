import { describe, expect, it } from 'vitest'
import { buildPrincipal } from '@pms/auth'
import {
  createMemoryStore,
  runCommand,
  type CommandContext,
} from './index'

function staffPrincipal(
  overrides: Partial<Parameters<typeof buildPrincipal>[0]> = {},
) {
  return buildPrincipal({
    userId: 'user-1',
    networkId: 1,
    role: 'front_desk',
    propertyIds: [10],
    networkWide: false,
    ...overrides,
  })!
}

function ctx(
  principal: NonNullable<ReturnType<typeof buildPrincipal>>,
  partial: Partial<CommandContext> = {},
): CommandContext {
  return {
    principal,
    actorKind: 'user',
    networkId: principal.networkId!,
    ...partial,
  }
}

describe('command permission / scope gates', () => {
  it('rejects forged networkId that does not match principal.networkId', async () => {
    const store = createMemoryStore()
    const principal = staffPrincipal({ networkId: 1, propertyIds: [10] })

    const result = await runCommand(
      'createTask',
      ctx(principal, { networkId: 999 }),
      { title: 'Clean room', propertyId: 10, category: 'cleaning' },
      { store },
    )

    expect(result.status).toBe('rejected')
    expect(result.error?.code).toBe('NETWORK_SCOPE')
    expect(store.tasks).toHaveLength(0)
  })

  it('rejects forged propertyId outside principal property scope', async () => {
    const store = createMemoryStore()
    const principal = staffPrincipal({
      networkId: 1,
      propertyIds: [10],
      networkWide: false,
    })

    const result = await runCommand(
      'createTask',
      ctx(principal, { networkId: 1, propertyId: 99 }),
      { title: 'Clean room', propertyId: 99, category: 'cleaning' },
      { store },
    )

    expect(result.status).toBe('rejected')
    expect(result.error?.code).toBe('PROPERTY_SCOPE')
    expect(store.tasks).toHaveLength(0)
  })

  it('rejects module access for roles that cannot use the command module', async () => {
    const store = createMemoryStore()
    const housekeeping = staffPrincipal({
      role: 'housekeeping',
      propertyIds: [10],
    })

    const result = await runCommand(
      'recordLedgerPayment',
      ctx(housekeeping, { networkId: 1, propertyId: 10 }),
      {
        reservationId: 1,
        propertyId: 10,
        type: 'payment',
        amountMinor: 1000,
        currency: 'USD',
      },
      { store },
    )

    expect(result.status).toBe('rejected')
    expect(result.error?.code).toBe('MODULE_DENIED')
  })

  it('approveAutomationAction requires automation_approval privilege', async () => {
    const store = createMemoryStore()
    // Manager has automation module; deny privileged action via gates to isolate ACTION_DENIED.
    const manager = staffPrincipal({
      role: 'manager',
      propertyIds: [10],
      networkWide: true,
    })

    store.pendingApprovals.push({
      id: 'appr-1',
      networkId: 1,
      commandName: 'queueGuestMessage',
      input: {
        reservationId: 1,
        propertyId: 10,
        body: 'Hello',
        channel: 'email',
      },
      requestedByPrincipalId: 'auto-1',
      status: 'awaiting_approval',
      createdAt: new Date().toISOString(),
    })

    const result = await runCommand(
      'approveAutomationAction',
      ctx(manager, { networkId: 1 }),
      { approvalId: 'appr-1' },
      {
        store,
        gates: {
          canAccessModule: () => true,
          canAccessProperty: () => true,
          canPerformAction: () => false,
        },
      },
    )

    expect(result.status).toBe('rejected')
    expect(result.error?.code).toBe('ACTION_DENIED')
  })

  it('property_owner cannot mutate staff modules even with matching property id', async () => {
    const store = createMemoryStore()
    const owner = staffPrincipal({
      role: 'property_owner',
      propertyIds: [],
      ownerPropertyIds: [10],
      networkWide: false,
    })

    const result = await runCommand(
      'createTask',
      ctx(owner, { networkId: 1, propertyId: 10 }),
      { title: 'Owner task', propertyId: 10, category: 'other' },
      { store },
    )

    expect(result.status).toBe('rejected')
    expect(result.error?.code).toBe('MODULE_DENIED')
  })
})
