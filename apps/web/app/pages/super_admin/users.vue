<script setup lang="ts">
definePageMeta({ layout: 'super-admin' })

type SaUser = {
  id: string
  name: string
  email: string
  platformRole: string | null
  banned: boolean
  networks: Array<{
    id: number
    name: string
    role: string
  }>
}

const { data, refresh } = await useFetch<{ users: SaUser[] }>(
  '/api/super-admin/users',
  { key: 'sa-users' },
)

const editing = ref<SaUser | null>(null)
const name = ref('')
const email = ref('')
const reason = ref('support')
const error = ref('')
const pending = ref(false)

function startEdit(u: SaUser) {
  editing.value = u
  name.value = u.name
  email.value = u.email
  error.value = ''
}

async function saveProfile() {
  if (!editing.value) return
  pending.value = true
  error.value = ''
  try {
    await $fetch(`/api/super-admin/users/${editing.value.id}`, {
      method: 'PATCH',
      body: { name: name.value, email: email.value },
    })
    editing.value = null
    await refresh()
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    error.value = err?.data?.statusMessage || err?.message || 'Save failed'
  } finally {
    pending.value = false
  }
}

async function impersonate(u: SaUser) {
  const ok = window.confirm(
    `Login as ${u.email}? You will see and manage their account until you stop impersonating.`,
  )
  if (!ok) return
  pending.value = true
  error.value = ''
  try {
    await $fetch('/api/super-admin/impersonate', {
      method: 'POST',
      body: { userId: u.id, reason: reason.value || 'support' },
    })
    await navigateTo('/dashboard', { replace: true })
    window.location.assign('/dashboard')
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string }; message?: string }
    error.value =
      err?.data?.statusMessage || err?.message || 'Impersonation failed'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="users">
    <div class="toolbar">
      <label>
        Impersonation reason
        <input v-model="reason" placeholder="support" />
      </label>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Networks</th>
            <th>Platform</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in data?.users ?? []" :key="u.id">
            <td>
              <strong>{{ u.name }}</strong>
              <small>{{ u.email }}</small>
            </td>
            <td>
              <span v-if="!u.networks.length" class="muted">None</span>
              <ul v-else>
                <li v-for="n in u.networks" :key="`${u.id}-${n.id}`">
                  {{ n.name }}
                  <em>{{ n.role }}</em>
                </li>
              </ul>
            </td>
            <td>
              <span class="pill">{{ u.platformRole || 'user' }}</span>
              <span v-if="u.banned" class="pill danger">banned</span>
            </td>
            <td class="actions">
              <button type="button" @click="startEdit(u)">Edit</button>
              <button type="button" class="accent" @click="impersonate(u)">
                Impersonate
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="editing" class="drawer">
      <h2>Edit profile</h2>
      <label>
        Name
        <input v-model="name" />
      </label>
      <label>
        Email
        <input v-model="email" type="email" />
      </label>
      <div class="actions">
        <button type="button" :disabled="pending" @click="saveProfile">
          {{ pending ? 'Saving…' : 'Save' }}
        </button>
        <button type="button" class="ghost" @click="editing = null">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  margin-bottom: 1rem;
}
label {
  display: grid;
  gap: 0.35rem;
  max-width: 18rem;
  color: var(--muted);
  font-size: 0.75rem;
}
input {
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  color: var(--ink);
  background: var(--surface-raised);
  font: inherit;
}
.error {
  margin: 0 0 1rem;
  color: var(--danger);
}
.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
th,
td {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}
th {
  color: var(--faint);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
td strong,
td small {
  display: block;
}
td small {
  margin-top: 0.2rem;
  color: var(--muted);
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  margin-bottom: 0.25rem;
}
li em {
  margin-left: 0.35rem;
  color: var(--faint);
  font-style: normal;
  font-size: 0.75rem;
}
.muted {
  color: var(--faint);
}
.pill {
  display: inline-block;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 0.68rem;
  font-weight: 700;
}
.pill.danger {
  background: rgba(244, 127, 122, 0.15);
  color: var(--danger);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
button {
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  color: var(--ink);
  background: transparent;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}
button.accent {
  border: 0;
  color: #07100f;
  background: var(--accent);
}
button.ghost {
  border: 0;
  color: var(--muted);
}
.drawer {
  margin-top: 1.25rem;
  padding: 1.1rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--surface-raised);
  display: grid;
  gap: 0.75rem;
  max-width: 28rem;
}
.drawer h2 {
  margin: 0;
  font-size: 1rem;
}
</style>
