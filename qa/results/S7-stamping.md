# S7-stamping — Results

Covers `addStamp` in `src/lib/actions/stamp.ts`. Executed against `http://localhost:3100` and the local Supabase Postgres DB (`postgresql://postgres:postgres@127.0.0.1:56322/postgres`), all fixtures scoped to freshly-created businesses/customers/cards per case (harness `uid()`/`seedTenant()`).

Script: `S7-stamping/run.js` (drives real Playwright browser clicks for the happy-path/audit cases, and raw `fetch` replays of a captured real server-action POST — cookie + `next-action` header + multipart body, with the `cardToken` field value swapped — for the negative/boundary/concurrency cases). Probe scripts used to validate the technique: `S7-stamping/probe-capture.js`, `probe-capture2.js`, `probe-sd1.js`, `probe-redirect.js`.

**Harness fix applied** (bug found while starting, not part of the app under test): `qa/lib/harness.js`'s `signUpUser`/`signInUser` were missing an `Origin` header, causing Better Auth to reject every sign-up/sign-in with `403 MISSING_OR_NULL_ORIGIN`. Added `origin: BASE_URL` to both fetch calls — this affects all suites using the shared harness, not just S7/S8.

## Results

| ID | Title | Priority | Status | Evidence | Notes |
|----|-------|----------|--------|----------|-------|
| S7-001 | Add stamp on ACTIVE card | P0 | PASS | `stamp` row created with `staffUserId=8944b16a-...` = owner's userId; `select count(*) from stamp where "loyaltyCardId"=<card>` → 1; `loyalty_card.status` = `ACTIVE` | Driven via real UI click |
| S7-002 | Reaching requiredStamps flips to COMPLETED | P0 | PASS | Card seeded 4/5, UI click → 5 stamp rows, `loyalty_card.status`='COMPLETED'; Redeem Reward button became visible in DOM | |
| S7-003 | requiredStamps=1 completes on first stamp | P1 | PASS | Fresh program `requiredStamps=1`, card 0/1, one UI click → `loyalty_card.status`='COMPLETED' | |
| S7-004 | Add stamp on COMPLETED card rejected | P0 | PASS | HTTP 200, response body contains `{"error":"This card can't take more stamps right now."}`; stamp count unchanged at 5 | Direct POST bypassing disabled UI button |
| S7-005 | Add stamp on REDEEMED card rejected | P0 | PASS | HTTP 200, `"This card can't take more stamps right now."`; stamp count unchanged | |
| S7-006 | Add stamp on CANCELLED card rejected | P1 | PASS | HTTP 200, `"This card can't take more stamps right now."`; stamp count unchanged | |
| S7-007 | Guard when stampCount already ≥ required on ACTIVE | P1 | PASS | Contrived ACTIVE card with 5 stamp rows (required=5); addStamp → `{"error":"This card is already full."}`; count unchanged at 5 | |
| S7-008 | Unknown card token | P1 | PASS | Token `doesnotexist12345doesnotexist12345` → `{"error":"Card not found."}` | |
| S7-009 | Missing cardToken | P1 | PASS | Empty `cardToken` field → `{"error":"Missing card token"}` (zod `min(1)`) | |
| S7-010 | Staff from another business rejected | P0 | PASS | Owner A's session POSTed against Business B's card token → HTTP 303 with `x-action-redirect: /dashboard;push`; `select count(*) from stamp where "loyaltyCardId"=<B's card>` unchanged at 0 | Server action `redirect()` surfaces as 303 + `x-action-redirect` header when called via `fetch` |
| S7-011 | Audit trail records correct staffUserId | P0 | PASS | Staff A2 stamps first (`stamp[0].staffUserId` = A2's userId), then Owner A stamps (`stamp[1].staffUserId` = Owner A's userId) on the same card, ordered by `createdAt`; the two ids are distinct and each matches the actor who submitted | Verified via `psql`-equivalent `sql()` query |
| S7-012 | Concurrent double-tap Add Stamp over-stamps past required **[SD-1 — CONFIRMED]** | P0 | PASS (defect confirmed) | See Defects section below | 6 of 9 concurrent runs over-stamped |
| S7-013 | Concurrent add at low count (no overshoot but both succeed) | P2 | PASS | Card at 1/5, fired 2 concurrent adds → final 3/5, `status='ACTIVE'` (both succeeded, no harmful overshoot below the completion boundary) | Confirms the race is only *harmful* at the completion boundary, per test plan's framing |
| S7-014 | Add stamp revalidates despite client disabled button | P1 | PASS | On a COMPLETED card, `button:has-text("Add Stamp")` has `disabled=true` in the DOM (confirmed via Playwright `isDisabled()`); direct POST to the same server action still returns `{"error":"This card can't take more stamps right now."}` and stamp count is unchanged | Confirms client `canAddStamp` is UX-only, server independently re-validates |

