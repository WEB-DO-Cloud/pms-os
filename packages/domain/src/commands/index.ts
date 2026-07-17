import { createTask } from './create-task'
import { updateTaskStatus } from './update-task-status'
import { attachReservationNote } from './attach-reservation-note'
import { applyChannexBookingRevision } from './apply-channex-booking-revision'
import { createDirectReservation } from './create-direct-reservation'
import { checkInReservation } from './check-in-reservation'
import { checkOutReservation } from './check-out-reservation'
import { queueGuestMessage } from './queue-guest-message'
import { recordLedgerPayment } from './record-ledger-payment'
import { approveAutomationAction } from './approve-automation-action'
import { updateGuestEnrichment } from './update-guest-enrichment'
import { updatePropertyOps } from './update-property-ops'
import { importLocalReviews } from './import-local-reviews'
import { updateReviewStatus } from './update-review-status'
import type { AnyCommandDefinition } from '../store'

export const commandRegistry = {
  createTask,
  updateTaskStatus,
  attachReservationNote,
  applyChannexBookingRevision,
  createDirectReservation,
  checkInReservation,
  checkOutReservation,
  queueGuestMessage,
  recordLedgerPayment,
  approveAutomationAction,
  updateGuestEnrichment,
  updatePropertyOps,
  importLocalReviews,
  updateReviewStatus,
} as const satisfies Record<string, AnyCommandDefinition>

export type CommandName = keyof typeof commandRegistry

export type CommandInputMap = {
  createTask: import('./create-task').CreateTaskInput
  updateTaskStatus: import('./update-task-status').UpdateTaskStatusInput
  attachReservationNote: import('./attach-reservation-note').AttachReservationNoteInput
  applyChannexBookingRevision: import('./apply-channex-booking-revision').ApplyChannexBookingRevisionInput
  createDirectReservation: import('./create-direct-reservation').CreateDirectReservationInput
  checkInReservation: import('./check-in-reservation').CheckInReservationInput
  checkOutReservation: import('./check-out-reservation').CheckOutReservationInput
  queueGuestMessage: import('./queue-guest-message').QueueGuestMessageInput
  recordLedgerPayment: import('./record-ledger-payment').RecordLedgerPaymentInput
  approveAutomationAction: import('./approve-automation-action').ApproveAutomationActionInput
  updateGuestEnrichment: import('./update-guest-enrichment').UpdateGuestEnrichmentInput
  updatePropertyOps: import('./update-property-ops').UpdatePropertyOpsInput
  importLocalReviews: import('./import-local-reviews').ImportLocalReviewsInput
  updateReviewStatus: import('./update-review-status').UpdateReviewStatusInput
}

export type CommandOutputMap = {
  createTask: import('../store').TaskRecord
  updateTaskStatus: import('../store').TaskRecord
  attachReservationNote: import('../store').ReservationRecord
  applyChannexBookingRevision: import('./apply-channex-booking-revision').ApplyChannexBookingRevisionOutput
  createDirectReservation: import('../store').ReservationRecord
  checkInReservation: import('../store').ReservationRecord
  checkOutReservation: import('../store').ReservationRecord
  queueGuestMessage: import('../store').OutboundMessageRecord
  recordLedgerPayment: import('../store').LedgerRecord
  approveAutomationAction: import('./approve-automation-action').ApproveAutomationActionOutput
  updateGuestEnrichment: import('../store').GuestRecord
  updatePropertyOps: import('../store').PropertyOpsRecord
  importLocalReviews: { imported: number; reviews: import('../store').ReviewRecord[] }
  updateReviewStatus: import('../store').ReviewRecord
}

export {
  createTask,
  updateTaskStatus,
  attachReservationNote,
  applyChannexBookingRevision,
  createDirectReservation,
  checkInReservation,
  checkOutReservation,
  queueGuestMessage,
  recordLedgerPayment,
  approveAutomationAction,
  updateGuestEnrichment,
  updatePropertyOps,
  importLocalReviews,
  updateReviewStatus,
}

export type { ApplyChannexBookingRevisionInput } from './apply-channex-booking-revision'
