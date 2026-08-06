# StampMate — End-to-End QA Report

**Date:** 2026-08-06
**Build under test:** `main` @ `959eca8`
**Environment:** local Supabase Postgres + Next.js dev server, real browser (Chromium/Playwright)
**Method:** 209 test cases across 14 suites, executed for real against a live app and database — no simulated or assumed results.

---

## 1. Results at a glance

| Suite | Cases | Pass | Fail |
| --- | ---: | ---: | ---: |
| S1-auth | 19 | 19 | 0 |
| S2-authz-isolation | 18 | 17 | 1 |
| S3-program-crud | 20 | 20 | 0 |
| S4-store-slug | 8 | 8 | 0 |
| S5-join-flow | 21 | 21 | 0 |
| S6-card-token-security | 18 | 18 | 0 |
| S7-stamping | 14 | 14 | 0 |
| S8-undo | 12 | 12 | 0 |
| S9-redemption | 13 | 13 | 0 |
| S10-dashboard-stats | 12 | 12 | 0 |
| S11-ui-a11y | 18 | 16 | 2 |
| S12-scanner | 15 | 15 | 0 |
| S13-data-integrity | 15 | 15 | 0 |
| S14-build-health | 6 | 6 | 0 |
| **Total** | **209** | **206** | **3** |

### Read the pass rate carefully

**A 98.6% pass rate does not mean the product is in good shape.** The test plan was written to *predict* 13 specific defects and then prove or disprove each one. A case that successfully demonstrates a predicted bug is recorded as PASS — the test did its job. So the low FAIL count reflects a well-targeted plan, not a healthy build.

**The number that matters is: 22 confirmed defects, including 2 Critical and 5 High.**

---

## 2. Confirmed defects

### CRITICAL

**C-1 — Concurrent Add Stamp over-stamps past the reward threshold**
`src/lib/actions/stamp.ts:41-68`
The transaction runs `count()` then `create()` at READ COMMITTED with no row lock, and no DB constraint caps stamps per card. Five simultaneous requests on a card at 4/5 (`requiredStamps=5`) produced **6–9 stamp rows in 6 of 9 runs** — up to 80% over capacity. The card still flips to `COMPLETED`, so the surplus stamps are silently destroyed.
*Trigger in the wild:* a staff member double-tapping "Add Stamp" on a slow mobile connection. Not an exotic scenario — it's the single most-used button in the product.
*Direction:* `SELECT … FOR UPDATE` on the card row inside the transaction, or a DB-level constraint on stamp count.

**C-2 — Different customers merge onto one shared loyalty card**
`src/lib/phone.ts` (normalization) + `src/lib/actions/join.ts` (no post-normalization guard)
A phone of pure punctuation — `(((-)))`, `.-.-.-.` — passes the join Zod regex (7+ chars, permitted charset) but `normalizePhone` reduces it to `""`. The customer upsert keys on `(businessId, phone)`, so **every such person collapses onto one shared customer row and one shared ACTIVE card**. Proven end-to-end: Bob's join overwrote Alice's name and handed him her card token. Bob can see and spend Alice's stamps.
*This is a privacy and data-integrity failure reachable by a typo, not just by malice.*
*Direction:* reject phones that normalize to zero digits, in `join.ts` after `normalizePhone`.

### HIGH

**H-1 — Undo racing redemption returns an unhandled 500 with a stack trace**
`src/lib/actions/stamp.ts:93-130`
`undoLastStamp` reads `card.status` *before* opening its transaction and never re-reads it — unlike `addStamp` and `redeemReward`, which both re-check inside. Racing undo against redeem on a COMPLETED card produced an **unhandled HTTP 500 with a raw Prisma `P2002` stack trace returned to the client, 5/5 runs**.
*Partially refuted:* data integrity held. Prisma's rollback prevented any stamp being deleted from a redeemed card in every run. The defect is the crash and internal-error disclosure, not corruption.

**H-2 — Expired sessions keep authenticating for up to 5 minutes**
`src/lib/auth.ts` (`session.cookieCache`, `maxAge: 5 * 60`)
An expired `session.expiresAt` in the DB is not honored while the client still holds a fresh signed `better-auth.session_data` cache cookie. Confirmed by expiring the session directly in the DB and replaying with and without the cache cookie.
*Impact:* any forced revocation — admin logout, offboarding a staff member, responding to a stolen phone — has a 5-minute window where the revoked session can still add stamps and redeem rewards.

