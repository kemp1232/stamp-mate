# S5-join-flow — QA Results

Covers `src/lib/actions/join.ts`, `src/lib/phone.ts`, `src/lib/validations/join.ts`, `src/app/join/[storeSlug]/`.

Executed against `http://localhost:3100` and local Supabase Postgres (`127.0.0.1:56322`) using Playwright (real browser form submissions) plus direct `pg` queries for DB assertions. Pure-schema boundary checks (`joinSchema`, `normalizePhone`) were additionally cross-verified in isolation via `npx tsx` importing the real source files directly (not re-implemented), per the briefing's guidance for pure functions.

Test script: `<SCRATCH>/qa/S5-join-flow/run.js` (run with `node S5-join-flow/run.js` from `<SCRATCH>/qa`). Executed 4 times total during development (1 flake in an early revision traced to a fixed 1.5s wait vs. Next dev-server on-demand compile latency — fixed by waiting on `waitForURL`/`waitForSelector` instead of a blind timeout); the final script version passed **21/21 on three consecutive clean runs**.

## Results

| ID | Title | Priority | Status | Evidence | Notes |
|---|---|---|---|---|---|
| S5-001 | Join happy path | P0 | PASS | Redirected to `/card/Qjn0Zjga1fzD2-YfKtfZOKG7Sl5ewgLw`; `customer.phone="09171234567"`, `customer.name="Juan Dela Cruz"`, `loyalty_card.status="ACTIVE"` | |
| S5-002 | Unknown storeSlug | P1 | PASS | GET `/join/ghost-bb6c9f23d7` body contains "Store not found". POST with `storeSlug` rewritten to the ghost slug on a real form → `{error:"This store isn't accepting new members right now."}`; 0 customer rows created for that phone | Confirmed both the page-level check (`page.tsx`) and the action-level check (`join.ts`) independently |
| S5-003 | Store exists, no program | P1 | PASS | GET on a zero-program store body contains "isn't accepting new members". POST (storeSlug repointed at the no-program store from a valid form) → same error text; 0 customers created for that business | |
| S5-004 | Store with only INACTIVE program | P0 | PASS | GET on INACTIVE-only-program store shows blocked message. POST (storeSlug repointed at it) → `{error:"This store isn't accepting new members right now."}`; 0 customers created | The INACTIVE-only store's own `/join` page renders `ErrorState` with no form, so the POST had to be driven from a different valid store's form with the hidden `storeSlug` field rewritten client-side — this correctly isolated the action-level `program` lookup (filtered to `status: ACTIVE`) from the page-level check |
| S5-005 | Phone normalization equivalence class (local formats) | P0 | PASS | `"0917 123 4567"`, `"09171234567"`, `"(0917) 123-4567"` all → token `3q-yPvlSZ5K7b2lzf8J82beQ1ybdfxmH` (identical across all 3 joins); exactly 1 `customer` row, exactly 1 `ACTIVE` `loyalty_card` row for `phone="09171234567"` | |
| S5-006 | International vs local prefix treated differently **[SD-5]** | P1 | PASS | `+639171234567`, `639171234567`, `09171234567` produced **3 distinct customer rows** (`d2c5bdc2…`, `f26ee656…`, `d3af59e4…`, phones stored verbatim per those keys) and **3 distinct card tokens** | **SD-5 CONFIRMED** — see Defects |
| S5-007 | Phone regex min length (7 chars) | P1 | PASS | `"123456"` (6) → `{error:"Enter a valid phone number"}`; `"1234567"` (7) → accepted, stored phone `"1234567"` | Verified via both `joinSchema.safeParse` (tsx) and live browser submit |
| S5-008 | Phone regex max length (20 chars) | P1 | PASS | 20×`"1"` → accepted, stored unchanged; 21×`"1"` → `{error:"Enter a valid phone number"}` | |
| S5-009 | Letters in phone rejected | P1 | PASS | `"0917ABC4567"` → `{error:"Enter a valid phone number"}` | |
| S5-010 | All-punctuation phone normalizes to empty **[SD-4]** | P0 | PASS | Alice `"(((-)))"` → customer created, token `m5mx8hrrm3YfGO4zJG6hzXs-UUOgpkpM`. Bob `.-.-.-. ` (different name, same-business join) → **upserted the same customer row** (name flips to `"Bob"`, id `0fc1b80d-e93b-461a-b935-26e5bce6630e`) and returned the **identical** token. Exactly 1 customer row with `phone=''` for the business; exactly 1 card row | **SD-4 CONFIRMED** — see Defects |
| S5-011 | Leading-plus-only normalizes to "+" | P2 | PASS | The test plan's literal `"+()-.  "` is actually **rejected** (`joinSchema` trims *before* the `min(7)` check, so it trims to `"+()-."` = 5 chars < 7) — reproduced and documented. Using a trim-safe 7-char equivalent, `"+((-.))"`, → accepted, normalizes to `"+"`, stored `customer.phone="+"` (distinct row from any `phone=''` row) | Test-plan literal doesn't survive validation as written; not a code defect — `.trim()` running before `.min()` is sane behavior. Documented so the discrepancy isn't mistaken for a bug next time this case is re-run |
| S5-012 | Name length 100 vs 101 | P1 | PASS | 100-char name → accepted, stored length 100; 101-char name → `{error:"Name is too long"}` | |
| S5-013 | Name whitespace-only / trim | P1 | PASS | `"   "` → `{error:"Name is required"}`; `"  Juan  "` → stored as `"Juan"` | |
| S5-014 | Rejoin with existing ACTIVE card returns SAME card | P0 | PASS | Pre-existing ACTIVE card token `j4gVf-9cghoWKVCyhKdc2L4ht9ss8YmU`; rejoin with same phone redirected to the **identical** token; `loyalty_card` count for the customer unchanged (1 before, 1 after) | |
| S5-015 | Rejoin updates customer name | P1 | PASS | Customer name `"Juan"` → rejoin with `"Juan Dela Cruz Jr"` → DB name updated to `"Juan Dela Cruz Jr"`; card token unchanged | |
| S5-016 | Rejoin after COMPLETED (unredeemed) card exists **[SD-9]** | P1 | PASS | Pre-existing `COMPLETED` card `P4Lovwh4VOWJZh4Edo67ytLWc44PU8ch`. Rejoin **minted a brand-new** `ACTIVE` card `F12OvewX0n_xEFesQOgDpNYd481g8ocs` instead of surfacing the COMPLETED one. Customer now holds 2 simultaneous card rows: `[{token:"F12O...", status:"ACTIVE"}, {token:"P4Lo...", status:"COMPLETED"}]` | **SD-9 CONFIRMED** — see Defects |
| S5-017 | Rejoin after REDEEMED card | P1 | PASS | Seeded `REDEEMED` cycle-1 card + `ACTIVE` cycle-2 card. Rejoin returned the cycle-2 token exactly; total card count for the customer stayed at 2 (no third card minted) | |
| S5-018 | Concurrent double-submit join (P2002 fallback) | P0 | PASS | Two browser pages, identical new phone `"0917 999 8888"`, submitted via `Promise.allSettled` simultaneously. Both POSTs returned HTTP 303 (no ≥500 response tracked via `page.on('response')`); both pages landed on the **same** card token `R81SVwYZg_QTa7gCbVP9wySuUbSg-G_T`; exactly 1 `customer` row and 1 `ACTIVE` `loyalty_card` row in DB | Stable across 3 repeated full-suite runs — no flake, no 500, no duplicate customer/card observed. The `findOrCreateActiveCard` P2002 catch-and-refetch fallback behaves as designed |
| S5-019 | Same phone joins two different businesses | P1 | PASS | Same phone `"0917 777 6666"` joined Business A and Business B independently: 2 distinct `customer` rows (different ids), 2 distinct card tokens, 1 card each | |
| S5-020 | Missing storeSlug in payload | P2 | PASS | Hidden `storeSlug` field removed from the DOM before submit → `{error:"Missing store."}`. Field present but blank (`value=""`) → same `{error:"Missing store."}` | |
| S5-021 | Phone with tabs/newlines | P2 | PASS | `"0917\t123\n4567"` (value set directly via DOM + `input` event, since a real keyboard can't type literal tab/newline into a single-line `<input>`) → accepted, stored phone `"09171234567"` — identical normalization to the space-separated variant | |

**Totals: 21 PASS / 0 FAIL / 0 BLOCKED / 0 NOT-RUN.**

## Defects

### 1. SD-4 — All-punctuation phone collapses to an empty-string upsert key, letting unrelated customers share one loyalty card
- **Severity:** Critical
- **Test case(s):** S5-010
- **File:line:** `src/lib/phone.ts:12` (`normalizePhone` strips all non-digit, non-leading-`+` characters, so an all-punctuation input like `(((-)))` or `.-.-.-.` yields `""`); the collision is enacted in `src/lib/actions/join.ts:86-90` (`tx.customer.upsert({ where: { businessId_phone: { businessId, phone } }, ... })`) — `phone` is never validated to be non-empty after normalization before being used as the upsert key.
- **Repro:** In the same business, join once with name `Alice`, phone `(((-)))`; then join again with name `Bob`, phone `.-.-.-.`. Both pass `joinSchema`'s regex/length checks (7 chars, allowed charset) but both normalize to `""`.
- **Observed:** A single `customer` row is created with `phone=''`. Bob's join **updates** that same row (`name` flips from `"Alice"` to `"Bob"`) rather than creating a second customer, and Bob is redirected to the exact same `cardToken` Alice was already holding — i.e. two different people end up sharing one loyalty card and one identity record. Proven with actual rows: one `customer` row (`phone=''`, `name="Bob"`) and one `loyalty_card` row shared by both join attempts.
- **Expected:** Each distinct person should get their own customer/card; a phone that normalizes to empty (or below some minimum digit count) should never be usable as a collision-prone upsert key.
- **Suggested fix:** After `normalizePhone`, reject (return a validation error) any result with zero digits — e.g. `if (!/\d/.test(phone)) return { error: "Enter a valid phone number" }` — before the upsert in `joinLoyaltyProgram`, rather than relying solely on the pre-normalization regex/length check.

### 2. SD-9 — Rejoining while an unredeemed COMPLETED card exists mints a second, parallel ACTIVE card instead of resurfacing the COMPLETED one
- **Severity:** High
- **Test case(s):** S5-016
- **File:line:** `src/lib/actions/join.ts:14-20` (`findOrCreateActiveCard`'s `existing` lookup is scoped to `status: "ACTIVE"` only) combined with the DB's partial unique index `loyalty_card_one_active_per_customer_program` (migration `20260706070621_add_customer_and_loyalty_card/migration.sql:55-58`), which only blocks a second row `WHERE status = 'ACTIVE'` — a `COMPLETED` row doesn't count, so nothing stops a fresh `ACTIVE` row from being created alongside it.
- **Repro:** Seed a customer with a `loyalty_card` row in status `COMPLETED` (stamps filled, not yet redeemed by staff) for a program. Have that customer rejoin via the public `/join/<slug>` link with the same phone.
- **Observed:** The action creates a brand-new `ACTIVE` card (token distinct from the COMPLETED card's token). The customer now simultaneously holds one `COMPLETED` card (fully stamped, awaiting staff redemption) and one fresh `ACTIVE` card (0 stamps) for the same program — proven with both rows queried directly from `loyalty_card`.
- **Expected (per test plan, flagged as ambiguous):** Either (a) `findOrCreateActiveCard` should also treat an unredeemed `COMPLETED` card as "the card to hand back" so staff redeem it and the redemption flow mints cycle 2 normally, or (b) parallel cards should be an explicit, intentional policy — but as implemented it's neither: it silently bypasses the one-active-card invariant the partial index was built to enforce, and lets a customer effectively "bank" a second full card's worth of stamps while their first reward is still unclaimed.
- **Suggested fix:** Broaden the `existing` lookup in `findOrCreateActiveCard` to also match `status: "COMPLETED"` (returning that card so the customer/staff is directed to redeem it first), or explicitly document/design for parallel cards if that's the intended product behavior.

### 3. SD-5 — Local (`0917…`) vs. international (`+639…` / `639…`) phone spellings of the same PH subscriber are treated as three unrelated customers
- **Severity:** Medium
- **Test case(s):** S5-006
- **File:line:** `src/lib/phone.ts:8-13` (`normalizePhone` only strips non-digits and preserves a leading `+` verbatim; it performs no PH-specific canonicalization such as mapping `63` / `+63` / `0` prefixes to one form).
- **Repro:** In the same business, join with `+639171234567`, then `639171234567`, then `09171234567` — three logically-identical PH mobile numbers.
- **Observed:** Three separate `customer` rows are created (`phone` stored as `"+639171234567"`, `"639171234567"`, `"09171234567"` respectively) and three separate `loyalty_card` tokens — confirmed via direct DB query showing all 3 distinct customer ids/phones.
- **Expected:** A canonical normalization would recognize these as the same underlying subscriber and route to one customer/card (or the product may deliberately choose not to — but the current behavior is silent data fragmentation with no warning to the business owner).
- **Suggested fix:** Add PH-specific canonicalization in `normalizePhone` (e.g., strip a leading `+63`/`63`/`0` national-mobile prefix down to a single canonical local form) before use as the upsert key, or explicitly document that international-format re-entry is expected to create a new membership.

## Additional observation (not a defect)

S5-011's test-plan literal, `"+()-.  "` (trailing double space, 7 raw characters), does **not** exercise the intended "normalizes to `+`" path: `joinSchema`'s `.trim()` runs before its `.min(7)` check, so the value is trimmed to `"+()-."` (5 characters) and correctly rejected with `"Enter a valid phone number"` — this was reproduced and is the correct, expected behavior given trim-then-validate ordering, not a bug. The equivalent case without trim-eaten whitespace (`"+((-.))"`, 7 chars, no leading/trailing space) does exercise the intended path and confirms `normalizePhone` stores a bare `"+"` as a customer's phone — a distinct (but still empty-ish/collision-adjacent) key from `""`, worth keeping in mind alongside SD-4.
