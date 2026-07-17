# Rollback classes

Pick a class before changing traffic. Do not mix “redeploy previous image” with “restore DB” unless the class requires it.

## Class A — Image-only rollback

**When:** App/worker bug; **schema unchanged** (no new migrate, or migrate is backward-compatible and you are only reverting app code).

**Actions:**

1. Disable Channex webhooks (holding response / OpenPanel toggle) if sync behavior is suspect.
2. `docker compose up -d web worker` with the previous image tag / git SHA.
3. Confirm `/api/health` and worker health file.
4. Re-run [verification-queries.md](./verification-queries.md).
5. Re-enable webhooks only when healthy.

**Does not:** restore Postgres volumes.

## Class B — Restore-required schema rollback

**When:** Migration failed mid-way, or new schema is incompatible and cannot be forward-fixed quickly.

**Actions:**

1. **Stop go** — leave webhooks off; put proxy on maintenance or prior known-good release if still serving.
2. Stop `web` and `worker` (`docker compose stop web worker`).
3. Restore Postgres from the pre-deploy backup ([backup-restore.md](./backup-restore.md)).
4. Deploy the **last known-good** images (same schema as restored dump).
5. Run migrate only if that release’s migrations are not already in the dump (usually skip if dump was post-migrate for that release).
6. Health → verification → webhooks.

**Never** point new images that expect a newer schema at a restored older database without a deliberate re-migrate plan.

## Class C — Sync pause / recovery

**When:** App and DB are fine, but Channex ingest/ack is unsafe (duplicate risk, poison revision, credential rotation, ack outbox storm).

**Actions:**

1. Pause sync: stop `worker`; keep webhook endpoint rejecting or disabled.
2. Inspect `sync_health`, `ack_outbox`, `sync_dead_letters`, sync cursors.
3. Fix credentials / dead-letters / outbox; drain ack outbox via internal ack once safe.
4. Restart worker; confirm health file `ok: true`.
5. Enable webhooks last.

App UI may stay up for staff/owner traffic during Class C.

## Decision cheat-sheet

| Symptom | Class |
|---|---|
| Bad UI/API build, DB OK | A |
| Migrate failed / schema mismatch | B |
| Double bookings, ack failures, webhook floods | C (then A/B if needed) |
| Secret compromise | C + rotate keys; restore only if ciphertext/DB exposure requires it |
