---
title: Public GitHub Baseline - Plan
date: 2026-07-17
type: ops
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
---

# Public GitHub Baseline - Plan

## Goal Capsule

- **Objective:** Publish PMS OS as a clean public repository at [WEB-DO-Cloud/pms-os](https://github.com/WEB-DO-Cloud/pms-os) with community docs, a single fresh migration baseline, and private/internal noise removed.
- **Product authority:** Dual-license Community (AGPLv3) + commercial offering remains; copyright/contact naming defaults to WEB DO Cloud. Product Contract from brainstorm is authoritative for WHAT; this plan owns HOW.
- **Open blockers:** GitHub auth for `WEB-DO-Cloud` is required before create/push. If auth is unavailable, finish the local clean orphan baseline and stop with instructions — do not invent a different remote.
- **Execution profile:** Ops / publish hygiene. Prefer smallest diffs. Do not refactor product features.
- **Tail ownership:** After units complete, LFG owns simplify/review/ship. Public publish may use orphan history rather than a normal feature PR against private history — see KTD1.

## Product Contract

### Summary

Ship a fresh public baseline of the full PMS OS monorepo: one clean git history, community-facing README and contributor docs, database migrations reset to a single schema snapshot, and host-specific/internal planning artifacts stripped. Commercial/EE packages stay in-tree under the existing dual-license model.

### Problem Frame

The project is ready to go public, but the working tree carries private deploy runbooks, internal planning residue, multi-step migration history that new self-hosters do not need, and a thin README that is not enough for a community launch. A normal branch push would also expose private git history that should not define the public project.

### Requirements

**Repository & history**

- R1. The public remote is `https://github.com/WEB-DO-Cloud/pms-os` (org [WEB-DO-Cloud](https://github.com/WEB-DO-Cloud)), visibility public.
- R2. Public history is a fresh baseline (orphan / single clean root commit), not a replay of the existing private branch history.
- R3. `.env` and real secrets never appear in the public tree; `.env.example` remains the only committed env template.

**Community docs**

- R4. Root README is community-ready: what PMS OS is, license dual-track, stack, quickstart (local + Docker), edition note (`community` vs `commercial`), and links to CONTRIBUTING / license / issues.
- R5. Add CONTRIBUTING.md covering setup, tests/typecheck expectations, PR basics, and where to ask questions.
- R6. Copyright and contact naming use **WEB DO Cloud** unless updated before publish.

**Database migrations**

- R7. Replace the multi-file migration chain with a single baseline migration that matches the current schema so greenfield installs apply one step.
- R8. Migration reset assumes no need to preserve stepwise upgrade history for existing public consumers (none yet).

**Strip private / internal noise**

- R9. Exclude from the public baseline: `docs/plans/`, `docs/residual-review-findings/`, and pms.do / OpenPanel-specific deploy runbooks (e.g. `docs/deployment/openpanel-pms-do.md`).
- R10. Keep generic self-host / Docker docs and operational guides that are not host-specific.
- R11. Keep the full product monorepo, including commercial/EE packages and SaaS-capable paths, gated by license and `PMS_EDITION` as today.

**Hygiene**

- R12. Public tree should not include agent scratch, local build artifacts, or other gitignored noise; `.gitignore` stays effective for secrets and generated outputs.

### Scope Boundaries

- **In scope:** Fresh public history, community README + CONTRIBUTING, migration squash to one baseline, strip private/internal docs listed above, create/push public repo when auth is available.
- **Out of scope:** CE-only repo split; product feature work; broad refactors; rewriting commercial licensing mechanics; preserving private commit history on the public remote; CODE_OF_CONDUCT / SECURITY unless added cheaply during implementation without expanding scope.

### Key Decisions

- KD1. Fresh baseline over push-existing-history — public repo starts clean.
- KD2. Strip private noise only — not an aggressive CE-only extraction.
- KD3. Migration history is disposable for public launch — one baseline is enough.
- KD4. Legal/contact label defaults to WEB DO Cloud.

### Success Criteria

- SC1. `https://github.com/WEB-DO-Cloud/pms-os` exists, is public, and contains the cleaned baseline.
- SC2. A new clone can install, configure from `.env.example`, and apply a single migration successfully (greenfield).
- SC3. A first-time reader can understand license, how to run locally/Docker, and how to contribute from root docs alone.
- SC4. No residual-review findings, internal plans, or pms.do-specific OpenPanel runbook ship in the public tree.
- SC5. No committed secrets.

### Assumptions

- A1. Implementer has (or will obtain) permission to create/push under `WEB-DO-Cloud`.
- A2. No external production database depends on the numbered migration chain being preserved publicly.
- A3. Local private history can remain on the current machine/branch; it is not mirrored to the public remote.
- A4. Host-specific strings inside otherwise-useful ops docs (`docs/deployment/launch-checklist.md`) are sanitized to generic self-host language rather than deleting the whole guide when the procedure is still valuable.
- A5. `.env.example` public defaults prefer `PMS_EDITION=community` and blank/placeholder commercial-only fields (no real emails/hosts as required values).

### Outstanding Questions

- None blocking. Auth for `gh` is an execution prerequisite (Goal Capsule open blocker), not a product fork.

### Product Contract preservation

Product Contract unchanged from brainstorm enrichment (R1–R12, KD1–KD4, SC1–SC5 preserved). Planning added A4–A5 as inferred bets from headless scoping.

## Planning Contract

### Key Technical Decisions

- KTD1. **Orphan public root, keep private branch locally.** Build the clean tree on the current working copy, then create an orphan branch (e.g. `public-main`) with a single root commit for the public remote. Do not force-push onto private history. Leave `feat/pms-os-platform` (or current private branch) intact locally as the development history archive.
- KTD2. **Drizzle regenerate for migration squash.** Delete `packages/db/migrations/*.sql` and `packages/db/migrations/meta/*`, then run `pnpm --filter @pms/db generate` against the current schema (`packages/db/src/schema.ts` + `packages/auth/src/auth-schema.ts`) so drizzle-kit emits a single `0000_*.sql` plus matching meta snapshot/journal. Prefer generate over hand-concatenating SQL so journal/snapshots stay consistent with drizzle-kit.
- KTD3. **Public tree exclude list is explicit.** When staging the orphan commit, ensure these paths are absent: `docs/plans/` (omit even if still present locally), `docs/residual-review-findings/`, `docs/deployment/openpanel-pms-do.md`, `.env`, `node_modules/`, build outputs. Rely on `.gitignore` plus explicit deletes for previously tracked private docs.
- KTD4. **Ship path when remote is empty.** Prefer `gh repo create WEB-DO-Cloud/pms-os --public --source=. --remote=origin` (or add `origin` then push orphan branch as `main`) only after `gh auth status` succeeds. If the remote already exists empty, push orphan `main`. If create/push fails on auth, stop with local orphan ready — do not fall back to a personal fork unless the user later asks.
- KTD5. **Community docs tone.** README leads with product + self-host; commercial SaaS is a short dual-license note, not the hero. CONTRIBUTING stays short: install, `pnpm test` / `pnpm typecheck`, PR hygiene, AGPLv3 note, Issues on the GitHub repo.

### Research Notes

- Migrations today: `0000`–`0006` under `packages/db/migrations/` with journal entries through `0006_physical_rooms`; schema lives in `packages/db/src/schema.ts` and auth tables in `packages/auth/src/auth-schema.ts` (both referenced from `packages/db/drizzle.config.ts`).
- Root README already links `docs/deployment/openpanel-pms-do.md` — that link must die with the file.
- `.gitignore` already ignores `.env` and `.env.*` except `.env.example`.
- `gh` may need install + auth in this environment.
- Existing WIP on `feat/pms-os-platform` is the content baseline for the public tree (include current working changes that belong in the product).

### Implementation Constraints

- Do not delete or strip `packages/ee`, licensing, or commercial app paths.
- Do not rewrite AGPLv3 LICENSE.md text; only reference it from README/CONTRIBUTING.
- Avoid rewriting product code solely for publish cosmetics.
- Migration squash invalidates existing local DBs that already applied `0000`–`0006`; that is acceptable for this launch (R8). Document in README that greenfield migrate is expected.

### Sequencing

1. U1 strip private docs + sanitize remaining deploy docs  
2. U2 community README + CONTRIBUTING + `.env.example` community defaults  
3. U3 migration squash + schema test still green  
4. U4 orphan public baseline + remote create/push (auth-gated)

## Implementation Units

### U1. Strip private / host-specific docs

- **Goal:** Public tree no longer carries residual findings or OpenPanel/pms.do runbooks; plans are excluded at publish time.
- **Requirements:** R9, R10, A4
- **Files:**
  - Delete immediately: `docs/residual-review-findings/` (all), `docs/deployment/openpanel-pms-do.md`
  - Edit: `docs/deployment/launch-checklist.md` (remove pms.do/app.pms.do host coupling; keep generic cutover steps)
  - Touch as needed: other `docs/deployment/*` only if they hard-require the removed OpenPanel doc
  - `docs/plans/`: leave in place during execution so this plan remains readable; omit the entire directory when staging the orphan commit in U4 (R9)
- **Approach:** Delete residual findings and the OpenPanel runbook. Sanitize launch checklist to self-host language. Keep `backup-restore.md`, `rollback.md`, `verification-queries.md`, `channex-webhooks.md` if they remain useful without the OpenPanel doc; fix any broken cross-links.
- **Dependencies:** None
- **Test scenarios:**
  1. Expected: `docs/deployment/openpanel-pms-do.md` and `docs/residual-review-findings/` are gone from the working tree.
  2. Expected: No remaining markdown links point at the deleted OpenPanel path.
  3. Expected (with U4): orphan commit tree has no `docs/plans/`.
- **Verification:** `rg -n 'openpanel-pms-do|residual-review-findings' --glob '!node_modules' .` returns no hits in kept docs. Spot-check `docs/deployment/` still coherent.

### U2. Community README, CONTRIBUTING, env example

- **Goal:** First-time visitors and contributors can understand, run, and contribute.
- **Requirements:** R3, R4, R5, R6, R12, A5
- **Files:**
  - `README.md`
  - `CONTRIBUTING.md` (new)
  - `.env.example`
- **Approach:** Rewrite README for community: intro, features at a glance (short), dual license (AGPLv3 community / commercial for SaaS), stack, prerequisites, local quickstart (`pnpm install`, Postgres, migrate, `pnpm dev`), Docker quickstart pointing at generic compose docs, edition env note, link to CONTRIBUTING and Issues (`https://github.com/WEB-DO-Cloud/pms-os/issues`). CONTRIBUTING: fork/clone, install, env, migrate, test/typecheck commands from root `package.json`, PR expectations, license note. Set `.env.example` `PMS_EDITION=community`, clear or placeholder commercial-only emails/hosts.
- **Dependencies:** U1 (so README does not link deleted files)
- **Test scenarios:**
  1. Expected: README mentions WEB DO Cloud, AGPLv3, `pnpm dev`, Docker, CONTRIBUTING, and does not link `openpanel-pms-do`.
  2. Expected: `.env.example` defaults to community edition and contains no real secret values.
- **Verification:** Manual read of README/CONTRIBUTING; `rg -n 'PMS_EDITION' .env.example` shows community default.

### U3. Squash Drizzle migrations to one baseline

- **Goal:** Greenfield installs apply a single migration matching current schema.
- **Requirements:** R7, R8, SC2
- **Files:**
  - `packages/db/migrations/**` (replace)
  - `packages/db/src/schema.test.ts` (run; edit only if squash reveals invariant drift — prefer no product schema changes)
- **Approach:** Remove existing SQL + meta. Run drizzle-kit generate via `pnpm --filter @pms/db generate` (needs `DATABASE_URL` only if config requires connectivity — current config uses URL for credentials but generate is schema-diff based; use empty DB or documented drizzle workflow). Confirm journal has exactly one entry and SQL creates the full schema. Run `@pms/db` tests.
- **Dependencies:** None (can parallelize with U1/U2; land before U4)
- **Test scenarios:**
  1. Expected: Only one migration tag in `packages/db/migrations/meta/_journal.json`.
  2. Expected: `pnpm --filter @pms/db test` passes (schema invariants unchanged).
  3. Expected: On a fresh empty Postgres, `pnpm db:migrate` applies without error (when DB available); if no DB in CI/sandbox, document that generate output was inspected and journal/SQL are consistent.
- **Verification:** Journal entry count = 1; `pnpm --filter @pms/db test`; migrate smoke when Postgres is up.

### U4. Orphan public baseline and GitHub publish

- **Goal:** Public GitHub repo exists with clean history and cleaned tree.
- **Requirements:** R1, R2, R3, R11, R12, SC1, SC4, SC5
- **Files:** git metadata / remotes only (plus any tiny publish helpers if unavoidable — prefer none)
- **Approach:**
  1. Confirm `.env` is ignored and untracked.
  2. Install `gh` if missing; run `gh auth status`. If unauthorized, stop after creating local orphan commit and report the auth step to the user.
  3. Create orphan branch from cleaned tree; stage with `docs/plans/` explicitly excluded; commit message suitable for public root (e.g. `chore: initial public release of PMS OS`).
  4. Create or use `WEB-DO-Cloud/pms-os`; set `origin`; push orphan branch as `main`.
  5. Verify remote file list lacks stripped paths, `docs/plans/`, and `.env`.
- **Dependencies:** U1, U2, U3
- **Test scenarios:**
  1. Expected: `git log --oneline` on the pushed `main` shows a single root commit (or only intentional public commits from this publish, not the private feature history).
  2. Expected: Remote HEAD tree has `README.md`, `CONTRIBUTING.md`, single migration, no `docs/plans/`, no `openpanel-pms-do.md`.
  3. Expected: Auth failure path leaves a local orphan branch ready to push — no half-configured wrong remote.
- **Verification:** `gh repo view WEB-DO-Cloud/pms-os --json url,visibility`; `git ls-remote`; spot-check via `gh api` or clone smoke if auth allows.

## Verification Contract

- `pnpm --filter @pms/db test` — schema invariants after migration squash
- `pnpm --filter @pms/db generate` outcome inspected — single journal entry
- `pnpm db:migrate` against empty Postgres when available
- Link/path greps: no `openpanel-pms-do`, no committed `.env`
- `gh repo view WEB-DO-Cloud/pms-os` — public URL exists after publish (or explicit auth-blocked status)
- Optional broader: `pnpm typecheck` / `pnpm test` if time allows; not required to block publish if only docs/migrations/git changed and db tests pass

## Definition of Done

- All units U1–U4 complete, or U4 stopped only on documented GitHub auth blocker with U1–U3 done and local orphan commit present
- Product Contract success criteria SC2–SC5 met locally; SC1 met when auth allows
- No secrets in the public tree
- Private development branch history remains available locally and is not the public `main` history
- Plan file itself is not part of the public orphan tree (R9)
