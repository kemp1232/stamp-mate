# S3-program-crud — Results

Executed against `http://localhost:3100` (real Next.js dev server) and the local Supabase Postgres DB
(`postgresql://postgres:postgres@127.0.0.1:56322/postgres`), for real — no code under test was modified.

Covers `src/lib/actions/loyalty-program.ts`, `src/lib/validations/loyalty-program.ts`, `src/lib/store.ts`, `src/app/dashboard/program/program-form.tsx`.

**Layer note:** `<input type="number" min=1 max=100 required>` on the program form blocks the browser
from even submitting several boundary values (`0`, `-1`, `5.5`, `"abc"`, `""`, `101`, `250`, tampered
`status`). Per the briefing, these were exercised by capturing the real React Server Action POST once via
`page.on('request')` (see `S3-program-crud/capture.js` → `S3-program-crud/capture-out.json`) and replaying
it with `fetch` + the exact `multipart/form-data` shape, the `Next-Action` header, and the session cookie
(`S3-program-crud/replay.js`), with only the field-under-test's value changed. This reaches
`loyaltyProgramSchema.safeParse` server-side, bypassing the browser constraint entirely. Every case below
states which layer rejected the input: **browser** (native HTML constraint, not reached) vs. **server /
Zod** (the actual `createLoyaltyProgram`/`updateLoyaltyProgram` validation).

All 20 cases were executed for real. Scripts: `S3-program-crud/run.js` (drives everything), helpers in
`S3-program-crud/local.js` (session/tenant setup) and `S3-program-crud/replay.js` (raw action POST replay).

