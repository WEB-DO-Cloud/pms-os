<script setup lang="ts">
const { currentNetworkId } = useCurrentNetwork()
const { enabled: aiEnabled, disabledHint: aiDisabledHint } = useAiStatus()

type Reservation = {
  id: number
  propertyId: number
  propertyName: string
  guestName: string | null
  guestEmail: string | null
  guestPhone: string | null
  status: string
  operationalStatus: string | null
  statusLine: string
  checkInDate: string
  checkOutDate: string
  adults: number
  children: number
  infants: number
  channel: string | null
}

type OutboundMessage = {
  id: number
  propertyId: number
  reservationId: number
  channel: string
  body: string
  status: string
  createdAt: string
}

type ChannelMessage = {
  id: number
  propertyId: number
  reservationId: number | null
  channexThreadId: string
  provider: string | null
  threadTitle: string | null
  sender: string
  body: string
  receivedAt: string
}

type ChatMessage = {
  key: string
  from: 'guest' | 'us' | 'system'
  body: string
  at: string
  status?: string
}

type Conversation = {
  key: string
  title: string
  provider: string | null
  propertyId: number
  reservationId: number | null
  threadId: string | null
  messages: ChatMessage[]
  lastAt: string
  statusLine: string
}

type ConversationView = Conversation & { unread: number }

type ListFilter = 'all' | 'unread'

const reservations = ref<Reservation[]>([])
const outbound = ref<OutboundMessage[]>([])
const channelMessages = ref<ChannelMessage[]>([])
const readAt = ref<Record<string, string>>({})
const selectedKey = ref<string | null>(null)
const listFilter = ref<ListFilter>('all')
const search = ref('')
const draft = ref('')
const aiBrief = ref('')
const showAiBrief = ref(false)
const error = ref<string | null>(null)
const loading = ref(false)
const sending = ref(false)
const syncing = ref(false)
const aiBusy = ref(false)
const newReservationId = ref<number | null>(null)

const reservationById = computed(
  () => new Map(reservations.value.map((reservation) => [reservation.id, reservation])),
)

const baseConversations = computed<Conversation[]>(() => {
  const map = new Map<string, Conversation>()

  for (const message of channelMessages.value) {
    const key = `t:${message.channexThreadId}`
    let conversation = map.get(key)
    if (!conversation) {
      const reservation =
        message.reservationId == null ? null : reservationById.value.get(message.reservationId)
      conversation = {
        key,
        title:
          message.threadTitle ??
          reservation?.guestName ??
          (message.reservationId == null ? 'Guest inquiry' : `Reservation #${message.reservationId}`),
        provider: message.provider,
        propertyId: message.propertyId,
        reservationId: message.reservationId,
        threadId: message.channexThreadId,
        messages: [],
        lastAt: '',
        statusLine: reservation?.statusLine ?? 'Inquiry · no booking',
      }
      map.set(key, conversation)
    }
    if (conversation.reservationId == null && message.reservationId != null) {
      conversation.reservationId = message.reservationId
      conversation.statusLine =
        reservationById.value.get(message.reservationId)?.statusLine ?? conversation.statusLine
    }
    conversation.messages.push({
      key: `c${message.id}`,
      from:
        message.sender === 'guest' ? 'guest' : message.sender === 'system' ? 'system' : 'us',
      body: message.body,
      at: message.receivedAt,
    })
  }

  const byReservation = new Map<number, Conversation>()
  for (const conversation of map.values()) {
    if (conversation.reservationId != null) {
      byReservation.set(conversation.reservationId, conversation)
    }
  }

  for (const message of outbound.value) {
    let conversation = byReservation.get(message.reservationId)
    if (!conversation) {
      const reservation = reservationById.value.get(message.reservationId)
      const key = `r:${message.reservationId}`
      conversation = {
        key,
        title: reservation?.guestName ?? `Reservation #${message.reservationId}`,
        provider: reservation?.channel ?? null,
        propertyId: message.propertyId,
        reservationId: message.reservationId,
        threadId: null,
        messages: [],
        lastAt: '',
        statusLine: reservation?.statusLine ?? 'Reservation',
      }
      map.set(key, conversation)
      byReservation.set(message.reservationId, conversation)
    }
    // ponytail: body-match avoids showing the local sent row and its Channex echo twice.
    if (
      message.status === 'sent' &&
      conversation.messages.some((item) => item.from === 'us' && item.body === message.body)
    ) {
      continue
    }
    conversation.messages.push({
      key: `o${message.id}`,
      from: 'us',
      body: message.body,
      at: message.createdAt,
      status: message.status,
    })
  }

  for (const conversation of map.values()) {
    conversation.messages.sort((a, b) => a.at.localeCompare(b.at))
    conversation.lastAt = conversation.messages.at(-1)?.at ?? ''
  }
  return [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt))
})

