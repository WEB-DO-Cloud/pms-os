<script setup lang="ts">
type AriWriteHealth = {
  pendingOutboxCount: number
  acceptedUnreconciledCount: number
  partialCount: number
  driftedCount: number
  retryCount: number
  warningIntentCount: number
  oldestAcceptedAt: string | null
  oldestQueuedAt: string | null
  oldestPendingBookingRevisionAt: string | null
  stuckAcceptedAlerts: Array<{
    propertyId: number
    intentId: number
    lane: string
    ageMs: number
    roomTypeChannexId?: string
    ratePlanChannexId?: string
  }>
}

type Health = {
  networkId: number
  status: string
  lastPullAt: string | null
  lastWebhookAt: string | null
  lastAckAt: string | null
  lastErrorCode: string | null
  updatedAt: string
  deadLetterCount?: number
  pendingAckCount?: number
  ariWrite?: AriWriteHealth
}

const props = defineProps<{
  networkId: number
  connected: boolean
}>()

const health = ref<Health | null>(null)
const busy = ref<string | null>(null)
const error = ref<string | null>(null)
const actionMsg = ref<string | null>(null)

function relative(iso: string | null) {
  if (!iso) return 'Never'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return iso
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return new Date(iso).toLocaleString()
}

function tone(status: string) {
  if (status === 'healthy') return 'healthy'
  if (status === 'warning' || status === 'running') return 'warning'
  if (status === 'failed') return 'failed'
  return 'muted'
}

function ariTone(h: AriWriteHealth | undefined) {
  if (!h) return 'muted'
  if (h.stuckAcceptedAlerts.length > 0 || h.driftedCount > 0) return 'failed'
  if (h.acceptedUnreconciledCount > 0 || h.retryCount > 0 || h.partialCount > 0) return 'warning'
  if (h.pendingOutboxCount > 0) return 'warning'
  return 'healthy'
}

async function refresh() {
  error.value = null
  try {
    health.value = await $fetch<Health>('/api/sync/health', {
      query: { networkId: props.networkId },
    })
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Failed to load health'
  }
}

async function runAction(kind: 'pull' | 'ack' | 'retry') {
  busy.value = kind
  error.value = null
  actionMsg.value = null
  const path =
    kind === 'pull'
      ? '/api/sync/pull'
      : kind === 'ack'
        ? '/api/sync/ack'
        : '/api/sync/retry-dead-letters'
  try {
    const res = await $fetch<Record<string, unknown>>(path, {
      method: 'POST',
      body: { networkId: props.networkId },
    })
    actionMsg.value =
      kind === 'pull'
        ? `Pull finished: ${JSON.stringify(res)}`
        : kind === 'ack'
          ? `Ack processing: ${JSON.stringify(res)}`
          : `Retry finished: ${JSON.stringify(res)}`
    await refresh()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    error.value = e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Action failed'
  } finally {
    busy.value = null
  }
}

onMounted(refresh)

watch(
  () => props.networkId,
  () => {
    void refresh()
  },
)

defineExpose({ refresh })
</script>