| ID | Title | Priority | Status | Evidence | Notes |
|----|-------|----------|--------|----------|-------|
| S3-001 | Create program happy path | P0 | PASS | DB row created (`loyalty_program`), name="Coffee Club" analog stored correctly (name/requiredStamps=5/rewardText/status=ACTIVE all matched); store lazily created with slug `store-16f45d0ffb` (own tenant, not literally "aroma-coffee" — see notes); join URL containing that slug rendered on the page after the post-submit refresh. | Layer: server (Zod) + DB. Used a fresh isolated tenant/business (not the plan's literal "Aroma Coffee" fixture) per the harness's isolation rule; slugify behavior itself is covered exhaustively in S4. |
| S3-002 | Create when one already exists | P0 | PASS | Raw POST `createLoyaltyProgram` on a tenant that already has a program → `{"error":"This store already has a loyalty program. Edit it instead."}`; `psql` count of `loyalty_program` for that store stayed at 1. | Layer: server (findFirst-then-error check in the action, after Zod passes). |
| S3-003 | requiredStamps boundary: 0 | P0 | PASS | Raw POST `requiredStamps="0"` → `{"error":"Stamps required must be at least 1"}`; 0 rows written. | Layer: **server/Zod** — browser's native `min=1` on `type=number` would also block `0` from ever being typed/submitted, so this was exercised via raw POST replay per the briefing. |
| S3-004 | requiredStamps boundary: 1 | P1 | PASS | Raw POST `requiredStamps="1"` → `{"success":true}`, DB row `requiredStamps=1`. Follow-through: created a customer+ACTIVE card against that program, opened `/staff/cards/<token>` as the owner and clicked "Add Stamp" via the browser → `loyalty_card.status` became `COMPLETED` after exactly 1 stamp. | Layer: server/Zod for creation; full browser flow for the downstream completion check. |
| S3-005 | requiredStamps boundary: 100 and 101 | P0 | PASS | Same tenant, sequential raw POSTs: `101` → `{"error":"Stamps required must be 100 or fewer"}` (no row written, so it didn't pollute the "already has a program" state); `100` → `{"success":true}`, DB `requiredStamps=100`. | Layer: server/Zod (browser `max=100` would block `101` from being typed). |
| S3-006 | requiredStamps negative | P1 | PASS | Raw POST `requiredStamps="-5"` → `{"error":"Stamps required must be at least 1"}`; also tested `-1` (from the parent task's boundary list) → same error. 0 rows written. | Layer: server/Zod. Both `-5` (plan) and `-1` (briefing's boundary set) covered in one case. |
| S3-007 | requiredStamps non-integer float (5.5) | P1 | PASS | Raw POST `requiredStamps="5.5"` → `{"error":"Stamps required must be a whole number"}`. | Layer: server/Zod (`.int()` check fires as expected; browser `type=number` would actually *allow* typing `5.5` since it's a valid number, so this one *could* have been done via UI too — replay used for consistency). |
| S3-008 | requiredStamps non-numeric string (abc) | P1 | PASS | Raw POST `requiredStamps="abc"` → `{"error":"Invalid input: expected number, received NaN"}`. 0 rows written. | Layer: server/Zod. **Mismatch vs. test plan**: the plan expected the `.int()` "whole number" message (same as S3-007), assuming `z.coerce.number()` produces `NaN` which then fails only the `.int()` refinement. Actual (Zod v4) behavior: `z.coerce.number()` treats `NaN` as failing the *base* number-type check itself (message `"Invalid input: expected number, received NaN"`), never reaching the custom `.int()` message. Not a security issue — input is still correctly rejected with zero DB writes — but the exact message differs from the plan's assumption. Documented, not filed as a defect (message wording, not a functional bug). |
| S3-009 | requiredStamps empty string | P1 | PASS | Raw POST `requiredStamps=""` → `{"error":"Stamps required must be at least 1"}` (confirms `z.coerce.number("")` → `0`, then fails `.min(1)`, exactly as the plan predicted). | Layer: server/Zod. |
| S3-010 | requiredStamps huge number | P2 | PASS | Raw POST `requiredStamps="999999999999"` → `{"error":"Stamps required must be 100 or fewer"}`; also `requiredStamps="1e9"` (briefing's extra boundary) → same error. | Layer: server/Zod. Both the plan's `999999999999` and the briefing's `1e9` covered. |
| S3-011 | status enum tampering | P1 | PASS | Raw POST `status="DELETED"` → `{"error":"Invalid option: expected one of \"ACTIVE\"\|\"INACTIVE\""}`; `status="active"` (lowercase) → same enum error; `status=""` → same enum error. 0 rows written for any. | Layer: server/Zod (`z.enum(["ACTIVE","INACTIVE"])`); the Select is a Base UI component with no native HTML `<select>` constraint, so this genuinely needed the raw POST to tamper the underlying hidden input's value past what the UI would ever produce. |
| S3-012 | name/rewardText 2-char boundary + trim | P1 | PASS | name: `"A"` → `{"error":"Program name is required"}`; `" A "` (trims to 1) → same error; `"AB"` → `{"success":true}`. rewardText (separate tenant): `"A"` → `{"error":"Reward text is required"}`; `" A "` → same error; `"AB"` → `{"success":true}`. | Layer: server/Zod (`.trim().min(2, ...)`). Note: `"A"` (1 char) *would* pass the browser's HTML `required` attribute (any non-empty string satisfies `required`), so this boundary genuinely needed server-side verification even though it's reachable via the UI — confirmed via raw POST for precision on messages. |
| S3-013 | Unicode/emoji in name and reward | P2 | PASS | Raw POST create with `name="☕ Kape Club ☕"`, `rewardText="Libreng kape 🎁"` → success; `psql` shows both fields stored byte-for-byte identical to the input; `/join/<slug>` page (loaded via real browser) renders both strings verbatim in `document.body.textContent`. | Layer: server + DB + browser render. No corruption/mangling observed. |
| S3-014 | XSS payload in name/reward not executed | P0 | PASS | Created a program with `name="<script>alert(1)</script>"`, `rewardText='<img src=x onerror=alert(1)>'` (stored literally in DB, confirmed via `psql`). Loaded `/join/<slug>` and `/card/<token>` in a real browser with a `page.on('dialog')` handler that would flag any `alert()`: no dialog fired. `page.content()` (raw HTML) does **not** contain a live `<script>alert(1)</script>` tag nor an `<img onerror=...>` tag as real markup on either page; `page.textContent('body')` shows the payload as literal, inert text. Confirms no `dangerouslySetInnerHTML` anywhere in the render path — React's default escaping applies. | Layer: server (accepts any string — by design, XSS defense is at render time) + browser DOM inspection. **Security check PASSED — no defect.** |
| S3-015 | Update program happy path | P0 | PASS | Via real browser: filled `rewardText="Free cappuccino"`, `requiredStamps="6"` on `/dashboard/program`, submitted. `psql`: `loyalty_program.rewardText="Free cappuccino"`, `requiredStamps=6`. `/join/<slug>` (fresh browser context) shows both "Free cappuccino" and "6 stamps required". | Layer: full browser + server + DB. |
| S3-016 | Update missing programId | P1 | PASS | Raw POST `updateLoyaltyProgram` with `programId` field omitted entirely → `{"error":"Missing program."}`; target program row unchanged in DB. | Layer: server (the very first type-check in the action, before `requireOwner` even runs). |
| S3-017 | **[SUSPECTED DEFECT SD-6]** Concurrent create race | P1 | PASS (defect **CONFIRMED**) | Ran 5 independent trials, each: pre-created the store row directly (to isolate this race from the separate store-slug race, SD-7/S4-007), then fired two `Promise.all`'d raw `createLoyaltyProgram` POSTs at the same store. **5/5 trials produced 2 `loyalty_program` rows for the single store** — both requests returned `{"success":true}`, `psql` confirmed `rowCount=2` every time (e.g. "Race Program A" and "Race Program B" both persisted). Full per-attempt JSON logged in the test detail. | **SD-6 CONFIRMED** — see Defects section. Both concurrent requests pass the `findFirst` existence check before either `create()` lands, because there is no DB-level unique constraint on `loyalty_program.storeId` and no row lock / transaction serialization in `createLoyaltyProgram`. |
| S3-018 | INACTIVE program effect on join flow | P0 | PASS | Browser: `/join/<slug>` for a store whose only program is `INACTIVE` renders "This store isn't accepting new members right now." (via the page-level `ErrorState`, so the join form itself isn't even rendered). Additionally captured+replayed the real `joinLoyaltyProgram` raw POST (see `replayJoinAction` in `replay.js`) directly against that slug → `{"error":"This store isn't accepting new members right now."}`; `psql` customer count for the business unchanged before/after. | Layer: browser (page) + server (action) + DB. Both surfaces block correctly. |
| S3-019 | INACTIVE program: existing cards still usable | P1 | PASS | Seeded a tenant with an ACTIVE card, then `UPDATE loyalty_program SET status='INACTIVE'` directly via `psql`. Logged in as owner (who doubles as staff), opened `/staff/cards/<token>`, clicked "Add Stamp" in a real browser. `psql`: 1 stamp row inserted, `loyalty_card.status` still `ACTIVE`. | Layer: browser + DB. Confirms addStamp keys off card status, not program status — documented as intended behavior per the plan. |
| S3-020 | Program form client min/max does not replace server validation | P1 | PASS | Raw POST `requiredStamps="250"` (well past the HTML `max=100` the client form declares) → `{"error":"Stamps required must be 100 or fewer"}`; 0 rows written. | Layer: server/Zod — confirms the client `min`/`max` attributes are UX-only and cannot be relied on for security; the server independently re-validates. |

**Summary: 20/20 PASS, 0 FAIL, 0 BLOCKED, 0 NOT-RUN.**

## Defects

### SD-6 — Concurrent `createLoyaltyProgram` creates two programs for one store (confirmed)
- **Severity:** Medium (data-integrity bug, not directly exploitable for privilege escalation, but produces
  a genuinely broken state — a store with two "loyalty programs" and no defined way to know which one the
  join page will surface).
- **Test case ID(s):** S3-017.
- **File:line:** `src/lib/actions/loyalty-program.ts:24-53` (`createLoyaltyProgram`) — specifically the gap
  between the `prisma.loyaltyProgram.findFirst({ where: { storeId: store.id } })` existence check (line ~40)
  and the unguarded `prisma.loyaltyProgram.create(...)` a few lines later. There is no unique constraint on
  `loyalty_program.storeId` in the Prisma schema/migrations to catch this at the DB layer either.
- **Repro:** Fresh business/store with no program. Fire two `createLoyaltyProgram` POSTs (same store,
  different valid payloads) via `Promise.all`. Reproduced 5/5 times in this run using
  `S3-program-crud/run.js` (test `S3-017`); minimal repro is `S3-program-crud/run-s3017-only.js`.
- **Observed vs Expected:** Observed: both requests return `{"success":true}`; two distinct
  `loyalty_program` rows persist for the same `storeId`. Expected: at most one program per store — the
  second concurrent request should either fail with the "already has a loyalty program" error or be
  idempotently absorbed into the first.
- **Suggested fix:** Add a unique constraint/index on `loyalty_program.storeId` (a store having "exactly one
  program" is already the MVP's stated invariant) and treat the resulting `P2002` in `createLoyaltyProgram`
  the same way `joinLoyaltyProgram`'s `findOrCreateActiveCard` already does — catch it and return the
  "already has a program" error instead of crashing.

### SD-7 — `getOrCreateDefaultStore` slug race surfaces as an unhandled server error (confirmed, cross-referenced)
- **Severity:** High (unhandled exception reaches the user as a broken page; one of the two racing
  businesses ends up with **no store row at all**, permanently blocking that owner from ever creating a
  loyalty program until the row is manually fixed).
- **Test case ID(s):** Primarily owned/detailed in **S4-007** (this suite's `S3-017` deliberately
  pre-creates the store to *avoid* colliding with this separate race, per the briefing's guidance to isolate
  the two suspected defects). See `results/S4-store-slug.md` for the full repro, stack trace, and fix
  suggestion.
- **File:line:** `src/lib/store.ts:39-42` (`getOrCreateDefaultStore`), specifically the `prisma.store.create()` call at line 41.

## Notes on message-text vs. test-plan mismatches (not filed as defects)

- **S3-008**: the plan predicted the `.int()` "whole number" message for `requiredStamps="abc"`; actual
  Zod v4 behavior surfaces its own NaN base-type message instead (`"Invalid input: expected number,
  received NaN"`). The input is still correctly rejected with zero DB writes — this is a message-wording
  discrepancy from the plan's assumption about Zod v3-style coercion internals, not a functional bug.