const conversations = computed<ConversationView[]>(() =>
  baseConversations.value.map((conversation) => {
    const lastRead = readAt.value[conversation.key] ?? null
    const unread = conversation.messages.filter(
      (message) => message.from === 'guest' && (lastRead == null || message.at > lastRead),
    ).length
    return { ...conversation, unread }
  }),
)

const visibleConversations = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase()
  return conversations.value.filter((conversation) => {
    if (listFilter.value === 'unread' && conversation.unread === 0) return false
    if (!needle) return true
    const reservation =
      conversation.reservationId == null
        ? null
        : reservationById.value.get(conversation.reservationId)
    const headerMatches = [
      conversation.title,
      conversation.provider,
      conversation.statusLine,
      reservation?.propertyName,
    ].some((value) => value?.toLocaleLowerCase().includes(needle))
    return (
      headerMatches ||
      conversation.messages.some((message) =>
        message.body.toLocaleLowerCase().includes(needle),
      )
    )
  })
})

const unreadTotal = computed(() =>
  conversations.value.reduce((total, conversation) => total + conversation.unread, 0),
)

const selected = computed<ConversationView | null>(() => {
  const existing = conversations.value.find((conversation) => conversation.key === selectedKey.value)
  if (existing) return existing
  if (!selectedKey.value?.startsWith('r:')) return null
  const id = Number(selectedKey.value.slice(2))
  const migrated = conversations.value.find(
    (conversation) => conversation.reservationId === id,
  )
  if (migrated) return migrated
  const reservation = reservationById.value.get(id)
  if (!reservation) return null
  return {
    key: selectedKey.value,
    title: reservation.guestName ?? `Reservation #${reservation.id}`,
    provider: reservation.channel,
    propertyId: reservation.propertyId,
    reservationId: reservation.id,
    threadId: null,
    messages: [],
    lastAt: '',
    unread: 0,
    statusLine: reservation.statusLine,
  }
})

const selectedReservation = computed(() =>
  selected.value?.reservationId == null
    ? null
    : (reservationById.value.get(selected.value.reservationId) ?? null),
)

const newConversationOptions = computed(() => {
  const existing = new Set(
    conversations.value
      .map((conversation) => conversation.reservationId)
      .filter((id): id is number => id != null),
  )
  return reservations.value.filter((reservation) => !existing.has(reservation.id))
})

async function load() {
  loading.value = true
  error.value = null
  try {
    const response = await $fetch<{
      reservations: Reservation[]
      messages: OutboundMessage[]
      channelMessages: ChannelMessage[]
      reads: { conversationKey: string; lastReadAt: string }[]
    }>('/api/inbox', { query: { networkId: currentNetworkId.value } })
    reservations.value = response.reservations
    outbound.value = response.messages
    channelMessages.value = response.channelMessages ?? []
    readAt.value = Object.fromEntries(
      response.reads.map((read) => [read.conversationKey, read.lastReadAt]),
    )
    if (selectedKey.value == null && conversations.value.length) {
      await selectConversation(conversations.value[0]!)
    }
  } catch (err: unknown) {
    error.value = apiError(err, 'Unable to load inbox')
  } finally {
    loading.value = false
  }
}

async function syncNow() {
  syncing.value = true
  try {
    await $fetch('/api/inbox/sync', {
      method: 'POST',
      body: { networkId: currentNetworkId.value },
    })
    await load()
  } catch {
    // Front desk can refresh local state; only integration managers trigger Channex pulls.
    await load()
  } finally {
    syncing.value = false
  }
}

