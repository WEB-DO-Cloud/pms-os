import type { PrincipalContext } from '@pms/auth'

export type NetworkOption = {
  id: number
  name: string
  code: string
  logoUrl?: string | null
}

export type NetworkBrandingOption = {
  networkId: number
  displayName: string | null
  logoUrl: string | null
  accentColor: string | null
}

export type PropertyOption = {
  id: number
  name: string
  location: string
}

type MeResponse = {
  edition?: 'community' | 'commercial'
  user: { id: string; email: string; name: string }
  principal: PrincipalContext | null
  networks: Array<{
    id: number
    name: string
    code: string
    role: string
    logoUrl?: string | null
  }>
  branding?: NetworkBrandingOption | null
  needsMembership?: boolean
}

/**
 * Shell context hydrated from /api/me (session + membership + entitlements).
 */
export function useCurrentNetwork() {
  const principal = useState<PrincipalContext | null>('shell-principal', () => null)
  const edition = useState<'community' | 'commercial'>('shell-edition', () => 'community')
  const userName = useState<string>('shell-user-name', () => '')
  const networks = useState<NetworkOption[]>('shell-networks', () => [])
  const branding = useState<NetworkBrandingOption | null>(
    'shell-branding',
    () => null,
  )
  const properties = useState<PropertyOption[]>('shell-properties', () => [])
  const currentNetworkId = useState<number | null>('current-network-id', () => null)
  const currentPropertyId = useState<number | null>(
    'current-property-id',
    () => null,
  )
  const ready = useState('shell-ready', () => false)
  const loadError = useState<string | null>('shell-load-error', () => null)
  const switching = useState('shell-switching', () => false)

  const currentNetwork = computed(
    () =>
      networks.value.find((n) => n.id === currentNetworkId.value) ??
      networks.value[0] ??
      null,
  )
  const scopedProperties = computed(() => {
    if (!principal.value) return []
    if (principal.value.networkWide) return properties.value
    const allowedIds =
      principal.value.role === 'property_owner'
        ? principal.value.ownerPropertyIds
        : principal.value.propertyIds
    return properties.value.filter((p) => allowedIds.includes(p.id))
  })
  /** Commercial multi-network entitlement — show switcher even with one network. */
  const canSwitchNetworks = computed(
    () => principal.value?.entitlements.multiNetwork === true,
  )
  const canCreateNetwork = computed(
    () =>
      canSwitchNetworks.value &&
      principal.value?.role === 'org_admin',
  )
  const canUseWhiteLabel = computed(
    () => principal.value?.entitlements.whiteLabel === true,
  )
  const brandName = computed(
    () =>
      branding.value?.displayName?.trim() ||
      currentNetwork.value?.name ||
      'PMS OS',
  )
  const brandLogoUrl = computed(() => branding.value?.logoUrl ?? null)
  const brandAccent = computed(() => branding.value?.accentColor ?? null)
  const brandTagline = computed(() =>
    edition.value === 'community' ? 'Powered by POS DO' : 'Property operations',
  )

  async function refresh(networkId?: number) {
    loadError.value = null
    try {
      const me = await $fetch<MeResponse>('/api/me', {
        query:
          networkId != null
            ? { networkId }
            : currentNetworkId.value != null
              ? { networkId: currentNetworkId.value }
              : undefined,
      })
      edition.value = me.edition === 'commercial' ? 'commercial' : 'community'
      userName.value = me.user.name || me.user.email
      networks.value = me.networks.map((n) => ({
        id: n.id,
        name: n.name,
        code: n.code,
        logoUrl: n.logoUrl ?? null,
      }))
      branding.value = me.branding ?? null
      principal.value = me.principal
      if (me.principal?.networkId != null) {
        currentNetworkId.value = me.principal.networkId
      } else if (me.networks[0]) {
        currentNetworkId.value = me.networks[0].id
      }

      if (currentNetworkId.value != null) {
        try {
          const catalog = await $fetch<{
            properties: Array<{ id: number; name: string; city?: string | null }>
          }>('/api/properties', {
            query: { networkId: currentNetworkId.value },
          })
          properties.value = (catalog.properties ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            location: p.city || '',
          }))
        } catch {
          properties.value = []
        }
      } else {
        properties.value = []
      }
      ready.value = true
    } catch (e) {
      loadError.value = e instanceof Error ? e.message : 'Failed to load session'
      principal.value = null
      branding.value = null
      ready.value = true
    }
  }

  async function switchNetwork(networkId: number) {
    if (networkId === currentNetworkId.value) return
    switching.value = true
    currentPropertyId.value = null
    try {
      await refresh(networkId)
    } finally {
      switching.value = false
    }
  }

  async function createNetwork(name: string) {
    if (currentNetworkId.value == null) {
      throw new Error('No source network')
    }
    const res = await $fetch<{
      ok: boolean
      network: { id: number; name: string; slug: string }
    }>('/api/networks', {
      method: 'POST',
      body: {
        name,
        sourceNetworkId: currentNetworkId.value,
      },
    })
    await refresh(res.network.id)
    return res.network
  }

  if (import.meta.client && !ready.value) {
    // Fire once per client navigation into the shell.
    void refresh()
  }

  return {
    principal,
    edition,
    userName,
    networks,
    branding,
    brandName,
    brandLogoUrl,
    brandAccent,
    brandTagline,
    currentNetworkId,
    currentNetwork,
    canSwitchNetworks,
    canCreateNetwork,
    canUseWhiteLabel,
    properties: scopedProperties,
    currentPropertyId,
    ready,
    loadError,
    switching,
    refresh,
    switchNetwork,
    createNetwork,
  }
}
