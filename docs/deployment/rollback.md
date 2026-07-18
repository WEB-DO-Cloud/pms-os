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

## Class D — ARI / Booking CRS canary rollback

**When:** A write-class canary misfires (wrong availability, price, or booking) but core ingest is fine.

**Actions:**

1. **Kill switch first** — org-admin `setNetworkCapability` disable the offending class (`availabilityWrite`, `rateRestrictionWrite`, `derivedRateWrite`, `bookingCrsWrite`, or `aiApply`). New intents stop immediately; worker continues reconcile/retry for already-queued rows.
2. **Inspect** — Integrations health `ariWrite` (pending / accepted / partial / drift / stuck alerts) and [verification-queries.md](./verification-queries.md) §8. Scope by `property_id` + lane.
3. **Compensate where possible** — enqueue an audited absolute desired-state intent that restores the last known-good value (availability open/close, restriction/rate revert, derived modifier revert). Prefer the same command path with a fresh idempotency key and `compensatesIntentId` when available.
4. **Do not** run autonomous corrective writes from the nightly drift job — that job is **detect-only**.
5. Re-enable the capability only after reconcile + Calendar/Rates surfaces match Channex GET.

### Irreversible / limited OTA side effects (document for operators)

| Write class | Reversible via absolute compensate? | Notes |
|---|---|---|
| Availability | Usually yes | Restore prior availability integer for the date range |
| Restrictions / rates | Usually yes | Restore prior fields; inherited child rates stay Channex-managed |
| Derived modifiers | Usually yes | Restore prior `derived_option` |
| Booking CRS | **Often irreversible on OTAs** | Cancel/modify may already have notified channels; guest-facing booking may exist in Channex even if PMS rolls back UI. Prefer Channex-side cancel workflow + local `pending_sync` remediation; do not assume a compensating create undoes an OTA listing |

## Decision cheat-sheet

| Symptom | Class |
|---|---|
| Bad UI/API build, DB OK | A |
| Migrate failed / schema mismatch | B |
| Double bookings, ack failures, webhook floods | C (then A/B if needed) |
| Bad ARI/Booking CRS canary write | D (capability off + compensate) |
| Secret compromise | C + rotate keys; restore only if ciphertext/DB exposure requires it |
