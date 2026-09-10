# Residual Review Findings

Source: LFG review of `feat/pms-do-western-homepage`  
Plan: `/home/web/docs/plans/2026-09-09-004-feat-pms-do-homepage-plan.md`  
Review run: `/tmp/compound-engineering-1000/ce-code-review/20260909-235043-7b02dad2`  
Head at review: `7b3ef68` plus uncommitted simplify/review edits committed after this record.

Applied before this record:

- Ponytail comment on the naive email regex (`index.vue`)
- `forbiddenCopy` now scans `nuxt.config.ts` as well as `index.vue`
- Restored `prefers-reduced-motion` (plan KTD5)

## Residual Review Findings

- P1, `apps/website/app/pages/index.vue:131`, submitQuote validation and mailto untested — [issue #2](https://github.com/WEB-DO-Cloud/pms-os/issues/2)
- P1, `apps/website/scripts/verify-isolation.mjs:63`, Copy gate can pass on comments — [issue #3](https://github.com/WEB-DO-Cloud/pms-os/issues/3)
- P1, `apps/website/scripts/verify-isolation.mjs:77`, Forbidden-claim regexes miss rewritten copy — [issue #4](https://github.com/WEB-DO-Cloud/pms-os/issues/4)
- P1, `apps/website/nuxt.config.ts:45`, Stale cached HTML can outlive a green claims gate (Caddy overwrites origin `s-maxage` / `/_nuxt` immutable). Out of this PR’s website-only scope.
- P2, `apps/website/app/pages/index.vue:154`, Mobile menu lifecycle has no automated tests.
- P2, `apps/website/app/pages/index.vue:166`, Mobile menu lacks focus trap / restore (manual a11y follow-up).
- P2, `apps/website/app/pages/index.vue:84`, Region list duplicated between page and verifier (do not flatten the markets section).
- P2, `apps/website/scripts/verify-isolation.mjs:50`, Marketing copy checks live in the isolation verifier; no negative fixtures.
- P2, `apps/website/app/pages/index.vue:151`, Oversized quote fields can fail `mailto:` silently; visible `hello@pms.do` remains the fallback.