async function selectConversation(conversation: Conversation) {
  selectedKey.value = conversation.key
  if (conversation.unread === 0) return
  const previous = readAt.value[conversation.key]
  const optimistic = new Date().toISOString()
  readAt.value = { ...readAt.value, [conversation.key]: optimistic }
  try {
    const response = await $fetch<{ lastReadAt: string }>('/api/inbox/read', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        conversationKey: conversation.key,
        propertyId: conversation.propertyId,
      },
    })
    readAt.value = { ...readAt.value, [conversation.key]: response.lastReadAt }
  } catch {
    if (previous) readAt.value = { ...readAt.value, [conversation.key]: previous }
    else {
      const next = { ...readAt.value }
      delete next[conversation.key]
      readAt.value = next
    }
  }
}

async function send() {
  const conversation = selected.value
  if (!conversation || !draft.value.trim() || sending.value) return
  sending.value = true
  error.value = null
  try {
    await $fetch('/api/inbox', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        reservationId: conversation.reservationId,
        propertyId: conversation.propertyId,
        threadId: conversation.threadId,
        body: draft.value.trim(),
        channel: 'channex',
      },
    })
    draft.value = ''
    await load()
  } catch (err: unknown) {
    error.value = apiError(err, 'Send failed')
  } finally {
    sending.value = false
  }
}

async function draftWithAi() {
  if (selected.value?.reservationId == null || aiBusy.value) return
  aiBusy.value = true
  error.value = null
  try {
    const response = await $fetch<{
      draft: { body: string; caution?: string | null }
    }>('/api/ai/concierge/draft', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        reservationId: selected.value.reservationId,
        brief: aiBrief.value.trim() || undefined,
      },
    })
    draft.value = response.draft.body
    showAiBrief.value = false
  } catch (err: unknown) {
    error.value = apiError(err, 'AI draft failed')
  } finally {
    aiBusy.value = false
  }
}

function startConversation() {
  if (newReservationId.value == null) return
  selectedKey.value = `r:${newReservationId.value}`
  newReservationId.value = null
}

