# PMS OS

Open-source Property Management System for hotels and vacation rentals — reservations, channel sync (Channex), operations, and revenue tools in one stack.

Built and maintained by [WEB DO Cloud](https://github.com/WEB-DO-Cloud).

## License

- **Community Edition** — [AGPLv3](./LICENSE.md). Free to use, modify, and self-host. You may **not** offer this software as a hosted/SaaS service to third parties without a commercial license.
- **Commercial License** — available from WEB DO Cloud for hosted/SaaS use, multi-network management, and white-label branding.

## Stack

- Nuxt 4 + TypeScript + shadcn-vue
- Turborepo + pnpm workspaces
- PostgreSQL + Drizzle ORM
- better-auth
- Channex API sync

## Editions

| `PMS_EDITION` | Behavior |
|---|---|
| `community` (default) | One-time `/setup` while there are zero users; then sign-in only. Each deploy is typically a single network. |
| `commercial` | Always-on `/signup` (multi-tenant), billing hooks, and `/super_admin` when configured. |

## Quick start (local)

Prerequisites: Node.js 22+, [pnpm](https://pnpm.io), PostgreSQL 16+.

```bash
pnpm install
cp .env.example .env
# set DATABASE_URL, BETTER_AUTH_SECRET, SECRETS_ENCRYPTION_KEY, SYNC_INTERNAL_SECRET
pnpm db:migrate
pnpm dev
```

App: `http://localhost:3000` (see `apps/web`).

## Docker

```bash
cp .env.example .env   # fill secrets; prefer PMS_EDITION=community for self-host
docker compose build
docker compose up -d   # migrate runs before web/worker
```

Compose publishes the app on `127.0.0.1:33100` and the marketing site on `127.0.0.1:33101`. Put a reverse proxy in front for TLS.

Ops guides:

- [Launch checklist](./docs/deployment/launch-checklist.md)
- [Channex webhooks](./docs/deployment/channex-webhooks.md)
- [Backup / restore](./docs/deployment/backup-restore.md)
- [Rollback](./docs/deployment/rollback.md)
- [Verification queries](./docs/deployment/verification-queries.md)

Greenfield installs use a **single** Drizzle migration baseline. Existing local DBs that applied older stepwise migrations should be recreated or restored from backup rather than upgraded through removed migration files.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Questions and bugs: [GitHub Issues](https://github.com/WEB-DO-Cloud/pms-os/issues).

## Project rules

See [`AGENTS.md`](./AGENTS.md) (Ponytail posture: YAGNI, reuse first, minimum code).
