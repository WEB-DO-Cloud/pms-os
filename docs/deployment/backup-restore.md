# Backup and restore

Covers the Compose Postgres volume, encrypted Channex credentials, and sync recovery artifacts (ack outbox, cursors, dead letters).

## What to back up

| Asset | Location | Notes |
|---|---|---|
| Database | Volume `pms_pgdata` / logical dump | Includes schema, bookings, `ack_outbox`, `sync_cursors`, `sync_dead_letters`, `network_secrets` |
| Env / secrets | Host `.env` / secret store | `SECRETS_ENCRYPTION_KEY`, auth secrets — **not** in git |
| Image tags | Deploy notes | Needed for Class A/B rollback |

`network_secrets` stores **ciphertext**. Restoring the DB without the matching `SECRETS_ENCRYPTION_KEY` leaves Channex credentials unreadable — keep key material in the secret store and document rotation/re-entry.

## Backup (logical dump — preferred)

Before every production migrate/cutover:

```bash
ts=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /var/backups/pms-os   # or your OpenPanel backup path (untracked)
docker compose exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > "/var/backups/pms-os/pms_os_${ts}.dump"
sha256sum "/var/backups/pms-os/pms_os_${ts}.dump" | tee "/var/backups/pms-os/pms_os_${ts}.sha256"
```

Optional volume snapshot (filesystem/OpenPanel): snapshot `pms_pgdata` only when containers are stopped or Postgres is briefly quiesced — prefer `pg_dump` for portability.

## Restore

1. Disable webhooks; stop `web` and `worker`.
2. Restore dump into a clean database (example):

```bash
docker compose up -d postgres
# wait healthy
docker compose exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  < /var/backups/pms-os/pms_os_TIMESTAMP.dump
```

3. Confirm `SECRETS_ENCRYPTION_KEY` matches the backup era (or plan Channex credential re-entry in Settings → Integrations).
4. Start migrate only if required for the chosen image tag (usually not after restoring a post-migrate dump of that release).
5. Start `web` + `worker`; health checks; [verification-queries.md](./verification-queries.md).
6. Sync recovery: inspect ack outbox / cursors / dead letters; drain pending acks; then enable webhooks ([channex-webhooks.md](./channex-webhooks.md)).

## Channex credential recovery

- If DB restored and encryption key matches: credentials decrypt; re-test pull.
- If key lost: re-enter API key + webhook secret via Integrations; old ciphertext rows are rotated on save.
- After restore, expect worker to resume pending ack outbox without re-applying already-committed revisions (ack-after-commit invariant).

## Ack outbox / cursor / dead-letter notes

Restoring an older dump may re-introduce pending acks or an older cursor. After restore:

1. Do **not** enable webhooks until worker has completed at least one successful tick.
2. Run verification queries for sent-ack ↔ revision integrity.
3. Dead letters may need manual retry from Settings → Integrations.
