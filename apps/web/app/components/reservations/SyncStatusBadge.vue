<script setup lang="ts">
defineProps<{
  status: string
  pendingSyncReason?: string | null
  compact?: boolean
}>()

function label(status: string) {
  if (status === 'pending_sync') return 'Pending sync'
  if (status === 'confirmed') return 'Confirmed'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'pending') return 'Pending'
  return status.replace(/_/g, ' ')
}

function tone(status: string) {
  if (status === 'pending_sync') return 'pending'
  if (status === 'confirmed') return 'ok'
  if (status === 'cancelled') return 'danger'
  return 'muted'
}
</script>

<template>
  <span class="badge" :class="[tone(status), compact ? 'compact' : '']" :title="pendingSyncReason ?? undefined">
    <i aria-hidden="true" />
    {{ label(status) }}
    <small v-if="!compact && status === 'pending_sync' && pendingSyncReason">
      · {{ pendingSyncReason.replace(/_/g, ' ') }}
    </small>
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 100%;
  color: var(--muted);
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: capitalize;
}

.badge i {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: var(--faint);
}

.badge.pending {
  color: var(--warning);
}

.badge.pending i {
  background: var(--warning);
}

.badge.ok {
  color: var(--accent-strong);
}

.badge.ok i {
  background: var(--accent);
}

.badge.danger {
  color: var(--danger);
}

.badge.danger i {
  background: var(--danger);
}

.badge small {
  overflow: hidden;
  color: inherit;
  font-weight: 500;
  opacity: 0.85;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact {
  font-size: 0.6rem;
}
</style>
