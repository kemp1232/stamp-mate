# S8-undo — Results

Covers `undoLastStamp` in `src/lib/actions/stamp.ts`. Executed against `http://localhost:3100` and the local Supabase Postgres DB, all fixtures scoped to freshly-created businesses/customers/cards per case.

Script: `S8-undo/run.js` (real Playwright UI clicks for happy-path/audit cases; raw `fetch` replays of captured real server-action POSTs — `undoLastStamp` and, for SD-2, also `redeemReward` — for negative/boundary/concurrency cases). Probe scripts: `S8-undo/probe-capture.js`, `probe-sd2-fulltext.js`.

**Harness fix applied** (shared with S7, see that suite's report): `qa/lib/harness.js`'s `signUpUser`/`signInUser` were missing an `Origin` header, causing every sign-up/sign-in to fail with `403 MISSING_OR_NULL_ORIGIN`. Fixed by adding `origin: BASE_URL` to both fetch calls.

## Results

| ID | Title | Priority | Status | Evidence | Notes |
|----|-------|----------|--------|----------|-------|
| S8-001 | Undo on ACTIVE card | P0 | PASS | Card 3/5 → UI click "Undo Last Stamp" → `select count(*) from stamp` = 2; `loyalty_card.status`='ACTIVE' | |
| S8-002 | Undo on COMPLETED reverts to ACTIVE | P0 | PASS | Card 5/5 COMPLETED → UI undo → count=4, `loyalty_card.status`='ACTIVE' | |
| S8-003 | Undo on REDEEMED rejected | P0 | PASS | HTTP 200, `{"error":"This card's stamps can no longer be changed."}`; stamp count unchanged (1) | Direct POST (token-swapped replay) |
| S8-004 | Undo on CANCELLED rejected | P1 | PASS | HTTP 200, `{"error":"This card's stamps can no longer be changed."}`; stamp count unchanged (1) | |
| S8-005 | Undo with zero stamps | P1 | PASS | ACTIVE card 0/5 → `{"error":"There are no stamps to undo."}` | |
| S8-006 | Undo deletes the LATEST stamp | P1 | PASS | 3 stamps seeded at t1<t2<t3 (distinct createdAt); after undo, remaining stamp ids = {id1,id2} (t1,t2); id3 (t3, latest) deleted | |
| S8-007 | Undo tie-break within same millisecond **[SD-12 — REFINED / see Defects]** | P2 | PASS | 8 independent runs, each with 2 fresh stamps sharing an identical `createdAt`; the **same** stamp (the first-inserted of the pair) was deleted in **all 8/8 runs** — empirically consistent, not randomly flip-flopping | See Defects: consistency observed here is not a code guarantee |
| S8-008 | Undo by a different staff member of same business | P1 | PASS | Stamp added by Staff A2 (`staffUserId`=A2), then Owner A successfully undoes it via UI → count=0. Checked `information_schema.tables` for `%audit%` → none exist; the undo action itself is not logged anywhere (audit-coverage gap, matches test plan's expected note, not a new defect) | |
| S8-009 | Undo by other-business staff rejected | P0 | PASS | Owner A's session POSTed against Business B's card → HTTP 303, `x-action-redirect: /dashboard;push`; stamp count on B's card unchanged | |
| S8-010 | Concurrent undo+redeem on a COMPLETED card **[SD-2 — CONFIRMED]** | P0 | PASS (defect confirmed) | See Defects section below | 5/5 iterations reproduced an unhandled 500 |
| S8-011 | Undo after redemption cycle started (sequential) | P1 | PASS | Old card REDEEMED (cycle 1), new card ACTIVE (cycle 2) pre-seeded; undo on old (REDEEMED) token → `{"error":"This card's stamps can no longer be changed."}`; no change to either card | |
| S8-012 | Undo unknown/missing token | P2 | PASS | Unknown token → `{"error":"Card not found."}`; empty token → `{"error":"Missing card token"}` | |

**Totals: 12 PASS / 0 FAIL / 0 BLOCKED / 0 NOT-RUN**

## Defects

### SD-2 — `undoLastStamp` doesn't re-read card status inside its transaction; races with `redeemReward` (CONFIRMED — unhandled 500, not data corruption)

- **Severity:** High
- **Test case ID(s):** S8-010
- **File:line:** `src/lib/actions/stamp.ts:93-130`. The card's `status` is read once at line 93 via `getStaffCardByToken(cardToken)`, checked at line 100 (`card.status === "REDEEMED" || card.status === "CANCELLED"`), and then used **again, stale**, inside the transaction at lines 121-124 (`if (card.status === "COMPLETED" && remaining < card.loyaltyProgram.requiredStamps)`) — unlike `addStamp` (stamp.ts:41-44) and `redeemReward` (rewards.ts:44-51), which both call `tx.loyaltyCard.findUniqueOrThrow` for a **fresh** status read inside the transaction.
- **Repro:** `S8-undo/run.js` case `S8-010` (full-body variant in `S8-undo/probe-sd2-fulltext.js`):
  1. Seed a card COMPLETED at 5/5.
  2. Capture one real `undoLastStamp` POST and one real `redeemReward` POST via Playwright (`redeemReward`'s confirm dialog auto-accepted).
  3. Token-swap both captured requests to point at the target card, then fire both concurrently via `Promise.all`+`fetch`.
- **Observed vs Expected:**
  - Ran 5 iterations. In **all 5/5**, `redeemReward` won the race (HTTP 303 → new cycle-2 ACTIVE card created, old card set REDEEMED, one `reward_redemption` row) and `undoLastStamp` then hit the stale-status branch and threw:
    ```
    PrismaClientKnownRequestError
    Invalid `tx.loyaltyCard.update()` invocation ... at stamp.ts (compiled) line 283 (source: undoLastStamp's `tx.loyaltyCard.update({ where: { id: card.id }, data: { status: "ACTIVE" } })`)
    Unique constraint failed on the fields: (`"customerId"`, `"loyaltyProgramId"`)
    ```
    This is exactly the partial unique index `loyalty_card_one_active_per_customer_program` (`ON loyalty_card(customerId, loyaltyProgramId) WHERE status='ACTIVE'`, `prisma/migrations/20260706070621_.../migration.sql:55-58`) rejecting the attempt to flip the now-REDEEMED old card back to ACTIVE while the new cycle-2 card is already ACTIVE.
    - HTTP status returned to the client: **500**, with the raw Prisma error, file path (`.next/dev/server/chunks/ssr/_0k025da._.js`), and stack trace serialized directly into the response body — an **unhandled exception surfaced to the browser**, not caught by the `StampActionError` handling in `stamp.ts:131-136` (which only catches its own custom error class, not `Prisma.PrismaClientKnownRequestError` the way `rewards.ts:83-88` does for its own P2002 case).
  - **Resulting DB rows** (checked after each iteration): stamp count remained **5/5** on the old (now-REDEEMED) card — i.e. the `tx.stamp.delete()` at stamp.ts:115 *was* rolled back along with the rest of the failed transaction, because Prisma's `$transaction` auto-rolls-back on any thrown error. `redemptionRows` = 1 (exactly one, from the winning redeem), and `allCardsForCustomer` showed exactly two cards: old REDEEMED (cycle 1) + new ACTIVE (cycle 2) — the correct, uncorrupted end state.
  - **Expected (per test plan):** re-read and re-validate status inside the transaction and reject cleanly if not ACTIVE/COMPLETED, returning a friendly `{error: ...}` instead of a 500.
  - **Refutation of the "stamp silently deleted from a REDEEMED card" branch:** in all 5 observed runs this did **not** happen — Prisma's transaction rollback protected data integrity (the delete was undone along with the failed update). The concrete, reproducible failure mode is the **unhandled 500 with an internal-error/stack-trace leak**, not silent data corruption. This refines SD-2: the crash path is real and 100% reproducible in this race ordering; the "stamp deleted from REDEEMED card" data-corruption path was not observed and would require a different interleaving (e.g., the transaction committing the delete before the doomed update, which Prisma's default transaction semantics prevent here since both writes are in the same `$transaction`).
- **Suggested fix:** Inside `undoLastStamp`'s transaction, re-read `card.status` fresh via `tx.loyaltyCard.findUniqueOrThrow` (mirroring `addStamp`/`redeemReward`) and reject with a friendly error if it is not `ACTIVE` or `COMPLETED` at that point; additionally, catch `Prisma.PrismaClientKnownRequestError` with code `P2002` around the transaction (mirroring `rewards.ts:83-88`) as defense-in-depth so any remaining race window degrades to a friendly message instead of a 500.

### SD-12 — Undo's `orderBy createdAt desc` has no explicit tiebreaker (latent defect; observed behavior was consistent in testing, not a demonstrated production failure)

- **Severity:** Low
- **Test case ID(s):** S8-007
- **File:line:** `src/lib/actions/stamp.ts:106-109` — `tx.stamp.findFirst({ where: { loyaltyCardId: card.id }, orderBy: { createdAt: "desc" } })` has no secondary sort key (e.g. `id`) to break ties when two stamps share an identical `createdAt`.
- **Repro:** `S8-undo/run.js` case `S8-007`: 8 independent iterations, each seeding a fresh card with exactly two `stamp` rows sharing one identical `createdAt` timestamp (`addStampRow(cardId, userId, sameDate)` called twice with the same `Date` instance), then calling `undoLastStamp` and recording which of the two rows was deleted.
- **Observed vs Expected:**
  - In all 8/8 runs, the **same** row of the tied pair was deleted — specifically, the first-inserted row of each pair was always deleted and the second-inserted row always survived. This is a **consistent, reproducible pattern in this environment**, not a demonstrated flip-flopping failure.
  - However, this consistency is **not guaranteed by the code**: SQL does not specify tie-break order for `ORDER BY` without a secondary key, and Postgres commonly (but not contractually) returns tied rows in insertion/heap order absent an index that would change the scan order. This behavior could change under different query plans, after `VACUUM`/`REINDEX`, with a different Postgres version, or under genuinely concurrent inserts (as opposed to this test's sequential inserts with an identical timestamp) — none of which the application code controls or is protected against.
  - **Expected (per test plan):** a deterministic tiebreaker (e.g., a monotonic sequence column or secondary `orderBy: { id: "desc" }`) so "undo the stamp I just added" is guaranteed correct regardless of Postgres's incidental row-return order.
- **Suggested fix:** Add a secondary sort key to the `orderBy`, e.g. `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`, or introduce a monotonically increasing sequence/serial column on `stamp` and sort by that.

## Other notes

- Error message strings matched `src/lib/actions/stamp.ts` verbatim in every case (`"This card's stamps can no longer be changed."`, `"There are no stamps to undo."`, `"Card not found."`, `"Missing card token"`).
- S8-008's audit-coverage observation (undo actions are not logged anywhere — no `audit` table exists in the schema, confirmed via `information_schema.tables`) matches the test plan's expected note; this is documented behavior, not a new defect, per the test plan's framing ("record as an audit-coverage gap").
