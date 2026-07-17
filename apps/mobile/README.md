# PMS OS mobile (Capacitor)

Native iOS/Android shells wrap the `@pms/web` Nuxt client. Capacitor lives in `apps/web` (see `capacitor.config.ts`); this note is the short operator guide.

## Sync web build → native

```bash
export PATH="$HOME/.local/bin:$PATH"

# 1. Build the web app (produces apps/web/.output/public)
pnpm --filter @pms/web build

# 2. Copy client assets into Capacitor webDir (apps/web/www)
pnpm --filter @pms/web sync:mobile

# 3. Sync into android/ / ios/ native projects
pnpm --filter @pms/web cap:sync
```

First-time platform scaffolding (generated dirs are gitignored):

```bash
pnpm --filter @pms/web exec cap add android
pnpm --filter @pms/web exec cap add ios   # macOS + Xcode only
```

## Live API against hosted PMS

SSR/API routes are not offline. Point the WebView at a running server:

```bash
CAPACITOR_SERVER_URL=https://app.pms.do pnpm --filter @pms/web cap:sync
```

Do not commit FCM/APNs keys or `.env` secrets into `android/` / `ios/`.

## Push registration smoke

On native launch, `MobileBottomNav` requests notification permission and logs a device token (or a web stub token). Tokens POST to `/api/notifications/register` bound to the authenticated user and network/property scope. Deep links re-check access via `/api/notifications/deep-link`.
