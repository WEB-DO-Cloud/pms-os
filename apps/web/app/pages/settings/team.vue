<script setup lang="ts">
import {
  MEMBER_ROLES,
  isNetworkWideRole,
  type MemberRole,
} from '@pms/auth'

type TeamMember = {
  userId: string
  name: string
  email: string
  role: MemberRole
  propertyIds: number[]
  ownerPropertyIds: number[]
  networkWide: boolean
  createdAt: string
}

type PropertyOption = { id: number; name: string; city: string | null }

type MatrixRow = {
  role: MemberRole
  networkWide: boolean
  modules: string[]
  actions: string[]
}

const { currentNetworkId, principal } = useCurrentNetwork()

const canManage = computed(
  () =>
    principal.value?.role === 'org_admin' || principal.value?.role === 'manager',
)

const members = ref<TeamMember[]>([])
const properties = ref<PropertyOption[]>([])
const matrix = ref<MatrixRow[]>([])
const loadError = ref<string | null>(null)
const loading = ref(false)
const busyId = ref<string | null>(null)
const actionError = ref<string | null>(null)
const actionOk = ref<string | null>(null)

const invite = reactive({
  name: '',
  email: '',
  password: '',
  role: 'front_desk' as MemberRole,
  propertyIds: [] as number[],
})
const inviting = ref(false)

const editingId = ref<string | null>(null)
const editRole = ref<MemberRole>('front_desk')
const editPropertyIds = ref<number[]>([])

const roleLabels: Record<MemberRole, string> = {
  org_admin: 'Org admin',
  manager: 'Manager',
  front_desk: 'Front desk',
  housekeeping: 'Housekeeping',
  accounting: 'Accounting',
  property_owner: 'Property owner',
}

function scopedIdsFor(m: TeamMember) {
  return m.role === 'property_owner' ? m.ownerPropertyIds : m.propertyIds
}

function needsProperties(role: MemberRole) {
  return !isNetworkWideRole(role)
}

function propertyNames(ids: number[]) {
  const map = new Map(properties.value.map((p) => [p.id, p.name]))
  if (ids.length === 0) return 'Network-wide'
  return ids.map((id) => map.get(id) ?? `#${id}`).join(', ')
}

async function load() {
  if (!canManage.value || currentNetworkId.value == null) return
  loading.value = true
  loadError.value = null
  try {
    const res = await $fetch<{
      members: TeamMember[]
      properties: PropertyOption[]
      matrix: MatrixRow[]
    }>('/api/settings/team', {
      query: { networkId: currentNetworkId.value },
    })
    members.value = res.members
    properties.value = res.properties
    matrix.value = res.matrix
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    loadError.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Unable to load team'
  } finally {
    loading.value = false
  }
}

function startEdit(m: TeamMember) {
  editingId.value = m.userId
  editRole.value = m.role
  editPropertyIds.value = [...scopedIdsFor(m)]
  actionError.value = null
  actionOk.value = null
}

function cancelEdit() {
  editingId.value = null
}

function toggleId(list: number[], id: number) {
  const i = list.indexOf(id)
  if (i >= 0) list.splice(i, 1)
  else list.push(id)
}

async function submitInvite() {
  if (currentNetworkId.value == null) return
  inviting.value = true
  actionError.value = null
  actionOk.value = null
  try {
    const res = await $fetch<{ createdUser: boolean; email: string }>('/api/settings/team', {
      method: 'POST',
      body: {
        networkId: currentNetworkId.value,
        name: invite.name,
        email: invite.email,
        password: invite.password || undefined,
        role: invite.role,
        propertyIds: needsProperties(invite.role) ? invite.propertyIds : [],
      },
    })
    actionOk.value = res.createdUser
      ? `Created ${res.email} and added to the network.`
      : `Added existing user ${res.email} to the network.`
    invite.name = ''
    invite.email = ''
    invite.password = ''
    invite.role = 'front_desk'
    invite.propertyIds = []
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    actionError.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Invite failed'
  } finally {
    inviting.value = false
  }
}

async function saveEdit(userId: string) {
  if (currentNetworkId.value == null) return
  busyId.value = userId
  actionError.value = null
  actionOk.value = null
  try {
    await $fetch(`/api/settings/team/${userId}`, {
      method: 'PATCH',
      body: {
        networkId: currentNetworkId.value,
        role: editRole.value,
        propertyIds: needsProperties(editRole.value) ? editPropertyIds.value : [],
      },
    })
    actionOk.value = 'Member updated.'
    editingId.value = null
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    actionError.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Update failed'
  } finally {
    busyId.value = null
  }
}

