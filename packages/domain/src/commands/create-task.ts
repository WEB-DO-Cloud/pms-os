import type { CommandDefinition } from '../store'
import type { TaskCategory, TaskRecord } from '../store'

export type CreateTaskInput = {
  title: string
  propertyId: number
  category?: TaskCategory
  description?: string
  reservationId?: number
  assignedToUserId?: string | null
  /** Property-local calendar date (YYYY-MM-DD), e.g. from a calendar cell. */
  dueDate?: string | null
}

export const createTask: CommandDefinition<CreateTaskInput, TaskRecord> = {
  name: 'createTask',
  module: 'tasks',
  allowedActorKinds: ['user', 'automation', 'sync'],
  risk: 'low',
  requiresApproval: false,
  supportsDryRun: true,
  needsExternalSyncRecovery: false,
  compensatingAction: 'undo_task',
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, { store }) {
    if (input.dueDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) {
      throw Object.assign(new Error('dueDate must be YYYY-MM-DD'), {
        code: 'VALIDATION',
      })
    }
    const now = new Date().toISOString()
    const task: TaskRecord = {
      id: store.nextId('task'),
      networkId: ctx.networkId,
      propertyId: input.propertyId,
      reservationId: input.reservationId ?? null,
      title: input.title,
      description: input.description ?? null,
      category: input.category ?? 'other',
      status: 'todo',
      assignedToUserId: input.assignedToUserId ?? null,
      dueDate: input.dueDate ?? null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    }
    store.tasks.push(task)
    return {
      data: task,
      resourceType: 'task',
      resourceId: String(task.id),
    }
  },
}