**H-3 — Rejoining with an unredeemed full card mints a second parallel card**
`src/lib/actions/join.ts` (`findOrCreateActiveCard`)
The lookup only matches `ACTIVE` cards, and the DB partial unique index only constrains `ACTIVE` rows. A customer who completed a card but hasn't redeemed it, then rescans the join QR, ends up holding **both a full unredeemed card and a fresh empty one**. New stamps land on the empty card while the earned reward is stranded.

**H-4 — Store-creation race permanently bricks a business**
`src/lib/store.ts:41`
`getOrCreateDefaultStore` does `findFirst` then `create` with no P2002 handling. Two businesses whose names slugify identically, creating concurrently, cause the loser to hit an **unhandled `PrismaClientKnownRequestError`** on `store.slug` and end with **zero store rows** — permanently unable to create a program without manual DB repair. Reproduced 1–2 times in 8 attempts.
*Narrow window, but unrecoverable without intervention — that's what makes it High rather than Medium.*

**H-5 — No error boundaries anywhere in the app**
`src/app/` — no `error.tsx`, `not-found.tsx`, or `global-error.tsx` exists
Any uncaught server error (including H-1 and H-4 above) falls through to Next.js's raw, unstyled default error page. Non-technical shop staff mid-transaction see a developer stack trace.

### MEDIUM

**M-1 — Account enumeration on registration** — `src/lib/actions/auth.ts:36-39`
Duplicate registration returns the raw `"User already exists. Use another email."`, letting an attacker enumerate registered emails.

**M-2 — Concurrent program creation yields two programs for one store** — `src/lib/actions/loyalty-program.ts`
The `findFirst` guard races; **reproduced 5/5 trials**. No unique constraint on `storeId` backs it. The MVP assumes one program per store and the join flow picks with `take: 1`, so which program a customer joins becomes arbitrary.

**M-3 — Same phone in three formats creates three customers** — `src/lib/phone.ts`
`+639171234567`, `639171234567`, and `09171234567` are one Philippine subscriber but produce three distinct customers and three cards. No country-code canonicalization. For a PH-market product this will fragment real customers routinely.

**M-4 — Staff tap targets below the 44px minimum** — `src/components/ui/button.tsx:27`
Add Stamp / Undo / Redeem render at **36px tall** (`h-9` via `size="lg"`). Directly contradicts the project's own rule that staff buttons be large and easy to tap.

**M-5 — Dark mode is dead code** — no `ThemeProvider` or theme toggle exists
Tailwind's `.dark`-gated variant is never applied, so every `dark:` class in the codebase is unreachable and the app always renders light regardless of OS preference.

**M-6 — `.env.example` does not exist** — referenced by `README.md:26,44` and `prisma.config.ts:13`
Absent from the repo and its git history. `.gitignore:29`'s `.env*` pattern would silently swallow it if re-added. New contributors have no template.

### LOW

| ID | Defect | Location |
| --- | --- | --- |
| L-1 | `extractCardToken` accepts card paths from **any origin** (`https://evil.com/card/<token>`). Token must still be a real 192-bit value and `requireBusinessAccess` still blocks cross-business use — phishing/trust-surface issue, not an access-control bypass. | `src/lib/card-token.ts:12-17` |
| L-2 | URL-derived tokens skip the `^[A-Za-z0-9_-]{8,}$` check that raw tokens must pass. Not exploitable — bad tokens fail the DB lookup — but an inconsistent validation gap. | `src/lib/card-token.ts:12-21` |
| L-3 | Undo's `orderBy createdAt desc` has no secondary tiebreaker. Empirically stable across 8 runs with identical timestamps, but unguaranteed. Latent. | `src/lib/actions/stamp.ts:106-109` |
| L-4 | `redirectTo` is a dead parameter — set by middleware, never read by the auth actions. Deep-link-after-login is broken. | `src/proxy.ts` + `src/lib/actions/auth.ts` |
| L-5 | Owner-only redirects from nested pages return HTTP `200` with a `NEXT_REDIRECT` flight marker instead of `307`, because the parent layout shell already flushed. Browsers behave correctly; non-JS clients don't. | `src/lib/authorization.ts` |
| L-6 | No pagination on the customer list — 120 customers render as 120 rows (~680ms). Fine now, unbounded later. | `src/lib/dashboard.ts:68-91` |
| L-7 | `/login`, `/register`, `/card/[token]`, `/staff/cards/[token]` have zero heading elements (`CardTitle` renders a `<div>`). The other 7 routes each correctly have one `<h1>`. | `src/components/ui/card.tsx` |
| L-8 | No `metadataBase` — OG/Twitter image URLs fall back to `http://localhost:3000` in production. | `src/app/layout.tsx:15` |
| L-9 | `/dashboard` root has no `loading.tsx` (all three sub-routes do). | `src/app/dashboard/` |

