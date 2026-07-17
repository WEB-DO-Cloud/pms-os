# Contributing to PMS OS

Thanks for helping improve PMS OS. This project is maintained by [WEB DO Cloud](https://github.com/WEB-DO-Cloud).

## License

By contributing, you agree that your contributions are licensed under the [AGPLv3](./LICENSE.md) (Community Edition). Commercial licensing is separate and handled by WEB DO Cloud.

## Setup

1. Fork and clone [WEB-DO-Cloud/pms-os](https://github.com/WEB-DO-Cloud/pms-os).
2. Install dependencies: `pnpm install`
3. Copy `.env.example` → `.env` and set at least:
   - `DATABASE_URL`
   - `BETTER_AUTH_SECRET`
   - `SECRETS_ENCRYPTION_KEY`
   - `SYNC_INTERNAL_SECRET`
4. Apply schema: `pnpm db:migrate`
5. Run the app: `pnpm dev`

## Checks before you open a PR

From the repo root:

```bash
pnpm typecheck
pnpm test
pnpm lint
```

Keep changes focused. Prefer small PRs that solve one problem.

## Pull requests

- Describe **why** the change is needed, not only what changed.
- Link related issues when they exist.
- Do not commit `.env`, credentials, or real API keys.
- If you change the DB schema, regenerate migrations with `pnpm db:generate` and include the resulting files. Do not hand-edit journal/snapshot files unless you know Drizzle’s format.

## Questions

Use [GitHub Issues](https://github.com/WEB-DO-Cloud/pms-os/issues) for bugs and feature discussion.
