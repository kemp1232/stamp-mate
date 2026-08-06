# S1-auth — Results

Suite script: `qa/S1-auth/run.js` (run via `npx tsx`). Covers `src/lib/actions/auth.ts`, `src/lib/validations/auth.ts`, `src/lib/auth.ts`, `src/app/login`, `src/app/register` against the live app at `http://localhost:3100` and the local Supabase Postgres DB.

**Layer note:** `registerOwner`/`loginWithPassword` are `"use server"` actions that call `auth.api.signUpEmail`/`signInEmail`, which need a real Next.js request scope (`next/headers`) — they cannot be imported and called directly from a plain script. Per the briefing, pure validation logic (`registerSchema`/`loginSchema` in `src/lib/validations/auth.ts`) was exercised by importing the real schema module directly via `tsx` (this is the exact code the actions run — same zod object, same messages). Everything else (registration, login, logout, duplicate email, case sensitivity, redirectTo, password spacing, cookie cache) was driven end-to-end through the real HTTP API and/or a real Chromium browser via Playwright, against the live dev server and DB.

Result: **19/19 PASS**.

| ID | Title | Priority | Status | Evidence | Notes |
|----|-------|----------|--------|----------|-------|
| S1-001 | Register owner happy path | P0 | PASS | `page.url()` == `http://localhost:3100/dashboard`; body contains `Signed in as <email>`; `staff_membership.role` = `OWNER` for the new user/business pair | |
| S1-002 | Business+membership transaction atomicity | P1 | PASS | Replicated the exact `prisma.$transaction(async tx => { tx.business.create(...); tx.staffMembership.create(...) })` body against the real Prisma client with a deliberately-invalid `userId` FK; transaction threw, and `select id from business where name=<test biz>` returned 0 rows | Could not call `registerOwner` itself outside a Next.js request scope; this exercises the identical transaction primitive against the real DB/Prisma client. Confirms atomicity of the two-insert transaction. The plan's secondary note (a userless "orphan" Better-Auth user can linger since `signUpEmail` happens *before* the transaction) is architecturally correct per code read (`src/lib/actions/auth.ts:32-39` runs before the `$transaction` block) but not separately re-verified with a forced-failure end-to-end run. |
| S1-003 | Email format rejected | P1 | PASS | `registerSchema.safeParse` rejected all of `notanemail`, `a@`, `@b.com`, `a b@c.com`, `a@b` with message `"Enter a valid email"` | Browser-level check of these same values is blocked by the native `type="email"` `required` attribute on `/register` (see S1-source `src/app/register/page.tsx`), so this is server-schema-only, matching the plan's "node" layer. |
| S1-004 | Password below 8 chars rejected | P0 | PASS | `Pass12`(6)→`"Password must be at least 8 characters"`; `Pass123`(7)→ same; `Pass1234`(8)→ success | Exact boundary at 8 confirmed. |
| S1-005 | Whitespace-only name rejected | P1 | PASS | `"   "` → `"Your name is required"` | |
| S1-006 | Business name 2-char boundary | P1 | PASS | `"A"`→fail, `"  A  "`→fail, `"AB"`→pass (stored `"AB"`), `" AB "`→pass (stored `"AB"`, trimmed) | |
| S1-007 | Fields trimmed before storage | P2 | PASS | Registered with `"  Aroma Coffee QA  "` / `"  Alice  "` / `"  <email>  "`; DB rows stored `"Aroma Coffee QA"`, `"Alice"`, `"<email>"` — no surrounding whitespace | End-to-end via real UI submission, not just schema parse. |
| S1-008 | Duplicate email rejected **[SD-11]** | P1 | PASS (defect confirmed) | Second registration with the same email returned UI error text **`"User already exists. Use another email."`**; DB confirmed exactly 1 user row and 1 business row for that email | **Confirms SD-11**: `src/lib/actions/auth.ts:36-39` returns `err.message` from Better Auth's `APIError` verbatim, which explicitly states the account exists — this is an account-existence enumeration vector. See Defects. |
| S1-009 | Email case-sensitivity on register/login | P1 | PASS (refutes plan's ambiguity) | Registered `Owner.<x>@Test.com`; second attempt with `owner.<x>@test.com` failed with `"User already exists. Use another email."`; `select email from "user" where lower(email)=lower(...)` returned exactly **1** row; login with the all-lowercase form succeeded (→ `/dashboard`) | **Refutes** the plan's speculative "mixed-case duplicates are possible" concern — Better Auth normalizes/compares email case-insensitively at the application layer before the DB unique constraint is even reached, so no duplicate account was created and login works with either case. Documented as a positive result, not a defect. |
| S1-010 | Login happy path | P0 | PASS | `POST /api/auth/sign-in/email` → 200, `Set-Cookie` included `better-auth.session_token=...`; subsequent `GET /dashboard` with that cookie loaded successfully | |
| S1-011 | Login wrong password | P0 | PASS | Raw API: 401, no `Set-Cookie`; UI: error text exactly `"Invalid email or password."`, stayed on `/login` | |
| S1-012 | Login nonexistent user (no enumeration) | P1 | PASS | UI error text exactly `"Invalid email or password."` — byte-identical to S1-011's wrong-password message | Message-level enumeration is not present. (Timing-based enumeration was not measured — out of scope for this pass.) |
| S1-013 | Login blank password rejected pre-auth | P2 | PASS | `loginSchema.safeParse({email:"a@b.com",password:""})` → `"Password is required"` | |
| S1-014 | Login email trim + invalid format | P2 | PASS | Schema: `"  ownerA@test.com  "` → parses to trimmed `"ownerA@test.com"`; `"bad"` → `"Enter a valid email"`. End-to-end: logging in with a padded email against a real account succeeded (→ `/dashboard`) | |
| S1-015 | Logout clears session | P0 | PASS | Before logout: 1 `session` row for the user. Clicked "Log out" → subsequent `GET /dashboard` redirected to `/login?redirectTo=%2Fdashboard`. After logout: 0 `session` rows for that user | |
| S1-016 | Missing form fields (null FormData) | P2 | PASS | `registerSchema.safeParse({all: undefined})` → 4 validation issues, no throw; `loginSchema.safeParse({all: undefined})` → 2 issues, no throw | |
| S1-017 | redirectTo param not consumed after login **[SD-8]** | P1 | PASS (defect confirmed + open-redirect refuted) | Logged-out visit to `/staff/scan` → redirected to `/login?redirectTo=%2Fstaff%2Fscan` (confirmed). After logging in from that page, landed on `/dashboard`, **not** `/staff/scan`. Separately, `/login?redirectTo=https://evil.com` followed by a real login still landed on `http://localhost:3100/dashboard` | **Confirms SD-8** (dead param — deep-link-after-login is broken: `src/lib/actions/auth.ts` hardcodes `redirect("/dashboard")` and never reads `redirectTo`). **Refutes** any open-redirect risk — the param is fully ignored server-side, so an attacker-controlled `redirectTo=https://evil.com` has no effect. This is the "positive security note" the plan asked to confirm. |
| S1-018 | Password with leading/trailing spaces not trimmed | P2 | PASS | Registered with password `"  Password123  "` → success. Login with the exact spaced password → `/dashboard` (success). Login with the trimmed `"Password123"` → stayed on `/login` with `"Invalid email or password."` | Confirms `passwordSchema` has no `.trim()`; spaces are part of the credential. |
| S1-019 | Session cookie cache TTL (5 min) | P2 | PASS | Decoded the `better-auth.session_data` cache cookie set at sign-in: `expiresAt − session.createdAt` = exactly **300 000 ms (300s)**, matching `session.cookieCache.maxAge = 300` in `src/lib/auth.ts`. Real DB `session.expiresAt` is ~7 days out. Dashboard loaded immediately after login with the cached cookie | Verified by decoding the actual signed cookie payload written by Better Auth rather than a 5-minute real-time wait (impractical for this pass). See S2-005 for a security-relevant consequence of this cache. |

## Defects

### Defect 1 — Duplicate-registration error message leaks account existence
- **Severity:** Medium
- **Test case ID(s):** S1-008 (also observed in S1-009)
- **File:line:** `src/lib/actions/auth.ts:36-39`
  ```ts
  } catch (err) {
    if (err instanceof APIError) {
      return { error: err.message };
    }
  ```
- **Repro:** Register `POST /register` with `email=X`. Register again with the same `X`. Observed error text: `"User already exists. Use another email."`
- **Observed vs Expected:** Observed: the raw Better Auth `APIError.message` is returned verbatim, explicitly confirming the account exists. Expected (per plan, SD-11): either a generic message that doesn't confirm existence, or an explicit accepted decision to allow registration to reveal existence.
- **Suggested fix:** Catch the specific "already exists" `APIError` and return a generic message (e.g. "Could not create account. If you already have one, try logging in."), or intentionally document/accept the current behavior as a product decision.

### Defect 2 — `redirectTo` query param is set but never consumed (deep link after login broken)
- **Severity:** Low
- **Test case ID(s):** S1-017
- **File:line:** `src/proxy.ts:8` (sets `redirectTo`), `src/lib/actions/auth.ts:73` (`redirect("/dashboard")` hardcoded, never reads it)
- **Repro:** While logged out, visit `/staff/scan`. Redirected to `/login?redirectTo=%2Fstaff%2Fscan`. Log in. Land on `/dashboard`, not `/staff/scan`.
- **Observed vs Expected:** Observed: `redirectTo` is dead — always lands on `/dashboard`. Expected: either consume it (with an allowlist to avoid open redirect) or stop emitting it.
- **Positive note:** No open-redirect vulnerability exists today, precisely *because* the param is ignored — confirmed with `redirectTo=https://evil.com`, which had zero effect.
- **Suggested fix:** In `loginWithPassword`, read `redirectTo` from the form (pass it through as a hidden field from the login page, which already receives it via `searchParams`), validate it against an allowlist of internal paths (must start with `/` and not `//`), and `redirect()` there instead of the hardcoded `/dashboard`.

### Defect 3 — Duplicate-registration/case-sensitivity: no defect (informational)
- **Severity:** N/A (refuted suspicion)
- **Test case ID(s):** S1-009
- The test plan flagged this as an area of ambiguity given `@@unique([email])` is case-sensitive at the DB level. Execution shows Better Auth normalizes/compares email case-insensitively before ever reaching the DB unique constraint, so mixed-case duplicate accounts are **not** currently possible. No action needed; documenting for the record.