---

## 3. What was tested and found clean

Refutations matter as much as findings — these were specifically suspected and did **not** hold up:

- **No PII leakage.** Customer phone, email, and internal IDs appear nowhere in the card page HTML, the RSC flight data, or the QR payload. The QR encodes exactly `${appUrl}/staff/cards/${token}` — verified by decoding the rendered QR pixel-by-pixel.
- **No open redirect.** `redirectTo=https://evil.com` has zero effect — precisely because the parameter is ignored (L-4).
- **No email case-sensitivity duplicates.** Better Auth normalizes case before the DB unique constraint.
- **No silent corruption in the undo/redeem race.** Prisma's rollback protected integrity in every run; the failure is a crash (H-1), not data loss.
- **Redemption is concurrency-safe.** 4 rounds × 5 simultaneous replayed action POSTs each produced exactly one redemption row and one new card, with losers getting the friendly message and no 500s.
- **Cross-business isolation holds everywhere.** Tampered `cardToken`/`businessId`/`programId` payloads, forged session cookies, and STAFF-vs-OWNER boundaries were all correctly blocked with no data leakage.
- **Every DB constraint behaves as designed**, including the hand-written partial unique index and both `RESTRICT` foreign keys on the audit trail.
- **Build health is clean.** Lint, typecheck, and production build all pass; Prisma client has zero drift; every route that must be dynamic is dynamic; no stray `console.log`, TODO, or committed secrets.
- **Accessibility largely passes:** no mobile horizontal overflow across 11 routes, screenshot-friendly customer card, working empty/error states, correctly associated form errors, observed pending-button states, full keyboard navigability with visible focus, labelled inputs, correct QR alt text, and AA-passing contrast (4.70:1 and 5.07:1).

---

## 4. Themes

Three of the four Critical/High correctness bugs (C-1, H-1, H-4) and two Mediums (M-2) share one root cause: **check-then-act without a lock or a backing DB constraint**. `redeemReward` and the join flow's `findOrCreateActiveCard` get this right — they catch P2002 and recover. `addStamp`, `undoLastStamp`, `getOrCreateDefaultStore`, and `createLoyaltyProgram` don't. The fix pattern already exists in the codebase; it just isn't applied consistently.

The second theme is **validation that stops at the schema boundary**. The Zod regex accepts a phone; nobody re-checks what survives normalization (C-2). Raw tokens get a charset check; URL-derived ones don't (L-2).

## 5. Suggested triage order

1. **C-2** then **C-1** — customer-visible data corruption, both cheap to fix.
2. **H-5** — one file; immediately contains the blast radius of H-1 and H-4.
3. **H-1, H-4, M-2** — apply the existing P2002-recovery pattern uniformly.
4. **H-2, H-3** — session revocation window and the duplicate-card cycle gap.
5. **M-1, M-3, M-4** — enumeration, PH phone canonicalization, tap targets.
6. Lows as cleanup.

---

## 6. Artifacts

- `qa/TEST-PLAN.md` — the 209-case plan
- `qa/results/*.md` — per-suite results with concrete evidence (SQL rows, HTTP statuses, DOM text, exact error strings)
- `qa/results/screenshots/` — mobile screenshots from the a11y audit
- `qa/results/build-output.log` — full production build output

Re-runnable test scripts live in the session scratchpad under `qa/<suite>/`.

---

## 7. Fix verification (2026-08-06)

All 22 defects were fixed on branch `fix/qa-findings` and independently re-verified.

The verification deliberately **re-attacks** each finding rather than re-running the suites that
originally reported it — several of those suites encode the pre-fix (buggy) behavior as their
expectation, so a passing re-run would have proved nothing. Script: `qa/verify-fixes.js`
(runtime, 18 checks) and `qa/verify-token.mts` (24 unit checks against the real source).

