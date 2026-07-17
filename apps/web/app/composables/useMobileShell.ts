import type { PushNotificationsPlugin } from '@capacitor/push-notifications'
import { buildMobileBottomActions, resolveMobileDeepLink } from '../utils/mobile'

type PushPermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

/**
 * Mobile shell helpers: compact nav actions + push registration stub.
 * Real FCM/APNs keys stay out of the repo; this only requests permission and logs a token.
 */
export function useMobileShell() {
  const { principal, currentNetworkId, currentPropertyId } = useCurrentNetwork()
  const route = useRoute()
  const router = useRouter()

  const isCompact = ref(false)
  const pushPermission = ref<PushPermission>('prompt')
  const pushToken = ref<string | null>(null)
  const lastPushLog = ref<string | null>(null)

  const bottomActions = computed(() =>
    buildMobileBottomActions(principal.value),
  )

  const activeBottomTo = computed(() => {
    const path = route.path
    const match = bottomActions.value.find(
      (item) => path === item.to || path.startsWith(`${item.to}/`),
    )
    return match?.to ?? null
  })

  let cleanup: (() => void) | undefined

  onMounted(() => {
    if (!import.meta.client) return
    const mq = window.matchMedia('(max-width: 980px)')
    const apply = () => {
      isCompact.value = mq.matches
    }
    apply()
    mq.addEventListener('change', apply)
    cleanup = () => mq.removeEventListener('change', apply)
  })

  onUnmounted(() => cleanup?.())

  async function loadPushPlugin(): Promise<PushNotificationsPlugin | null> {
    try {
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) return null
      const { PushNotifications } = await import('@capacitor/push-notifications')
      return PushNotifications
    } catch {
      return null
    }
  }

  async function registerPushNotifications(): Promise<{
    permission: PushPermission
    token: string | null
  }> {
    const plugin = await loadPushPlugin()
    if (!plugin) {
      // Web / simulator stub — no native bridge.
      const stub = `web-stub-${principal.value?.userId ?? 'anon'}`
      pushPermission.value = 'unsupported'
      pushToken.value = stub
      lastPushLog.value = `[push] stub token ${stub}`
      console.info(lastPushLog.value)
      await postPushToken(stub, 'web')
      return { permission: 'unsupported', token: stub }
    }

    const permission = await plugin.requestPermissions()
    const granted = permission.receive === 'granted'
    pushPermission.value = granted ? 'granted' : 'denied'
    if (!granted) {
      lastPushLog.value = '[push] permission denied'
      console.info(lastPushLog.value)
      return { permission: 'denied', token: null }
    }

    await plugin.register()

    const token = await new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 4000)
      void plugin.addListener('registration', (event) => {
        clearTimeout(timeout)
        resolve(event.value)
      })
      void plugin.addListener('registrationError', (error) => {
        clearTimeout(timeout)
        console.warn('[push] registration error', error)
        resolve(null)
      })
    })

    pushToken.value = token
    lastPushLog.value = token
      ? `[push] device token ${token}`
      : '[push] registration timed out (no FCM keys configured)'
    console.info(lastPushLog.value)

    if (token) await postPushToken(token, 'native')
    return { permission: pushPermission.value, token }
  }

  async function postPushToken(token: string, platform: 'web' | 'native') {
    try {
      await $fetch('/api/notifications/register', {
        method: 'POST',
        body: {
          token,
          platform,
          networkId: currentNetworkId.value,
          propertyId: currentPropertyId.value,
        },
      })
    } catch (error) {
      // Smoke stub: registration failure must not break the shell.
      console.warn('[push] token register failed', error)
    }
  }

  function openDeepLink(path: string) {
    const result = resolveMobileDeepLink(path, principal.value)
    if (!result.ok) {
      lastPushLog.value = `[deep-link] blocked (${result.reason}): ${path}`
      console.warn(lastPushLog.value)
      return result
    }
    void router.push(result.path)
    return result
  }

  return {
    isCompact,
    bottomActions,
    activeBottomTo,
    pushPermission,
    pushToken,
    lastPushLog,
    registerPushNotifications,
    openDeepLink,
  }
}
