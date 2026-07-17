import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native shell wraps the Nuxt client build (synced into `www/`).
 * Production API traffic should use the hosted server URL — set CAPACITOR_SERVER_URL
 * when packing against a live backend. No FCM/APNs secrets belong in this file.
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL

const config: CapacitorConfig = {
  appId: 'com.pms.os',
  appName: 'PMS OS',
  webDir: 'www',
  server: serverUrl
    ? { url: serverUrl, cleartext: serverUrl.startsWith('http://') }
    : undefined,
  android: {
    allowMixedContent: true,
  },
}

export default config
