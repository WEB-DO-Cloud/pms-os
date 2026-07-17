import type { CommandDefinition, TaskRecord, TaskStatus } from '../store'

export type UpdateTaskStatusInput = {
  taskId: number
  propertyId: number
  status: TaskStatus
}

export const updateTaskStatus: CommandDefinition<
  UpdateTaskStatusInput,
  TaskRecord
> = {
  name: 'updateTaskStatus',
  module: 'tasks',
  allowedActorKinds: ['user', 'automation'],
  risk: 'low',
  requiresApproval: false,
  supportsDryRun: true,
  needsExternalSyncRecovery: false,
  compensatingAction: 'undo_task',
  resolvePropertyId: (input) => input.propertyId,
  async execute(ctx, input, { store }) {
    const task = store.tasks.find(
      (t) =>
        t.id === input.taskId &&
        t.networkId === ctx.networkId &&
        t.propertyId === input.propertyId,
    )
    if (!task) {
      throw Object.assign(new Error('Task not found in scope'), {
        code: 'NOT_FOUND',
      })
    }
    task.status = input.status
    task.updatedAt = new Date().toISOString()
    task.completedAt = input.status === 'done' ? task.updatedAt : null
    return {
      data: { ...task },
      resourceType: 'task',
      resourceId: String(task.id),
    }
  },
}