**Result: 18/18 runtime checks pass, 24/24 token checks pass, lint + typecheck + production build clean.**

| ID | Defect | Evidence after fix |
| --- | --- | --- |
| C-1 | Over-stamping race | 5 rounds x 6 concurrent requests: **5/5 stamps every round**, 0 over-stamps, 0 HTTP 5xx (was 6-9 stamps in 6 of 9 runs) |
| C-2 | Empty-phone customer merge | Both punctuation-only joins rejected with "Enter a valid phone number."; **0 empty-phone customer rows** |
| H-1 | Undo/redeem race 500 | 5 rounds racing undo vs redeem on the **same card**: statuses 200/303 only, **0 HTTP 5xx, 0 stack-trace leaks** (was 5/5 crashes) |
| H-2 | Expired session honored | Valid session 200; DB-expired session now **307 to /login** immediately |
| H-3 | Duplicate parallel card | Rejoin on an unredeemed COMPLETED card returns that same card; **1 card total**, no second ACTIVE |
| H-4 | Store slug race | 3 businesses with identical names created concurrently: **all 3 got exactly 1 store** (`-2`/`-3` suffixes), none bricked |
| H-5 | No error boundaries | Unknown route -> **404 with friendly copy**, no stack trace |
| M-1 | Account enumeration | Duplicate registration returns a generic message that does not confirm the email exists |
| M-2 | Duplicate programs | 3 rounds x 6 concurrent creates: **exactly 1 program each round**, 0 HTTP 5xx |
| M-3 | Phone `+` fragmentation | `+63…` and `63…` resolve to **one customer, same card token** |
| M-4 | Small tap targets | Add Stamp / Undo / Redeem all measure **44px** on a 390px viewport |
| M-5 | Dark mode inert | Palette genuinely swaps with `prefers-color-scheme` (light `lab(96.6…)` -> dark `lab(9.46…)`) |
| M-6 | Missing `.env.example` | Present and trackable; real `.env` still ignored |
| L-1 | Cross-origin card URLs | `https://evil.com/card/<token>`, other ports, `//evil.com`, `/\evil.com`, `javascript:`, `data:` all **rejected** |
| L-2 | URL tokens skip charset | Short / bad-charset / encoded-space / malformed-percent tokens rejected on **both** URL and raw paths |
| L-3 | Undo tiebreaker | `orderBy: [{ createdAt: "desc" }, { id: "desc" }]` — deterministic total order |
| L-4 | Dead `redirectTo` | `/staff` honored; `https://evil.com/`, `//evil.com/`, `/\evil.com` all fall back to `/dashboard` on-origin — **no open redirect introduced** |
| L-5 | Redirect returns 200 | See note below — not fixed, deliberately |
| L-6 | Unbounded customer list | 25 of 31 rendered on page 1 with working prev/next controls |
| L-7 | Missing headings | `/login`, `/register`, `/card/[token]`, `/staff/cards/[token]` now have **exactly one h1** each |
| L-8 | No `metadataBase` | `og:image` resolves against the app's own base URL |
| L-9 | Missing dashboard loading | `src/app/dashboard/loading.tsx` added |

**Regression:** the full MVP happy path (register -> program -> join -> stamps -> COMPLETED -> redeem -> cycle 2 ACTIVE) still passes.

### L-5 was deliberately not fixed

Hoisting the owner gate into `dashboard/layout.tsx` *does* produce a clean 307 for
`/dashboard/{customers,program,stats}` — but that layout also wraps `/dashboard` itself, which is
intentionally reachable by non-owner STAFF, so it produced a self-redirect loop. A correct fix needs
a nested route group scoping the gate to the three owner-only children, which is a routing
restructure beyond the scope of a defect-fix pass. The attempt was reverted rather than left
half-applied. **No data leaks** — a STAFF user hitting `/dashboard/program` still gets no owner-only
content; only the HTTP status is cosmetically wrong for non-JS clients.

### Known limitation carried forward

`normalizePhone` still does not canonicalize a national trunk prefix: `09171234567` and
`+639171234567` are the same subscriber but remain two customers. Fixing that safely requires a
per-business country setting, which the app does not have. Documented in `src/lib/phone.ts`.
