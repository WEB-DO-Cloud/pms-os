import { principalCanAccessProperty } from '@pms/auth'
import { channexTimestamp } from '@pms/sync'
import { requirePrincipal } from '../../utils/auth'
import { parseNetworkId } from '../../utils/integrations'
import { requireOpsModule, runOpsCommand } from '../../utils/operations'
import { getDomainStore } from '../../utils/reservations'
import { getScopedChannexMessagingClient } from '../../utils/sync'

/** POST /api/inbox — queueGuestMessage via runCommand, then send through Channex. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    networkId: number
    reservationId?: number | null
    propertyId: number
    threadId?: string
    body: string
    channel?: string
  }>(event)
  const networkId = parseNetworkId(body.networkId)
  const { principal } = await requirePrincipal(event, networkId)
  requireOpsModule(principal, 'inbox')

  if (!principalCanAccessProperty(principal, body.propertyId)) {
    throw createError({ statusCode: 403, statusMessage: 'Property out of scope' })
  }
  if (!body.body?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Message body required' })
  }

  const store = getDomainStore(networkId)
  if (body.threadId && body.reservationId == null) {
    const thread = store.channelMessages.find(
      (message) =>
        message.networkId === networkId &&
        message.propertyId === body.propertyId &&
        message.channexThreadId === body.threadId,
    )
    if (!thread) {
      throw createError({ statusCode: 404, statusMessage: 'Inquiry thread not found' })
    }
    if (thread.reservationId != null) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Reservation-linked thread requires reservationId',
      })
    }
    const { client, property } = await getScopedChannexMessagingClient(
      networkId,
      body.propertyId,
    )
    const remoteThread = await client.getMessageThread(body.threadId).catch((err) => {
      throw createError({
        statusCode: 502,
        statusMessage: `Unable to verify Channex thread: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      })
    })
    const remoteProperty = remoteThread.data.relationships?.property?.data
    const remotePropertyId = Array.isArray(remoteProperty)
      ? remoteProperty[0]?.id
      : remoteProperty?.id
    if (remotePropertyId !== property.channexId) {
      throw createError({ statusCode: 403, statusMessage: 'Inquiry thread out of scope' })
    }
    const sent = await client.sendThreadMessage(body.threadId, body.body.trim()).catch((err) => {
      throw createError({
        statusCode: 502,
        statusMessage: `Channex delivery failed: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      })
    })
    const record = {
      id: store.nextId('channel_message'),
      networkId,
      propertyId: body.propertyId,
      reservationId: null,
      channexThreadId: body.threadId,
      channexMessageId: sent.data.id,
      provider: thread.provider,
      threadTitle: thread.threadTitle,
      sender: 'property' as const,
      body: sent.data.attributes.message ?? body.body.trim(),
      receivedAt: channexTimestamp(sent.data.attributes.inserted_at),
      createdAt: new Date().toISOString(),
    }
    if (!store.channelMessages.some((message) => message.channexMessageId === record.channexMessageId)) {
      store.channelMessages.push(record)
    }
    return {
      kind: 'channel' as const,
      message: record,
      note: 'Delivered to the guest via Channex.',
    }
  }

  if (!Number.isFinite(body.reservationId)) {
    throw createError({ statusCode: 400, statusMessage: 'Reservation or inquiry thread required' })
  }

  const result = await runOpsCommand(
    'queueGuestMessage',
    principal,
    body.propertyId,
    {
      reservationId: body.reservationId!,
      propertyId: body.propertyId,
      body: body.body.trim(),
      channel: body.channel ?? 'channex',
    },
  )
  const queued = result.data
  if (!queued) {
    throw createError({ statusCode: 500, statusMessage: 'Queue command returned no message' })
  }

  // Send-through: OTA bookings get the message delivered via Channex chat.
  const reservation = store.reservations.find(
    (r) => r.id === body.reservationId && r.networkId === networkId,
  )
  let note = 'Queued locally — reservation has no Channex booking to deliver to.'
  if (reservation?.channexBookingId) {
    try {
      const { client, property } = await getScopedChannexMessagingClient(
        networkId,
        body.propertyId,
      )
      const rawPropertyId = bookingPropertyId(reservation.channexRaw)
      if (rawPropertyId && rawPropertyId !== property.channexId) {
        throw new Error('Reservation Channex property out of scope')
      }
      await client.sendBookingMessage(reservation.channexBookingId, queued.body)
      queued.status = 'sent'
      note = 'Delivered to the guest via Channex.'
    } catch (err) {
      queued.status = 'failed'
      note = `Channex delivery failed: ${err instanceof Error ? err.message : 'unknown error'}`
    }
  }
  return { kind: 'outbound' as const, message: queued, note }
})

function bookingPropertyId(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const resource = raw as Record<string, unknown>
  const attributes =
    resource.attributes && typeof resource.attributes === 'object'
      ? (resource.attributes as Record<string, unknown>)
      : resource
  return typeof attributes.property_id === 'string' ? attributes.property_id : null
}
