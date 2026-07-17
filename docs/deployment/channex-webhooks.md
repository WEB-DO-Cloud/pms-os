# Channex webhooks (hosted)

Enable webhooks **only after** migrate, Postgres, web, and worker health succeed and verification queries pass. Enabling earlier can acknowledge or enqueue work against a half-ready stack.

## Endpoint

- URL: `https://<your-app-host>/api/webhooks/channex`
- Method: `POST`
- Auth: per-network webhook secret (header validated in-app; secret stored encrypted)
- Behavior: reject unauthenticated, stale, or replayed deliveries; bind work to the verified network

Exact header names and payload shape follow the Channex + PMS OS webhook handler (`apps/web/server/api/webhooks/channex.post.ts`).

## Safe enable sequence

1. Stack healthy (`/api/health`, worker health file `ok: true`).
2. Verification queries clean.
3. Confirm `CHANNEX_API_BASE` and network credentials for production.
4. In Channex (or partner portal), set the webhook URL to the production path.
5. Send a test delivery; confirm `sync_health.last_webhook_at` updates and no auth failure spike.
6. Leave worker running so pull remains the reliability backup if a push is missed.

## Disable / pause

- Reverse proxy: return 503 for `/api/webhooks/channex`, **or**
- Remove/disable the webhook in Channex, **and**
- Optionally `docker compose stop worker` for Class C sync pause ([rollback.md](./rollback.md)).

## Failure abort

If migrate or worker health fails during launch: **do not** point Channex at this environment. Keep the previous webhook target or leave disabled until [launch-checklist.md](./launch-checklist.md) go criteria pass.
