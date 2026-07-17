import {
  constructStripeEvent,
  handleStripeWebhookEvent,
} from '../../utils/billing'

/**
 * POST /api/webhooks/stripe — Stripe signature-verified webhook ingress.
 * Configure endpoint URL in Stripe dashboard: https://app.pms.do/api/webhooks/stripe
 */
export default defineEventHandler(async (event) => {
  const signature = getHeader(event, 'stripe-signature')
  if (!signature) {
    throw createError({ statusCode: 400, statusMessage: 'stripe-signature required' })
  }

  const rawBody = await readRawBody(event)
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Empty body' })
  }

  let stripeEvent
  try {
    stripeEvent = constructStripeEvent(rawBody, signature)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature'
    throw createError({ statusCode: 400, statusMessage: message })
  }

  await handleStripeWebhookEvent(stripeEvent)
  return { received: true }
})