function timeLabel(iso: string) {
  if (!iso) return ''
  const date = new Date(iso)
  const now = new Date()
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function stayNights(from: string, to: string) {
  return Math.max(
    0,
    Math.round(
      (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
        86_400_000,
    ),
  )
}

function apiError(err: unknown, fallback: string) {
  const e = err as {
    data?: { statusMessage?: string }
    statusMessage?: string
    message?: string
  }
  return e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? fallback
}

onMounted(async () => {
  await load()
  void syncNow()
})
watch(currentNetworkId, () => {
  selectedKey.value = null
  void load()
})
</script>

<template>
  <div class="page-shell chat-page">
    <div class="chat-shell" :class="{ 'has-selection': selected != null }">
      <aside class="conv-list">
        <header class="conv-head">
          <div class="title-row">
            <h1>Inbox</h1>
            <span v-if="unreadTotal" class="total-badge">{{ unreadTotal }}</span>
          </div>
          <button
            type="button"
            class="icon-btn"
            :disabled="syncing"
            aria-label="Refresh messages"
            title="Refresh messages"
            @click="syncNow"
          >
            {{ syncing ? '…' : '⟳' }}
          </button>
        </header>

        <div class="list-tabs" role="tablist" aria-label="Conversation filter">
          <button
            type="button"
            :class="{ active: listFilter === 'all' }"
            @click="listFilter = 'all'"
          >
            All
          </button>
          <button
            type="button"
            :class="{ active: listFilter === 'unread' }"
            @click="listFilter = 'unread'"
          >
            Unread <span v-if="unreadTotal">{{ unreadTotal }}</span>
          </button>
        </div>

        <div class="search-wrap">
          <input v-model="search" type="search" placeholder="Search conversations…" />
        </div>

        <label v-if="newConversationOptions.length" class="new-conv">
          <span class="sr-only">New conversation</span>
          <select v-model="newReservationId" @change="startConversation">
            <option :value="null">New conversation…</option>
            <option v-for="reservation in newConversationOptions" :key="reservation.id" :value="reservation.id">
              {{ reservation.guestName ?? `Reservation #${reservation.id}` }}
            </option>
          </select>
        </label>

        <p v-if="loading && !conversations.length" class="muted side-note">Loading…</p>
        <p v-else-if="!visibleConversations.length" class="muted side-note">
          {{ search ? 'No matching conversations.' : 'No conversations in this view.' }}
        </p>

        <button
          v-for="conversation in visibleConversations"
          :key="conversation.key"
          type="button"
          class="conv-item"
          :class="{ active: conversation.key === selectedKey, unread: conversation.unread > 0 }"
          @click="selectConversation(conversation)"
        >
          <span class="avatar" aria-hidden="true">
            {{ conversation.title.slice(0, 1).toUpperCase() }}
          </span>
          <span class="conv-meta">
            <span class="conv-top">
              <strong>{{ conversation.title }}</strong>
              <time>{{ timeLabel(conversation.lastAt) }}</time>
            </span>
            <span class="status-line">{{ conversation.statusLine }}</span>
            <span class="conv-preview">
              <span v-if="conversation.provider" class="provider">{{ conversation.provider }}</span>
              {{ conversation.messages.at(-1)?.body ?? 'No messages yet' }}
            </span>
          </span>
          <span v-if="conversation.unread" class="unread-badge">{{ conversation.unread }}</span>
        </button>
      </aside>

      <section class="chat-pane">
        <template v-if="selected">
          <header class="chat-top">
            <button
              type="button"
              class="icon-btn back"
              aria-label="Back to conversations"
              @click="selectedKey = null"
            >
              ←
            </button>
            <div>
              <strong>{{ selected.title }}</strong>
              <p class="chat-sub">
                <span v-if="selected.provider">{{ selected.provider }} · </span>
                <NuxtLink
                  v-if="selected.reservationId != null"
                  :to="`/reservations/${selected.reservationId}`"
                >
                  Reservation #{{ selected.reservationId }}
                </NuxtLink>
                <span v-else>Inquiry · no booking</span>
              </p>
            </div>
          </header>

          <div class="thread" role="log" aria-label="Conversation">
            <p v-if="!selected.messages.length" class="muted center-note">
              No messages yet — say hello below.
            </p>
            <div
              v-for="message in selected.messages"
              :key="message.key"
              class="bubble-row"
              :class="message.from"
            >
              <div class="bubble">
                <p class="bubble-body">{{ message.body }}</p>
                <span class="bubble-meta">
                  {{ timeLabel(message.at) }}
                  <template v-if="message.status && message.status !== 'sent'">
                    · {{ message.status }}
                  </template>
                </span>
              </div>
            </div>
          </div>

          <p v-if="error" class="gate" role="alert">{{ error }}</p>
          <div v-if="showAiBrief" class="ai-brief">
            <input v-model="aiBrief" type="text" placeholder="Optional instruction for Grok…" />
            <button type="button" :disabled="aiBusy" @click="draftWithAi">
              {{ aiBusy ? 'Drafting…' : 'Create draft' }}
            </button>
          </div>
          <form class="composer" @submit.prevent="send">
            <button
              type="button"
              class="ai-button"
              :disabled="!aiEnabled || selected.reservationId == null"
              :title="
                selected.reservationId == null
                  ? 'AI drafts require a reservation'
                  : aiDisabledHint || 'Draft with Grok'
              "
              @click="showAiBrief = !showAiBrief"
            >
              AI
            </button>
            <textarea
              v-model="draft"
              rows="1"
              placeholder="Message…"
              :disabled="sending"
              @keydown.enter.exact.prevent="send"
            />
            <button type="submit" :disabled="sending || !draft.trim()">
              {{ sending ? '…' : 'Send' }}
            </button>
          </form>
        </template>

        <div v-else class="empty-pane">
          <p class="muted">Select a conversation</p>
        </div>
      </section>

      <aside v-if="selected" class="context-pane">
        <template v-if="selectedReservation">
          <section>
            <p class="eyebrow">Reservation</p>
            <strong>{{ selectedReservation.propertyName }}</strong>
            <span class="context-status">{{ selectedReservation.statusLine }}</span>
          </section>
          <dl>
            <div>
              <dt>Check-in</dt>
              <dd>{{ selectedReservation.checkInDate }}</dd>
            </div>
            <div>
              <dt>Check-out</dt>
              <dd>{{ selectedReservation.checkOutDate }}</dd>
            </div>
            <div>
              <dt>Stay</dt>
              <dd>
                {{ stayNights(selectedReservation.checkInDate, selectedReservation.checkOutDate) }}
                nights
              </dd>
            </div>
            <div>
              <dt>Guests</dt>
              <dd>
                {{ selectedReservation.adults }} adults
                <template v-if="selectedReservation.children">
                  · {{ selectedReservation.children }} children
                </template>
                <template v-if="selectedReservation.infants">
                  · {{ selectedReservation.infants }} infants
                </template>
              </dd>
            </div>
          </dl>
          <section>
            <p class="eyebrow">Guest</p>
            <strong>{{ selectedReservation.guestName ?? 'Guest' }}</strong>
            <a v-if="selectedReservation.guestEmail" :href="`mailto:${selectedReservation.guestEmail}`">
              {{ selectedReservation.guestEmail }}
            </a>
            <a v-if="selectedReservation.guestPhone" :href="`tel:${selectedReservation.guestPhone}`">
              {{ selectedReservation.guestPhone }}
            </a>
          </section>
          <NuxtLink class="detail-link" :to="`/reservations/${selectedReservation.id}`">
            Open reservation
          </NuxtLink>
        </template>
        <template v-else>
          <p class="eyebrow">Inquiry</p>
          <strong>{{ selected.title }}</strong>
          <p class="muted context-copy">
            This Airbnb thread has no booking yet. You can reply here through Channex.
          </p>
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.chat-page { padding-top: 1.25rem; padding-bottom: 1.5rem; }
.chat-shell {
  display: grid;
  grid-template-columns: 310px minmax(360px, 1fr) 260px;
  height: calc(100vh - 9rem);
  min-height: 440px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(13, 24, 22, 0.72);
}
.conv-list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  border-right: 1px solid var(--line);
}
.conv-head, .title-row, .conv-top, .chat-top {
  display: flex;
  align-items: center;
}
.conv-head { justify-content: space-between; padding: 1rem 1rem 0.6rem; }
.title-row { gap: 0.45rem; }
.conv-head h1 { margin: 0; font-size: 1.05rem; letter-spacing: -0.02em; }
.icon-btn, .list-tabs button, .composer button, .ai-brief button {
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  background: var(--surface);
  color: var(--accent-strong);
  cursor: pointer;
}
.icon-btn { padding: 0.25rem 0.55rem; font-size: 0.85rem; }
.total-badge, .unread-badge {
  display: inline-grid;
  place-items: center;
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--accent);
  color: #07110e;
  font-size: 0.58rem;
  font-weight: 800;
}
.list-tabs { display: flex; gap: 0.35rem; padding: 0 1rem 0.65rem; }
.list-tabs button { padding: 0.3rem 0.55rem; color: var(--muted); font-size: 0.66rem; }
.list-tabs button.active { border-color: rgba(101, 213, 174, 0.45); color: var(--accent-strong); }
.list-tabs button span { margin-left: 0.2rem; }
.search-wrap, .new-conv { padding: 0 1rem 0.65rem; }
.search-wrap input, .new-conv select, .ai-brief input, .composer textarea {
  width: 100%;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}