**Totals: 14 PASS / 0 FAIL / 0 BLOCKED / 0 NOT-RUN**

## Defects

### SD-1 — Concurrent Add Stamp over-stamps a card past `requiredStamps` (CONFIRMED)

- **Severity:** Critical
- **Test case ID(s):** S7-012 (also observable via S7-002/S7-007 context)
- **File:line:** `src/lib/actions/stamp.ts:41-68` — specifically the `count()` at lines 52-54 and `create()` at lines 59-61 inside `prisma.$transaction`, with no row lock and no unique constraint preventing more than `requiredStamps` stamp rows per card.
- **Repro:** `S7-stamping/run.js`, case `S7-012` (also standalone in `S7-stamping/probe-sd1.js`):
  1. Seed a card ACTIVE at 4/5 (`requiredStamps=5`).
  2. Capture one real `addStamp` POST via Playwright (`page.on('request')`), then replay it 5 times concurrently via raw `fetch` (same cookie + `next-action` header + multipart body) using `Promise.all`.
  3. Inspect `select count(*) from stamp where "loyaltyCardId"=<card>` and `loyalty_card.status`.
- **Observed vs Expected:**
  - Ran 9 total iterations: 6 iterations starting at 4/5 (fired 5 concurrent requests each), 3 iterations starting at 0/5 (fired 5 concurrent requests each, capped at exactly 5 successes since only 5 were fired).
  - **At 4/5 start (6 iterations, N=5 concurrent):** final stamp counts observed were **6, 9, 9, 9, 8, 9** — every single run exceeded `requiredStamps=5`. Status was `COMPLETED` in all 6, as expected once ≥5, but the card holds up to **9 stamp rows for a 5-stamp program** (80% over capacity in the worst observed run). `successes` (requests that got `"Stamp added."`) ranged from 2 to 5 per run, all in excess of the 1 slot that should have been available (4→5).
  - **At 0/5 start (3 iterations, N=5 concurrent):** all 5 requests succeeded, landing exactly at 5/5, `ACTIVE`→`COMPLETED` correctly — no overshoot was observed here only because exactly 5 requests were fired against a 5-slot card (i.e., the race window happened to not exceed capacity at this N). This does **not** contradict SD-1: it demonstrates the same lack of serialization, just not pushed past `requiredStamps` at this particular N.
  - **Expected:** total stamps on any card should never exceed `requiredStamps` (5), and the raw per-run data (`6,9,9,9,8,9`) shows it did, in 6 of 9 runs (67%).
- **Suggested fix:** Serialize per-card stamp mutations with a row lock (`SELECT ... FOR UPDATE` on the `loyalty_card` row inside the transaction before the count/insert), or add a `SERIALIZABLE` isolation transaction, or enforce a hard cap at the DB level (e.g., a trigger or a generated/sequence column with a check constraint) so total stamps can never exceed `requiredStamps` regardless of application-level races.

## Other notes

- No other suspected defects apply to S7 (SD-2, SD-12, and other SD refs belong to S8/other suites and are covered there).
- All error messages matched the exact strings from `src/lib/actions/stamp.ts` verbatim (`"This card can't take more stamps right now."`, `"This card is already full."`, `"Card not found."`, `"Missing card token"`).
- The redirect-based rejection for cross-business access (S7-010) surfaces as an HTTP **303** with an `x-action-redirect: /dashboard;push` header when invoked via raw `fetch` with `redirect:"manual"` — this is Next.js's on-the-wire representation of the server action's `redirect("/dashboard")` call, and confirms no card data or stamp mutation leaks across the business boundary.
