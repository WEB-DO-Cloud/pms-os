# Launch checklist — PMS OS Docker cutover

Executable ordered procedure for first production cutover and later releases of a self-hosted or hosted Docker stack (marketing site + PMS app + sync worker).

## Launch invariants (must hold before go)

1. **Schema version** matches the app and worker images being launched (migrate completed from the same commit).
2. **Unique Channex mappings** hold (`properties` / `room_types` network+channex uniqueness).
3. **Successful acks** have committed local reservation/revision rows (no ack-before-commit).
4. **Pending-sync** direct reservations stay visibly non-confirmed (`status = pending_sync`).
5. **No secrets** in images, compose files, public logs, or sync-health payloads.

## Ownership (stop/go)

| Role | Responsibility |
|---|---|
| **Platform admin (go owner)** | Declares go / no-go; enables reverse-proxy traffic and Channex webhooks |
| **Ops** | Backup, compose bring-up, health watches, first-24h monitoring |
| **On-call** | Rollback class selection if invariants break |

No-go if any of: migrate fails, Postgres unhealthy, web `/api/health` not ok, worker health file stale/`ok:false`, verification queries fail, or secrets appear in logs.

## Pre-deploy audits

- [ ] `.env` present on host; values not committed; rotate any leaked staging secrets
- [ ] `SECRETS_ENCRYPTION_KEY` is the key that can decrypt existing `network_secrets` (or credential re-entry plan ready)
- [ ] Image tag / git SHA recorded for rollback
- [ ] Channex webhook endpoint **disabled** or pointed at a holding page
- [ ] Recent successful backup exists and restore path was smoke-tested in staging
- [ ] `SYNC_NETWORK_IDS` matches networks that should sync
- [ ] `CHANNEX_API_BASE` points at the intended environment (staging vs production)

## Ordered bring-up

```text
backup → build/pull → migrate → Postgres health → app health → worker health
  → verification (≤5 min) → webhook/proxy enable → first-24h monitoring
```

### Steps

1. **Backup** — see [backup-restore.md](./backup-restore.md). Confirm artifact path and checksum.
2. **Build / pull** — `docker compose build` (or pull tagged images). Confirm no `.env` copied into images (`.dockerignore`).
3. **Migrate** — start Postgres; wait healthy; run migrate one-shot to completion. **Abort here on failure** (do not start web traffic or webhooks).
4. **Postgres health** — `pg_isready` / compose healthcheck green.
5. **App health** — `web` healthy: `GET /api/health` returns `status: ok` and `database: ok`.
6. **Worker health** — `worker` healthy: `WORKER_HEALTH_FILE` has recent `lastTickAt` and `ok: true`.
7. **Verification** — run [verification-queries.md](./verification-queries.md) within five minutes of healthy stack.
8. **Webhook / proxy exposure** — only after steps 5–7 pass; follow [channex-webhooks.md](./channex-webhooks.md).
9. **First-24h monitoring** — thresholds below.

Injected migration or worker failure **stops before go** (leave webhooks off; keep proxy on maintenance or previous release).

## Post-deploy verification (≤5 minutes)

- [ ] `/api/health` ok
- [ ] Worker health file ok for each expected network in `SYNC_NETWORK_IDS`
- [ ] Internal pull/ack smoke (optional): authenticated `POST /api/internal/sync/pull` + `ack`
- [ ] SQL invariants in [verification-queries.md](./verification-queries.md)
- [ ] No plaintext API keys in `docker compose logs web worker` (spot-check)

## First-24-hour monitoring

| Signal | Warn | Page / no-go |
|---|---|---|
| Web `/api/health` failures | >1 in 5m | >3 consecutive or >5% of probes in 15m |
| Worker `ok: false` or stale tick (>2× interval) | any | persists >5m |
| Sync health `failed` networks | any new | any with rising dead-letters |
| Ack outbox pending/failed age | >15m | >60m without drain |
| Dead-letter growth | +5 / hour | +20 / hour or duplicate booking reports |
| Pending-sync reservations stuck | >30m | >2h without recovery path |
| 5xx rate on `/api/webhooks/channex` | >1% | >5% or auth failure spike |

## Rollback classes

See [rollback.md](./rollback.md). Choose class before cutting traffic back:

- **Image-only** — schema unchanged
- **Restore-required** — failed / incompatible migration
- **Sync pause / recovery** — app up; Channex path unsafe

## Stop criteria (immediate no-go)

- Migrate exit ≠ 0
- Web or worker never become healthy
- Verification query shows duplicate Channex mappings or confirmed local-only bookings that should be `pending_sync`
- Suspected secret leak in logs or image layers
