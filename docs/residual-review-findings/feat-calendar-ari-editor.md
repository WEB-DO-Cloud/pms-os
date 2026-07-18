# Known Residuals — feat/calendar-ari-editor

Source review: `/tmp/compound-engineering/ce-code-review/20260718-101825-1875d3a7`  
Plan: `docs/plans/2026-07-18-001-feat-calendar-ari-editor-plan.md`

Accepted residual after review followup (findings #1–#5 fixed in review commit).

## Actionable residual

### #6 P1 — Multi-property selection UI (R9)

- **File:** `apps/web/app/components/calendar/CalendarAriDrawer.vue`
- **Status:** Accepted for follow-up (not blocking merge of gated default-off writes)
- **Why deferred:** Product surface for portfolio fan-out needs UX design (property multi-select + independent outcome list). Domain already supports per-property independent enqueue; Calendar/Rates UI remains single-property (selected cell) for this ship.
- **Suggested follow-up:** Add multi-property selection that fans out one availability/restrictions command per property and surfaces independent outcomes (R13).

## Fixed in review followup

| # | Severity | Title |
|---|---|---|
| 1 | P0 | ARI/AI persist fail-closed on PG failure |
| 2 | P1 | Availability preview `roomTypeId` filter |
| 3 | P1 | Booking CRS worker outbox drain |
| 4 | P1 | Direct booking stale snapshot + vacancy gates |
| 5 | P1 | Catalog-wins `rateMode` trust boundary |