<template>
  <section class="panel">
    <div class="panel-head">
      <div>
        <h2>Sync health</h2>
        <p>Safe operational metadata only. Credentials and guest payloads remain masked.</p>
      </div>
      <button type="button" class="btn-ghost" :disabled="!!busy" @click="refresh">Refresh</button>
    </div>

    <div v-if="health" class="health-list">
      <article>
        <span class="health-dot" :class="tone(health.status)" />
        <div>
          <strong>Overall status</strong>
          <small>
            Updated {{ relative(health.updatedAt) }}
            <template v-if="health.lastErrorCode"> · {{ health.lastErrorCode }}</template>
          </small>
        </div>
        <em :class="tone(health.status)">{{ health.status }}</em>
      </article>
      <article>
        <span class="health-dot" :class="health.lastPullAt ? 'healthy' : 'muted'" />
        <div>
          <strong>Last successful pull</strong>
          <small>{{ relative(health.lastPullAt) }}</small>
        </div>
        <em :class="health.lastPullAt ? 'healthy' : 'muted'">{{ health.lastPullAt ? 'OK' : 'Idle' }}</em>
      </article>
      <article>
        <span class="health-dot" :class="health.lastWebhookAt ? 'healthy' : 'muted'" />
        <div>
          <strong>Last webhook</strong>
          <small>{{ relative(health.lastWebhookAt) }}</small>
        </div>
        <em :class="health.lastWebhookAt ? 'healthy' : 'muted'">{{ health.lastWebhookAt ? 'OK' : 'None' }}</em>
      </article>
      <article>
        <span
          class="health-dot"
          :class="(health.pendingAckCount ?? 0) > 0 ? 'warning' : health.lastAckAt ? 'healthy' : 'muted'"
        />
        <div>
          <strong>Pending acknowledgements</strong>
          <small>
            {{ health.pendingAckCount ?? 0 }} pending · last ack {{ relative(health.lastAckAt) }}
          </small>
        </div>
        <em :class="(health.pendingAckCount ?? 0) > 0 ? 'warning' : 'muted'">
          {{ health.pendingAckCount ?? 0 }}
        </em>
      </article>
      <article>
        <span
          class="health-dot"
          :class="(health.deadLetterCount ?? 0) > 0 ? 'failed' : 'healthy'"
        />
        <div>
          <strong>Dead letters</strong>
          <small>Failed revisions awaiting operator recovery</small>
        </div>
        <em :class="(health.deadLetterCount ?? 0) > 0 ? 'failed' : 'healthy'">
          {{ health.deadLetterCount ?? 0 }}
        </em>
      </article>
      <article v-if="health.ariWrite">
        <span class="health-dot" :class="ariTone(health.ariWrite)" />
        <div>
          <strong>ARI / Booking CRS outbox</strong>
          <small>
            {{ health.ariWrite.pendingOutboxCount }} pending ·
            {{ health.ariWrite.acceptedUnreconciledCount }} accepted ·
            {{ health.ariWrite.partialCount }} partial ·
            {{ health.ariWrite.driftedCount }} drift ·
            {{ health.ariWrite.retryCount }} retry ·
            {{ health.ariWrite.warningIntentCount }} warnings
            <template v-if="health.ariWrite.oldestAcceptedAt">
              · oldest accepted {{ relative(health.ariWrite.oldestAcceptedAt) }}
            </template>
            <template v-if="health.ariWrite.oldestPendingBookingRevisionAt">
              · oldest booking CRS {{ relative(health.ariWrite.oldestPendingBookingRevisionAt) }}
            </template>
          </small>
          <small
            v-if="health.ariWrite.stuckAcceptedAlerts.length"
            class="alert-line"
          >
            Stuck accepted:
            <template
              v-for="(a, i) in health.ariWrite.stuckAcceptedAlerts.slice(0, 3)"
              :key="a.intentId"
            >
              <template v-if="i">; </template>
              prop {{ a.propertyId }} / {{ a.lane }} #{{ a.intentId }}
              ({{ Math.round(a.ageMs / 60_000) }}m)
            </template>
            <template v-if="health.ariWrite.stuckAcceptedAlerts.length > 3">
              +{{ health.ariWrite.stuckAcceptedAlerts.length - 3 }} more
            </template>
          </small>
        </div>
        <em :class="ariTone(health.ariWrite)">{{ health.ariWrite.pendingOutboxCount }}</em>
      </article>
    </div>

    <div class="recovery">
      <h3>Recovery</h3>
      <div class="recovery-actions">
        <button
          type="button"
          class="btn-secondary"
          :disabled="!connected || !!busy"
          @click="runAction('pull')"
        >
          {{ busy === 'pull' ? 'Pulling…' : 'Pull now' }}
        </button>
        <button
          type="button"
          class="btn-secondary"
          :disabled="!connected || !!busy"
          @click="runAction('ack')"
        >
          {{ busy === 'ack' ? 'Processing…' : 'Process acks' }}
        </button>
        <button
          type="button"
          class="btn-secondary"
          :disabled="!connected || !!busy"
          @click="runAction('retry')"
        >
          {{ busy === 'retry' ? 'Retrying…' : 'Retry dead letters' }}
        </button>
      </div>
    </div>

    <p v-if="actionMsg" class="msg muted-msg" role="status">{{ actionMsg }}</p>
    <p v-if="error" class="msg failed" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.panel {
  margin-top: 1.6rem;
  padding: 1.25rem 0 0;
  border-top: 1px solid var(--line);
}

.panel-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.panel-head h2 {
  margin: 0;
  font-size: 1rem;
}

.panel-head p {
  margin: 0.4rem 0 0;
  color: var(--muted);
  font-size: 0.72rem;
}

.btn-ghost {
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 2rem;
  background: transparent;
  color: var(--muted);
  font-size: 0.62rem;
  cursor: pointer;
}

.btn-secondary {
  padding: 0.5rem 0.85rem;
  border: 1px solid var(--line-strong);
  border-radius: calc(var(--radius) - 0.25rem);
  background: var(--surface-raised);
  color: var(--ink);
  font-size: 0.7rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-secondary:disabled,
.btn-ghost:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.health-list {
  margin-top: 1.2rem;
  border-top: 1px solid var(--line);
}

.health-list article {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.9rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--line);
}

.health-list strong,
.health-list small {
  display: block;
}

.health-list strong {
  font-size: 0.78rem;
}

.health-list small {
  margin-top: 0.2rem;
  color: var(--muted);
  font-size: 0.67rem;
}

.alert-line {
  color: var(--danger) !important;
}

.health-list em {
  font-size: 0.66rem;
  font-style: normal;
  font-weight: 700;
  text-transform: capitalize;
}

.health-dot {
  width: 0.48rem;
  height: 0.48rem;
  border-radius: 50%;
  background: var(--faint);
}

.healthy {
  color: var(--accent);
}

.health-dot.healthy {
  background: var(--accent);
}

.warning {
  color: var(--warning);
}

.health-dot.warning {
  background: var(--warning);
}

.failed {
  color: var(--danger);
}

.health-dot.failed {
  background: var(--danger);
}

.muted {
  color: var(--muted);
}

.recovery {
  margin-top: 1.4rem;
}

.recovery h3 {
  margin: 0 0 0.7rem;
  font-size: 0.78rem;
}

.recovery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.msg {
  margin: 0.9rem 0 0;
  font-size: 0.68rem;
  word-break: break-word;
}

.muted-msg {
  color: var(--muted);
}
</style>
