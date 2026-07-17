import type { CommandDefinition } from '../store'
import type { TaskCategory, TaskRecord } from '../store'

export type CreateTaskInput = {
  title: string
  propertyId: number
  category?: TaskCategory
  description?: string
  reservationId?: number
  assignedToUserId?: string | null
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