.search-wrap input, .new-conv select {
  padding: 0.45rem 0.6rem;
  border-radius: 0.45rem;
  font-size: 0.7rem;
}
.side-note { padding: 1rem; font-size: 0.72rem; }
.conv-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.65rem;
  align-items: center;
  width: 100%;
  padding: 0.72rem 1rem;
  border: 0;
  border-top: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.conv-item:hover { background: rgba(101, 213, 174, 0.06); }
.conv-item.active { background: rgba(101, 213, 174, 0.12); }
.conv-item.unread strong { color: var(--accent-strong); font-weight: 800; }
.avatar {
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 50%;
  background: rgba(101, 213, 174, 0.18);
  color: var(--accent-strong);
  font-weight: 700;
}
.conv-meta { min-width: 0; }
.conv-top { justify-content: space-between; gap: 0.5rem; }
.conv-top strong, .conv-preview, .status-line {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conv-top strong { font-size: 0.78rem; }
.conv-top time { flex-shrink: 0; color: var(--faint); font-size: 0.6rem; }
.status-line { margin-top: 0.12rem; color: var(--warning); font-size: 0.59rem; }
.conv-preview { color: var(--muted); font-size: 0.67rem; }
.provider { margin-right: 0.3rem; color: var(--accent); font-size: 0.56rem; font-weight: 700; text-transform: uppercase; }
.chat-pane { display: flex; flex-direction: column; min-width: 0; }
.chat-top { gap: 0.6rem; padding: 0.85rem 1.1rem; border-bottom: 1px solid var(--line); }
.chat-top strong { font-size: 0.85rem; }
.chat-sub { margin: 0.1rem 0 0; color: var(--faint); font-size: 0.65rem; }
.chat-sub a, .context-pane a { color: var(--accent-strong); }
.back { display: none; }
.thread {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.45rem;
  padding: 1rem 1.1rem;
  overflow-y: auto;
}
.center-note { margin: auto; font-size: 0.75rem; }
.bubble-row { display: flex; }
.bubble-row.us { justify-content: flex-end; }
.bubble-row.system { justify-content: center; }
.bubble {
  max-width: min(72%, 34rem);
  padding: 0.55rem 0.8rem;
  border-radius: 1rem;
  font-size: 0.76rem;
}
.bubble-row.guest .bubble { border-bottom-left-radius: 0.3rem; background: rgba(255,255,255,0.07); }
.bubble-row.us .bubble { border-bottom-right-radius: 0.3rem; background: rgba(101,213,174,0.18); }
.bubble-row.system .bubble { background: transparent; color: var(--faint); font-size: 0.65rem; }
.bubble-body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.bubble-meta { display: block; margin-top: 0.2rem; color: var(--faint); font-size: 0.58rem; text-align: right; }
.gate { margin: 0 1.1rem 0.5rem; }
.ai-brief, .composer { display: flex; gap: 0.55rem; padding: 0.65rem 1.1rem; }
.ai-brief { border-top: 1px solid var(--line); }
.ai-brief input { flex: 1; padding: 0.45rem 0.65rem; border-radius: 0.45rem; font-size: 0.7rem; }
.ai-brief button { padding: 0.4rem 0.65rem; font-size: 0.68rem; }
.composer { align-items: flex-end; border-top: 1px solid var(--line); }
.composer textarea { flex: 1; padding: 0.55rem 0.8rem; border-radius: 1rem; font-size: 0.76rem; resize: none; }
.composer button { padding: 0.55rem 1rem; border-radius: 1rem; font-size: 0.72rem; font-weight: 600; }
.composer .ai-button { padding-inline: 0.7rem; }
button:disabled { opacity: 0.45; cursor: default; }
.empty-pane { display: grid; flex: 1; place-items: center; }
.context-pane {
  padding: 1rem;
  overflow-y: auto;
  border-left: 1px solid var(--line);
  background: rgba(255,255,255,0.015);
}
.context-pane section { display: grid; gap: 0.3rem; padding-bottom: 1rem; }
.eyebrow { margin: 0; color: var(--faint); font-size: 0.58rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
.context-status { color: var(--warning); font-size: 0.67rem; }
.context-pane dl { margin: 0 0 1rem; border-block: 1px solid var(--line); }
.context-pane dl div { display: flex; justify-content: space-between; gap: 0.75rem; padding: 0.55rem 0; border-top: 1px solid var(--line); }
.context-pane dl div:first-child { border-top: 0; }
.context-pane dt { color: var(--faint); font-size: 0.62rem; }
.context-pane dd { margin: 0; color: var(--muted); font-size: 0.66rem; text-align: right; }
.context-pane section a { font-size: 0.67rem; overflow-wrap: anywhere; }
.detail-link { display: block; padding: 0.5rem; border: 1px solid var(--line); border-radius: 0.45rem; text-align: center; font-size: 0.68rem; }
.context-copy { font-size: 0.7rem; }
@media (max-width: 1100px) {
  .chat-shell { grid-template-columns: 290px 1fr; }
  .context-pane { display: none; }
}
@media (max-width: 760px) {
  .chat-shell { grid-template-columns: 1fr; height: calc(100vh - 7.5rem); }
  .chat-pane { display: none; }
  .chat-shell.has-selection .chat-pane { display: flex; }
  .chat-shell.has-selection .conv-list { display: none; }
  .back { display: inline-block; }
}
</style>
