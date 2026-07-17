# Verification queries

Run against the live `DATABASE_URL` within five minutes of a healthy compose stack (and after any restore). Adjust schema names only if migrations rename tables.

Connect:

```bash
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
# or: psql "$DATABASE_URL"
```

## 1. Migrations applied

```sql
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY created_at DESC
LIMIT 10;
```

Expect the latest migration id from the deployed commit’s `packages/db/migrations`.

## 2. Unique Channex mapping constraints still hold

```sql
-- Should return 0 rows
SELECT network_id, channex_id, COUNT(*) AS c
FROM properties
WHERE channex_id IS NOT NULL
GROUP BY network_id, channex_id
HAVING COUNT(*) > 1;

SELECT network_id, channex_id, COUNT(*) AS c
FROM room_types
WHERE channex_id IS NOT NULL
GROUP BY network_id, channex_id
HAVING COUNT(*) > 1;
```

## 3. Ack outbox vs committed revisions

Successful / sent acks must correspond to a stored booking revision (no ack-without-commit):

```sql
SELECT a.id, a.network_id, a.channex_revision_id, a.status, a.attempts
FROM ack_outbox a
LEFT JOIN booking_revisions br
  ON br.network_id = a.network_id
 AND br.channex_revision_id = a.channex_revision_id
WHERE a.status = 'sent'
  AND br.id IS NULL;
```

Expect **0 rows**.

Pending/failed acks (retry queue — should drain via worker):

```sql
SELECT status, COUNT(*) FROM ack_outbox GROUP BY status;
```

## 4. Pending-sync direct reservations stay non-confirmed

```sql
SELECT id, network_id, status, pending_sync_reason, updated_at
FROM reservations
WHERE status = 'pending_sync'
ORDER BY updated_at DESC
LIMIT 50;

-- Must be empty: pending_sync must not be labeled confirmed
SELECT id FROM reservations WHERE status = 'pending_sync' AND status = 'confirmed';
```

## 5. Sync cursor / dead-letter / health snapshot

```sql
SELECT network_id, cursor_key, cursor_value, updated_at FROM sync_cursors ORDER BY network_id;

SELECT network_id, COUNT(*) AS dead_letters
FROM sync_dead_letters
GROUP BY network_id;

SELECT network_id, status, last_pull_at, last_webhook_at, last_ack_at, last_error_code
FROM sync_health
ORDER BY network_id;
```

## 6. Secret material not plaintext

```sql
-- ciphertext/iv only; never expect raw API keys in these columns
SELECT network_id, kind, key_version,
       LENGTH(ciphertext) AS ciphertext_len,
       LEFT(ciphertext, 8) AS ciphertext_prefix
FROM network_secrets;
```

Fail verification if any `ciphertext` looks like a plaintext Channex key (`chx_` / obvious secret substrings).

## 7. App + worker probes (non-SQL)

```bash
curl -fsS "http://127.0.0.1:3000/api/health"
docker compose exec worker cat "${WORKER_HEALTH_FILE:-/tmp/pms-worker-health.json}"
```