async function removeMember(m: TeamMember) {
  if (currentNetworkId.value == null) return
  const ok = window.confirm(`Remove ${m.email} from this network?`)
  if (!ok) return
  busyId.value = m.userId
  actionError.value = null
  actionOk.value = null
  try {
    await $fetch(`/api/settings/team/${m.userId}`, {
      method: 'DELETE',
      query: { networkId: currentNetworkId.value },
    })
    actionOk.value = `Removed ${m.email}.`
    if (editingId.value === m.userId) editingId.value = null
    await load()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }; statusMessage?: string; message?: string }
    actionError.value =
      e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Remove failed'
  } finally {
    busyId.value = null
  }
}

onMounted(load)
watch(currentNetworkId, () => {
  void load()
})
watch(canManage, (v) => {
  if (v) void load()
})
</script>

<template>
  <div class="page-shell module-page">
    <p class="eyebrow">Settings</p>
    <h1>Team & Permissions</h1>
    <p class="page-intro">
      Invite operators, assign fixed roles, and scope property access. Role
      capabilities are fixed — change the role, not a custom ACL.
    </p>

    <div class="section-rule" />

    <p v-if="!canManage" class="gate" role="alert">
      Team management is limited to organization admins and managers.
    </p>

    <template v-else>
      <p v-if="loadError" class="msg failed" role="alert">{{ loadError }}</p>
      <p v-if="actionError" class="msg failed" role="alert">{{ actionError }}</p>
      <p v-if="actionOk" class="msg ok" role="status">{{ actionOk }}</p>
      <p v-if="loading" class="muted">Loading team…</p>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Members</h2>
            <p>{{ members.length }} people on this network</p>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Access</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in members" :key="m.userId">
                <td>
                  <strong>{{ m.name }}</strong>
                  <small>{{ m.email }}</small>
                </td>
                <td>
                  <template v-if="editingId === m.userId">
                    <select v-model="editRole">
                      <option v-for="r in MEMBER_ROLES" :key="r" :value="r">
                        {{ roleLabels[r] }}
                      </option>
                    </select>
                  </template>
                  <span v-else class="pill">{{ roleLabels[m.role] }}</span>
                </td>
                <td>
                  <template v-if="editingId === m.userId && needsProperties(editRole)">
                    <div v-if="properties.length === 0" class="hint">
                      Import properties first to assign access.
                    </div>
                    <div v-else class="checks">
                      <label v-for="p in properties" :key="p.id">
                        <input
                          type="checkbox"
                          :checked="editPropertyIds.includes(p.id)"
                          @change="toggleId(editPropertyIds, p.id)"
                        />
                        {{ p.name }}
                      </label>
                    </div>
                  </template>
                  <span v-else class="access">
                    {{
                      m.networkWide
                        ? 'All properties'
                        : propertyNames(scopedIdsFor(m))
                    }}
                  </span>
                </td>
                <td class="actions">
                  <template v-if="editingId === m.userId">
                    <button
                      type="button"
                      class="btn-primary"
                      :disabled="busyId === m.userId"
                      @click="saveEdit(m.userId)"
                    >
                      Save
                    </button>
                    <button type="button" class="btn-ghost" @click="cancelEdit">
                      Cancel
                    </button>
                  </template>
                  <template v-else>
                    <button type="button" class="btn-ghost" @click="startEdit(m)">
                      Edit
                    </button>
                    <button
                      type="button"
                      class="btn-danger"
                      :disabled="busyId === m.userId || m.userId === principal?.userId"
                      @click="removeMember(m)"
                    >
                      Remove
                    </button>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Invite member</h2>
            <p>
              Existing emails join this network. New emails need a temporary
              password so they can sign in.
            </p>
          </div>
        </div>

        <form class="invite-form" @submit.prevent="submitInvite">
          <label>
            <span>Name</span>
            <input v-model="invite.name" type="text" required autocomplete="name" />
          </label>
          <label>
            <span>Email</span>
            <input v-model="invite.email" type="email" required autocomplete="off" />
          </label>
          <label>
            <span>Temporary password</span>
            <input
              v-model="invite.password"
              type="password"
              minlength="8"
              autocomplete="new-password"
              placeholder="Required only for new accounts"
            />
          </label>
          <label>
            <span>Role</span>
            <select v-model="invite.role">
              <option v-for="r in MEMBER_ROLES" :key="r" :value="r">
                {{ roleLabels[r] }}
              </option>
            </select>
          </label>

          <fieldset v-if="needsProperties(invite.role)" class="props">
            <legend>Property access</legend>
            <p v-if="properties.length === 0" class="hint">
              No properties yet — create or import one before inviting scoped roles.
            </p>
            <div v-else class="checks">
              <label v-for="p in properties" :key="p.id">
                <input
                  type="checkbox"
                  :checked="invite.propertyIds.includes(p.id)"
                  @change="toggleId(invite.propertyIds, p.id)"
                />
                {{ p.name }}
                <em v-if="p.city">{{ p.city }}</em>
              </label>
            </div>
          </fieldset>

          <button
            type="submit"
            class="btn-primary"
            :disabled="
              inviting ||
              (needsProperties(invite.role) && invite.propertyIds.length === 0)
            "
          >
            {{ inviting ? 'Inviting…' : 'Add to network' }}
          </button>
        </form>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>Permission matrix</h2>
            <p>Fixed capabilities per role — not editable per user.</p>
          </div>
        </div>
        <div class="table-wrap matrix">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Scope</th>
                <th>Modules</th>
                <th>Privileged actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in matrix" :key="row.role">
                <td><strong>{{ roleLabels[row.role] }}</strong></td>
                <td>{{ row.networkWide ? 'Network-wide' : 'Property-scoped' }}</td>
                <td>{{ row.modules.join(', ') }}</td>
                <td>{{ row.actions.length ? row.actions.join(', ') : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.module-page {
  max-width: 72rem;
}

.gate,
.muted,
.msg {
  margin: 0 0 1rem;
  font-size: 0.78rem;
}

.gate,
.failed {
  color: var(--danger);
}

.ok {
  color: var(--accent-strong);
}

.muted,
.hint {
  color: var(--muted);
}

.panel {
  margin-top: 1.6rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--line);
}

.panel-head h2 {
  margin: 0;
  font-size: 1rem;
}

.panel-head p {
  margin: 0.35rem 0 0;
  color: var(--muted);
  font-size: 0.72rem;
  line-height: 1.5;
}

.table-wrap {
  margin-top: 1rem;
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
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
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

td strong,
td small {
  display: block;
}

td small,
.access {
  margin-top: 0.2rem;
  color: var(--muted);
  font-size: 0.72rem;
}

.pill {
  display: inline-block;
  padding: 0.15rem 0.45rem;
  border-radius: 0.35rem;
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-size: 0.72rem;
  font-weight: 700;
}

.actions {
  white-space: nowrap;
}

.actions button + button {
  margin-left: 0.4rem;
}

.btn-primary,
.btn-ghost,
.btn-danger {
  padding: 0.45rem 0.75rem;
  border-radius: 0.4rem;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
}

.btn-primary {
  border: 0;
  background: var(--accent);
  color: #04201a;
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-ghost {
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--ink);
}

.btn-danger {
  border: 1px solid rgba(220, 80, 80, 0.35);
  background: transparent;
  color: var(--danger);
}

.btn-danger:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.invite-form {
  display: grid;
  gap: 0.85rem;
  max-width: 28rem;
  margin-top: 1.1rem;
}

.invite-form label > span,
.props legend {
  display: block;
  margin-bottom: 0.35rem;
  color: var(--muted);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.invite-form input,
.invite-form select,
td select {
  width: 100%;
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--line-strong);
  border-radius: calc(var(--radius) - 0.2rem);
  background: var(--surface-raised);
  color: var(--ink);
}

.props {
  margin: 0;
  padding: 0.85rem 0 0;
  border: 0;
  border-top: 1px solid var(--line);
}

.checks {
  display: grid;
  gap: 0.45rem;
}

.checks label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.78rem;
}

.checks em {
  color: var(--muted);
  font-style: normal;
  font-size: 0.68rem;
}

.matrix td {
  font-size: 0.72rem;
  line-height: 1.45;
}

@media (max-width: 760px) {
  .actions {
    white-space: normal;
  }

  .actions button {
    display: block;
    width: 100%;
    margin: 0 0 0.35rem;
  }
}
</style>
