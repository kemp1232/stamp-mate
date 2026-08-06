# StampMate — Exhaustive End-to-End QA Test Plan

Target: `/Users/raymundrafael/Desktop/repos/firstmate/stamp-mate`
Scope: full MVP flow (owner register → create program → join QR → customer card → staff scan → stamp/undo → complete → redeem → new cycle), plus authz, isolation, boundaries, concurrency, security, data integrity, UI/a11y, and build health.
Date: 2026-08-06

## How to read this document

Each case lists **ID**, **Title**, **Priority** (P0 blocker / P1 major / P2 minor), **Type**, **Preconditions**, **Steps** (with concrete values), **Expected result**, and **How to verify** (layer: `browser`, `HTTP`, `node` = direct function call in a `tsx`/`ts` script via `tsx`/`ts-node`, `psql` = SQL against the Supabase/Postgres DB).

Cases flagged **[SUSPECTED DEFECT]** describe what the current code does vs. what it should do.

### Standing test fixtures (referenced throughout)

- **Business A** — owner `ownerA@test.com` / `Password123`, business name "Aroma Coffee". First program creation lazily creates Store A with slug `aroma-coffee`.
- **Business B** — owner `ownerB@test.com` / `Password123`, business name "Bean Bar". Store B slug `bean-bar`.
- **Staff A2** — a second user with a `STAFF` (non-OWNER) `StaffMembership` in Business A (insert directly via `psql` since there is no staff-invite UI in the MVP).
- **Program A** — name "Coffee Club", `requiredStamps = 5`, reward "Free latte", status ACTIVE, on Store A.
- **Customer C1** — joins Store A as "Juan Dela Cruz" / `0917 123 4567`.

Direct-call harness note: server actions are `"use server"` functions taking `(prevState, FormData)`. For `node`-layer verification, build a `FormData`, call the exported action, and inspect the returned `{error|success}` state (a thrown `NEXT_REDIRECT` / `redirect()` is the success path for `join`/`auth`/`redeem`).

---

## Suspected defects (summary, detailed in-suite)

| Ref | Suite | Title |
|-----|-------|-------|
| SD-1 | S7 | Over-stamping past `requiredStamps` under concurrent Add Stamp (no row lock; `count`-then-`insert` race) |
| SD-2 | S8/S9 | Undo does not re-validate card status inside its transaction → concurrent redeem+undo flips a REDEEMED card back to ACTIVE (P2002 500 / stamp deleted from redeemed card) |
| SD-3 | S6/S12 | `extractCardToken` accepts a card path from **any origin** (e.g. `https://evil.com/card/TOKEN`) |
| SD-4 | S5 | All-punctuation phone (e.g. `((()))-`) passes regex but `normalizePhone` → empty string; distinct people collide onto one shared customer/card |
| SD-5 | S5 | `+639171234567` and `639171234567` normalize to different keys → same PH subscriber gets two customers/cards |
| SD-6 | S3 | Concurrent `createLoyaltyProgram` creates two programs for one store (no DB uniqueness on `storeId`) |
| SD-7 | S4/S3 | `getOrCreateDefaultStore` `findFirst`-then-`create` race → slug unique violation (P2002) surfaces as unhandled 500 |
| SD-8 | S1/S2 | `redirectTo` query param is set by middleware but never consumed by login/register actions (dead param; deep-link-after-login broken) |
| SD-9 | S5 | Rejoin while a COMPLETED (unredeemed) card exists mints a second concurrent ACTIVE card, bypassing the redemption cycle |
| SD-10 | S6 | URL-derived tokens skip the `{8,}` length/charset check that raw tokens must pass (inconsistent validation) |
| SD-11 | S1 | Register with duplicate email returns the raw Better Auth message → account-existence enumeration |
| SD-12 | S8 | Undo tie-break is nondeterministic when two stamps share the same millisecond `createdAt` |
| SD-13 | S11 | No `error.tsx` / `not-found.tsx` / `global-error.tsx` boundaries anywhere → uncontrolled action throws render the raw Next error page |

---

# S1-auth

Covers `src/lib/actions/auth.ts`, `src/lib/validations/auth.ts`, `src/lib/auth.ts`, `src/app/login`, `src/app/register`.

### S1-001 — Register owner happy path
- **Priority:** P0 · **Type:** functional
- **Preconditions:** No user with `ownerA@test.com`.
- **Steps:** 1. Go to `/register`. 2. businessName `Aroma Coffee`, name `Alice Owner`, email `ownerA@test.com`, password `Password123`. 3. Submit.
- **Expected:** User created; a `business` row "Aroma Coffee" and a `staff_membership` with `role=OWNER` linking user↔business created in one transaction; redirect to `/dashboard`; dashboard shows "Signed in as ownerA@test.com".
- **Verify:** browser + `psql`: `select role from staff_membership sm join "user" u on u.id=sm."userId" where u.email='ownerA@test.com';` → `OWNER`.

### S1-002 — Business+membership transaction atomicity
- **Priority:** P1 · **Type:** integration
- **Preconditions:** Signup succeeds but force the membership insert to fail (e.g. temporarily drop `staff_membership` FK or simulate in a `node` harness).
- **Steps:** 1. Trigger `registerOwner` where `tx.staffMembership.create` throws.
- **Expected:** `$transaction` rolls back → no orphan `business` row. (Note: the Better Auth `signUpEmail` user is created *before* the transaction, so a user with **no** business can remain — record this as a data-integrity observation.)
- **Verify:** `psql` count of `business` before/after; confirm no new business; confirm a userless-of-business user may linger.

### S1-003 — Email format rejected
- **Priority:** P1 · **Type:** boundary/negative
- **Steps:** Register with email `notanemail`, `a@`, `@b.com`, `a b@c.com`, `a@b`.
- **Expected:** Action returns `{error:"Enter a valid email"}`; no user created. (HTML `type=email` also blocks in-browser; the server must reject independently.)
- **Verify:** `node` call of `registerOwner` per value → error string; `psql` user count unchanged.

### S1-004 — Password below 8 chars rejected
- **Priority:** P0 · **Type:** boundary
- **Steps:** password `Pass12` (6), `Pass123` (7), then `Pass1234` (8).
- **Expected:** 6 and 7 → `{error:"Password must be at least 8 characters"}`; 8 → success.
- **Verify:** `node` per value; boundary at exactly 8 passes.

### S1-005 — Whitespace-only name rejected
- **Priority:** P1 · **Type:** boundary/negative
- **Steps:** name = `"   "` (3 spaces), valid other fields.
- **Expected:** `.trim().min(1)` → `{error:"Your name is required"}`.
- **Verify:** `node`.

### S1-006 — Business name 2-char boundary
- **Priority:** P1 · **Type:** boundary
- **Steps:** businessName `A` (1), `"  A  "` (trims to 1), `AB` (2), `" AB "` (trims to 2).
- **Expected:** 1-char and trims-to-1 → `{error:"Business name is required"}`; 2-char and trims-to-2 → pass.
- **Verify:** `node`; confirm stored business name is the trimmed value.

### S1-007 — Fields trimmed before storage
- **Priority:** P2 · **Type:** functional
- **Steps:** businessName `"  Aroma Coffee  "`, name `"  Alice  "`, email `"  ownerA@test.com  "`.
- **Expected:** Stored business.name = `Aroma Coffee`, user.name = `Alice`, email = `ownerA@test.com` (no surrounding spaces).
- **Verify:** `psql`.

### S1-008 — Duplicate email rejected **[SUSPECTED DEFECT SD-11]**
- **Priority:** P1 · **Type:** negative/security
- **Preconditions:** `ownerA@test.com` exists.
- **Steps:** Register again with `ownerA@test.com`.
- **Expected (current):** `signUpEmail` throws `APIError`; action returns `err.message` verbatim (e.g. "User already exists"), leaking that the account exists.
- **Should:** Return a generic message that does not confirm account existence, OR accept that register inherently reveals existence (document decision). No second user/business created.
- **Verify:** `node`/browser for message text; `psql` confirms only one user + one business.

### S1-009 — Email case-sensitivity on register/login
- **Priority:** P1 · **Type:** boundary/security
- **Steps:** Register `Owner.A@Test.com`. Then attempt second register `owner.a@test.com`. Then log in with the opposite case.
- **Expected:** Determine Better Auth normalization. If it lowercases, second register is a duplicate and login with either case works; if not, they are two accounts. Document the actual behavior; the `@@unique([email])` is case-sensitive at the DB level, so mixed-case duplicates are possible unless Better Auth normalizes.
- **Verify:** `psql select email from "user";` after both registrations; browser login both cases.

### S1-010 — Login happy path
- **Priority:** P0 · **Type:** functional
- **Steps:** `/login` with `ownerA@test.com` / `Password123`.
- **Expected:** Session cookie set; redirect `/dashboard`.
- **Verify:** browser; `HTTP` inspect `Set-Cookie`.

### S1-011 — Login wrong password
- **Priority:** P0 · **Type:** negative/security
- **Steps:** `ownerA@test.com` / `WrongPass9`.
- **Expected:** `{error:"Invalid email or password."}`; no session cookie; stays on `/login`.
- **Verify:** browser/`node`.

### S1-012 — Login nonexistent user (no enumeration)
- **Priority:** P1 · **Type:** security
- **Steps:** `ghost@test.com` / `Password123`.
- **Expected:** Same `{error:"Invalid email or password."}` as wrong-password — identical message, no timing/message distinction that reveals existence.
- **Verify:** `node`; compare message with S1-011 (must be byte-identical).

### S1-013 — Login blank password rejected pre-auth
- **Priority:** P2 · **Type:** boundary
- **Steps:** email valid, password `""`.
- **Expected:** `loginSchema` `min(1)` → `{error:"Password is required"}` before any auth call.
- **Verify:** `node`.

### S1-014 — Login email trim + invalid format
- **Priority:** P2 · **Type:** boundary
- **Steps:** email `"  ownerA@test.com  "` (should pass after trim); email `"bad"` → error.
- **Expected:** Trimmed email authenticates; invalid → `{error:"Enter a valid email"}`.
- **Verify:** `node`.

### S1-015 — Logout clears session
- **Priority:** P0 · **Type:** functional
- **Preconditions:** Logged in.
- **Steps:** Click "Log out" (LogoutButton → `authClient.signOut()`), then navigate to `/dashboard`.
- **Expected:** Redirected to `/login`; session cookie cleared; `session` row deleted/expired.
- **Verify:** browser; `psql select count(*) from session where "userId"=...`.

### S1-016 — Missing form fields (null FormData)
- **Priority:** P2 · **Type:** negative
- **Steps:** POST register/login action with `FormData` omitting `email`/`password` entirely (`formData.get` → null).
- **Expected:** Zod safeParse fails gracefully → error string, no crash (null coerced by zod string as invalid_type).
- **Verify:** `node`.

### S1-017 — redirectTo param is not consumed after login **[SUSPECTED DEFECT SD-8]**
- **Priority:** P1 · **Type:** functional/security
- **Steps:** While logged out, visit `/staff/scan`. Middleware redirects to `/login?redirectTo=%2Fstaff%2Fscan`. Log in.
- **Expected (current):** `loginWithPassword` hardcodes `redirect("/dashboard")` and never reads `redirectTo` → user lands on `/dashboard`, not `/staff/scan`. The param is dead.
- **Should:** Either consume `redirectTo` (with an allowlist of internal paths to avoid open redirect) or stop emitting it. Confirm there is **no** open redirect (because it is ignored) — this is the positive security note.
- **Verify:** browser; also craft `/login?redirectTo=https://evil.com` and confirm login still goes to `/dashboard` (no external redirect).

### S1-018 — Password with leading/trailing spaces not trimmed
- **Priority:** P2 · **Type:** boundary
- **Steps:** Register with password `"  Password123  "` then log in with `"Password123"` (no spaces) and with the spaced version.
- **Expected:** `passwordSchema` has no `.trim()`, so spaces are significant — login must match exactly what was registered. Document that spaces are part of the password.
- **Verify:** `node`/browser.

### S1-019 — Session cookie cache TTL (5 min)
- **Priority:** P2 · **Type:** functional
- **Steps:** Log in; inspect cookie cache behavior (`session.cookieCache.maxAge = 300`).
- **Expected:** Cached session honored up to 5 min; server still validates real session on protected pages.
- **Verify:** browser over time; `HTTP` cookie inspection.

---

# S2-authz-isolation

Covers `src/proxy.ts`, `src/lib/authorization.ts`, dashboard/staff layouts, cross-business scoping.

### S2-001 — Unauthenticated `/dashboard` blocked
- **Priority:** P0 · **Type:** security
- **Steps:** Logged out, GET `/dashboard`.
- **Expected:** Middleware (no session cookie) → 307 redirect to `/login?redirectTo=%2Fdashboard`.
- **Verify:** `HTTP` (no cookie) → Location header.

### S2-002 — Unauthenticated coverage of every protected route
- **Priority:** P0 · **Type:** security
- **Steps:** Logged out, GET each: `/dashboard`, `/dashboard/program`, `/dashboard/customers`, `/dashboard/stats`, `/staff`, `/staff/scan`, `/staff/cards/anytoken`.
- **Expected:** All redirect to `/login?redirectTo=<path>` (matcher `["/dashboard/:path*","/staff/:path*"]`).
- **Verify:** `HTTP` each path.

### S2-003 — Public routes remain open when logged out
- **Priority:** P1 · **Type:** functional
- **Steps:** Logged out, GET `/`, `/login`, `/register`, `/join/aroma-coffee`, `/card/<validtoken>`.
- **Expected:** All render without redirect (not in matcher).
- **Verify:** `HTTP`.

### S2-004 — Forged/invalid session cookie still blocked server-side
- **Priority:** P0 · **Type:** security
- **Preconditions:** None.
- **Steps:** Send request to `/dashboard/program` with a fabricated `better-auth.session_token` cookie value that passes `getSessionCookie` presence but is not a real session.
- **Expected:** Middleware lets it through (presence-only check), but `requireOwnedBusiness()` → `getSession` returns null → `requireUser` redirects `/login`. No page content leaks.
- **Verify:** `HTTP` with crafted cookie → redirect to `/login`.

### S2-005 — Expired session cookie
- **Priority:** P1 · **Type:** security
- **Steps:** Log in; in `psql` set the `session.expiresAt` to a past timestamp; request `/dashboard`.
- **Expected:** Server session invalid → redirect `/login`.
- **Verify:** `psql` mutate + `HTTP`.

### S2-006 — STAFF (non-owner) hitting owner-only `/dashboard/program`
- **Priority:** P0 · **Type:** security
- **Preconditions:** Staff A2 logged in (STAFF role in Business A).
- **Steps:** GET `/dashboard/program`.
- **Expected:** `requireOwnedBusiness()` finds no OWNER membership → redirect `/dashboard`.
- **Verify:** browser/`HTTP`.

### S2-007 — STAFF hitting `/dashboard/stats` and `/dashboard/customers`
- **Priority:** P0 · **Type:** security
- **Steps:** As Staff A2, GET `/dashboard/stats`, `/dashboard/customers`.
- **Expected:** Both `requireOwnedBusiness()` → redirect `/dashboard`.
- **Verify:** `HTTP`.

### S2-008 — STAFF sees `/dashboard` but with no owner stats
- **Priority:** P1 · **Type:** functional
- **Steps:** As Staff A2, GET `/dashboard`.
- **Expected:** Page renders (any logged-in user allowed); stats block hidden (no OWNER membership → `stats=null`); "Manage program" card hidden; staff tools card shown.
- **Verify:** browser assertion: no StatCards; "Your businesses" lists STAFF role.

### S2-009 — Cross-business: Staff A acts on Business B's card (add stamp)
- **Priority:** P0 · **Type:** security/isolation
- **Preconditions:** Customer C_B exists in Business B with card token `TOKEN_B`. Owner A logged in.
- **Steps:** Submit `addStamp` with `cardToken=TOKEN_B`.
- **Expected:** `getStaffCardByToken` resolves card→businessId=B; `requireBusinessAccess(B)` finds no membership for Owner A → redirect `/dashboard`; no stamp inserted.
- **Verify:** `node` action call (expect NEXT_REDIRECT) + `psql` stamp count on TOKEN_B unchanged.

### S2-010 — Cross-business: view `/staff/cards/TOKEN_B` as Owner A
- **Priority:** P0 · **Type:** security/isolation
- **Steps:** As Owner A, GET `/staff/cards/TOKEN_B`.
- **Expected:** Page loads card, then `requireBusinessAccess(B)` redirects `/dashboard` before rendering customer data. No name/stamps of Business B shown.
- **Verify:** browser: confirm redirect, no B customer data in HTML.

### S2-011 — Cross-business redeem rejected
- **Priority:** P0 · **Type:** security/isolation
- **Steps:** As Owner A, `redeemReward` with a COMPLETED `TOKEN_B`.
- **Expected:** Redirect `/dashboard`; no `reward_redemption` row; no new card.
- **Verify:** `node` + `psql`.

### S2-012 — Tampered `businessId` in createLoyaltyProgram payload
- **Priority:** P0 · **Type:** security
- **Preconditions:** Owner A logged in; Business B id known.
- **Steps:** POST `createLoyaltyProgram` FormData with `businessId=<Business B id>`.
- **Expected:** `requireOwner(B)` → no membership → redirect `/dashboard`; no program written to Business B's store.
- **Verify:** `node` (NEXT_REDIRECT) + `psql`.

### S2-013 — Tampered `programId` in updateLoyaltyProgram (foreign program)
- **Priority:** P0 · **Type:** security
- **Preconditions:** Owner A logged in; Program B id known.
- **Steps:** POST `updateLoyaltyProgram` with `businessId=<A>` (valid) but `programId=<Program B id>`.
- **Expected:** `updateMany({where:{id:programB, storeId: storeA}})` matches 0 rows → `{error:"Program not found."}`; Program B unchanged.
- **Verify:** `node` + `psql` (Program B rewardText unchanged).

### S2-014 — Tampered `businessId` empty/garbage
- **Priority:** P1 · **Type:** negative
- **Steps:** `createLoyaltyProgram` with `businessId=""`, then `businessId="not-a-uuid"`.
- **Expected:** Empty → `{error:"Missing business."}`; garbage → `requireOwner` no membership → redirect `/dashboard`.
- **Verify:** `node`.

### S2-015 — Middleware matcher excludes API/auth
- **Priority:** P2 · **Type:** functional
- **Steps:** GET `/api/auth/*`, `/`, `/join/x`, `/card/x` logged out.
- **Expected:** Not redirected by middleware (matcher only `/dashboard`,`/staff`).
- **Verify:** `HTTP`.

### S2-016 — Owner of A cannot enumerate B via dashboard queries
- **Priority:** P0 · **Type:** isolation
- **Steps:** As Owner A, load `/dashboard/customers`, `/dashboard/stats`, `/dashboard`.
- **Expected:** All counts/lists scoped by `businessId` from Owner A's own membership; zero Business B rows appear.
- **Verify:** Seed B with customers/stamps; browser assert none of B's names appear; `psql` cross-check counts equal A-only.

### S2-017 — User with membership in two businesses
- **Priority:** P2 · **Type:** functional/isolation
- **Preconditions:** One user is OWNER of A and STAFF of B.
- **Steps:** Load `/dashboard`; `requireOwnedBusiness` picks first OWNER membership.
- **Expected:** Stats scoped to the OWNER business (A). Document that `.find(role===OWNER)` is order-dependent if user owns multiple businesses (not possible in MVP but note).
- **Verify:** browser + reason about `getStaffMembershipsForUser` ordering.

### S2-018 — Direct action call without any session
- **Priority:** P0 · **Type:** security
- **Steps:** Invoke `addStamp`/`redeemReward`/`createLoyaltyProgram` with no auth cookie (server action POST).
- **Expected:** `requireUser`/`requireBusinessAccess` → redirect `/login` or `/dashboard`; no mutation.
- **Verify:** `HTTP` server-action POST without cookie.

---

# S3-program-crud

Covers `src/lib/actions/loyalty-program.ts`, `src/lib/validations/loyalty-program.ts`, `src/lib/store.ts`, program form.

### S3-001 — Create program happy path
- **Priority:** P0 · **Type:** functional
- **Preconditions:** Owner A, no program yet.
- **Steps:** `/dashboard/program`: name `Coffee Club`, requiredStamps `5`, reward `Free latte`, status `ACTIVE`. Submit.
- **Expected:** Store A lazily created (slug `aroma-coffee`); program row created; `{success:true}`; "Saved." shown; join URL `.../join/aroma-coffee` displayed.
- **Verify:** browser + `psql select * from loyalty_program`.

### S3-002 — Create when one already exists
- **Priority:** P0 · **Type:** negative
- **Preconditions:** Program A exists.
- **Steps:** Submit createLoyaltyProgram again (form actually calls update when program present; force the create path by POSTing create action directly).
- **Expected:** `findFirst` finds existing → `{error:"This store already has a loyalty program. Edit it instead."}`; no second program.
- **Verify:** `node` create action + `psql` count=1.

### S3-003 — requiredStamps boundary: 0
- **Priority:** P0 · **Type:** boundary
- **Steps:** requiredStamps `0`.
- **Expected:** `{error:"Stamps required must be at least 1"}`.
- **Verify:** `node`.

### S3-004 — requiredStamps boundary: 1
- **Priority:** P1 · **Type:** boundary
- **Steps:** requiredStamps `1`.
- **Expected:** Accepted. Downstream: first stamp immediately COMPLETES the card.
- **Verify:** `node` + follow-through stamp test.

### S3-005 — requiredStamps boundary: 100 and 101
- **Priority:** P0 · **Type:** boundary
- **Steps:** `100` then `101`.
- **Expected:** 100 accepted; 101 → `{error:"Stamps required must be 100 or fewer"}`.
- **Verify:** `node`.

### S3-006 — requiredStamps negative
- **Priority:** P1 · **Type:** boundary/negative
- **Steps:** `-5`.
- **Expected:** `{error:"Stamps required must be at least 1"}`.
- **Verify:** `node`.

### S3-007 — requiredStamps non-integer float
- **Priority:** P1 · **Type:** boundary
- **Steps:** `5.5`.
- **Expected:** `.int()` → `{error:"Stamps required must be a whole number"}`.
- **Verify:** `node`.

### S3-008 — requiredStamps non-numeric string
- **Priority:** P1 · **Type:** negative
- **Steps:** `abc`.
- **Expected:** `z.coerce.number()` → NaN → int check fails → whole-number error.
- **Verify:** `node`.

### S3-009 — requiredStamps empty string
- **Priority:** P1 · **Type:** boundary
- **Steps:** `""`.
- **Expected:** coerce("") = 0 → `{error:"Stamps required must be at least 1"}`.
- **Verify:** `node`.

### S3-010 — requiredStamps huge number
- **Priority:** P2 · **Type:** boundary
- **Steps:** `999999999999`.
- **Expected:** max(100) → error.
- **Verify:** `node`.

### S3-011 — status enum tampering
- **Priority:** P1 · **Type:** security/negative
- **Steps:** POST create with `status=DELETED` / `status=active` (lowercase) / `status=""`.
- **Expected:** `z.enum(["ACTIVE","INACTIVE"])` rejects all → `{error:...}`; no row written.
- **Verify:** `node`.

### S3-012 — name/rewardText 2-char boundary + trim
- **Priority:** P1 · **Type:** boundary
- **Steps:** name `A` (→error), `" A "` (trims to 1 →error), `AB` (ok); same for rewardText.
- **Expected:** min(2) after trim enforced with messages "Program name is required" / "Reward text is required".
- **Verify:** `node`.

### S3-013 — Unicode/emoji in name and reward
- **Priority:** P2 · **Type:** functional
- **Steps:** name `☕ Kape Club ☕`, reward `Libreng kape 🎁`.
- **Expected:** Stored and rendered verbatim (React escapes; no corruption) on program form, join page, card.
- **Verify:** `psql` + browser render of `/join/aroma-coffee`.

### S3-014 — XSS payload in name/reward is not executed
- **Priority:** P0 · **Type:** security
- **Steps:** name `<script>alert(1)</script>`, reward `<img src=x onerror=alert(1)>`.
- **Expected:** Stored literally; rendered as inert text on `/join/[slug]` and `/card/[token]` (no script execution, no HTML injection — no `dangerouslySetInnerHTML` in codebase).
- **Verify:** browser: inspect DOM, confirm escaped entities; no alert.

### S3-015 — Update program happy path
- **Priority:** P0 · **Type:** functional
- **Preconditions:** Program A exists.
- **Steps:** Change reward to `Free cappuccino`, requiredStamps `6`, submit.
- **Expected:** `updateMany` count=1 → `{success:true}`; card/join reflect new values.
- **Verify:** `psql` + browser.

### S3-016 — Update missing programId/businessId
- **Priority:** P1 · **Type:** negative
- **Steps:** POST update with programId omitted.
- **Expected:** `{error:"Missing program."}`.
- **Verify:** `node`.

### S3-017 — Concurrent create race **[SUSPECTED DEFECT SD-6]**
- **Priority:** P1 · **Type:** concurrency
- **Preconditions:** Owner A, no program yet.
- **Steps:** Fire two `createLoyaltyProgram` calls simultaneously (Promise.all in `node`).
- **Expected (current):** Both pass the `findFirst` existence check before either inserts → **two** `loyalty_program` rows for one store (no DB unique constraint on `storeId`). Join then arbitrarily picks `take:1`.
- **Should:** A unique constraint or upsert should guarantee at most one program per store.
- **Verify:** `psql select count(*) from loyalty_program where "storeId"=<A>` → observe 2.

### S3-018 — INACTIVE program effect on join flow
- **Priority:** P0 · **Type:** functional
- **Preconditions:** Program A status = INACTIVE.
- **Steps:** Visit `/join/aroma-coffee`; also POST `joinLoyaltyProgram`.
- **Expected:** Join page shows "isn't accepting new members right now"; action returns `{error:"This store isn't accepting new members right now."}`; no customer/card created.
- **Verify:** browser + `node` + `psql`.

### S3-019 — INACTIVE program: existing cards still usable
- **Priority:** P1 · **Type:** functional
- **Preconditions:** Customer C1 has ACTIVE card; program later set INACTIVE.
- **Steps:** Staff opens `/staff/cards/<C1 token>`, adds a stamp.
- **Expected:** Stamping still works (stamp/redeem paths key off card, not program status). Document this intended behavior.
- **Verify:** `node` addStamp + `psql`.

### S3-020 — Program form client min/max does not replace server validation
- **Priority:** P1 · **Type:** security
- **Steps:** Bypass client `min=1 max=100` by POSTing requiredStamps `250` directly.
- **Expected:** Server zod still rejects (max 100).
- **Verify:** `node`.

---

# S4-store-slug

Covers `slugify` / `generateUniqueSlug` / `getOrCreateDefaultStore` in `src/lib/store.ts`.

### S4-001 — Normal name slugifies
- **Priority:** P1 · **Type:** functional
- **Steps:** Business "Aroma Coffee" first program creation.
- **Expected:** slug `aroma-coffee`.
- **Verify:** `psql`.

### S4-002 — Name slugifies to empty → "store" fallback
- **Priority:** P1 · **Type:** boundary
- **Steps:** Business names `!!!`, `→→→`, `   ` (spaces), `___`.
- **Expected:** Each `slugify` → empty after strip → fallback `store`; first one gets `store`, next `store-2`, etc.
- **Verify:** `node` call `getOrCreateDefaultStore` for such businesses; `psql`.

### S4-003 — Unicode-only name
- **Priority:** P2 · **Type:** boundary
- **Steps:** Business `日本語カフェ`.
- **Expected:** All chars stripped (not a-z0-9) → `store` fallback.
- **Verify:** `node` + `psql`.

### S4-004 — Slug collision suffixing
- **Priority:** P1 · **Type:** functional
- **Steps:** Create three businesses all named "Coffee".
- **Expected:** slugs `coffee`, `coffee-2`, `coffee-3` (suffix starts at 2).
- **Verify:** `psql`.

### S4-005 — Very long name
- **Priority:** P2 · **Type:** boundary
- **Steps:** 300-char business name.
- **Expected:** slugify produces a long hyphenated slug; DB `slug` TEXT column accepts it (no length cap in schema). Note if it should be truncated.
- **Verify:** `psql` length check.

### S4-006 — Mixed case & punctuation
- **Priority:** P2 · **Type:** functional
- **Steps:** `  Bob's Café & Bar!!  `.
- **Expected:** slug `bob-s-caf-bar` (lowercased, non-alnum runs → single `-`, trimmed ends). Verify exact output.
- **Verify:** `node`.

### S4-007 — Slug uniqueness under concurrency **[SUSPECTED DEFECT SD-7]**
- **Priority:** P1 · **Type:** concurrency
- **Preconditions:** Business A with no store yet (or two same-named businesses).
- **Steps:** Fire two `getOrCreateDefaultStore(A)` (or two same-slug creations) concurrently.
- **Expected (current):** Both `findFirst` see no store → both `generateUniqueSlug` compute same slug → both `create` → second violates `store.slug` unique (P2002) → **unhandled throw / 500** (no retry/upsert).
- **Should:** Catch P2002 and re-fetch, or use an upsert / advisory lock.
- **Verify:** `node` Promise.all; observe one rejection.

### S4-008 — Store created lazily only once
- **Priority:** P1 · **Type:** functional
- **Steps:** Call `getOrCreateDefaultStore(A)` twice sequentially.
- **Expected:** Second returns the existing store (no new row, slug unchanged).
- **Verify:** `psql` store count = 1.

---

# S5-join-flow

Covers `src/lib/actions/join.ts`, `src/lib/phone.ts`, `src/lib/validations/join.ts`, join page.

### S5-001 — Join happy path
- **Priority:** P0 · **Type:** functional
- **Preconditions:** Program A ACTIVE.
- **Steps:** `/join/aroma-coffee`: name `Juan Dela Cruz`, phone `0917 123 4567`. Submit.
- **Expected:** Customer created (phone stored `09171234567`); ACTIVE card created with random token; redirect `/card/<token>`; card page renders.
- **Verify:** browser + `psql`.

### S5-002 — Unknown storeSlug
- **Priority:** P1 · **Type:** negative
- **Steps:** `/join/does-not-exist` page load; also POST join with `storeSlug=ghost`.
- **Expected:** Page: "Store not found". Action: `{error:"This store isn't accepting new members right now."}` (store null path). No customer created.
- **Verify:** browser + `node`.

### S5-003 — Store exists, no program
- **Priority:** P1 · **Type:** negative
- **Preconditions:** Store with zero programs.
- **Steps:** Load `/join/<slug>`; POST join.
- **Expected:** Page: "isn't accepting new members right now"; action error same; no customer.
- **Verify:** browser + `node`.

### S5-004 — Store with only INACTIVE program
- **Priority:** P0 · **Type:** negative
- **Steps:** As S3-018.
- **Expected:** Treated as no active program → join blocked.
- **Verify:** `node`.

### S5-005 — Phone normalization equivalence class (local formats)
- **Priority:** P0 · **Type:** boundary/functional
- **Steps:** Join once with `0917 123 4567`; rejoin with `09171234567`; rejoin with `(0917) 123-4567`.
- **Expected:** All normalize to `09171234567` → the **same** customer (upsert by `businessId_phone`) → **same** ACTIVE card returned each time.
- **Verify:** `psql`: exactly one customer, one active card; token identical across the three joins.

### S5-006 — International vs local prefix treated differently **[SUSPECTED DEFECT SD-5]**
- **Priority:** P1 · **Type:** boundary
- **Steps:** Join with `+639171234567`; then join with `639171234567`; then `09171234567`.
- **Expected (current):** `+639171234567` (keeps `+`), `639171234567` (no `+`), `09171234567` are three DISTINCT keys → three customers, three cards, even though they are the same PH subscriber.
- **Should:** Decide a canonical PH normalization (e.g. map `0917…`/`+63917…`/`63917…` to one). Confirm current behavior and flag as UX/data-quality defect.
- **Verify:** `psql` → 3 customer rows.

### S5-007 — Phone regex min length (7 chars)
- **Priority:** P1 · **Type:** boundary
- **Steps:** phone `123456` (6) → error; `1234567` (7) → pass; empty → error.
- **Expected:** 6 → `{error:"Enter a valid phone number"}`; 7 accepted (normalizes to `1234567`).
- **Verify:** `node`.

### S5-008 — Phone regex max length (20 chars)
- **Priority:** P1 · **Type:** boundary
- **Steps:** 20-char `+12345678901234567` (pad to 20 with allowed chars) → pass; 21-char → error.
- **Verify:** `node`.

### S5-009 — Letters in phone rejected
- **Priority:** P1 · **Type:** negative
- **Steps:** phone `0917ABC4567`.
- **Expected:** regex `^[0-9+()\-.\s]+$` fails → `{error:"Enter a valid phone number"}`.
- **Verify:** `node`.

### S5-010 — All-punctuation phone normalizes to empty **[SUSPECTED DEFECT SD-4]**
- **Priority:** P0 · **Type:** security/boundary
- **Steps:** Join Business A with name `Alice`, phone `(((-)))` (7 chars, passes regex). Then join Business A with name `Bob`, phone `.-.-.-.` (7 chars, passes regex).
- **Expected (current):** `normalizePhone` strips non-digits → `""` for both. Upsert key `businessId_phone = (A, "")`. Alice creates customer with phone `""`; Bob's join **upserts the same row** (updates name to "Bob") and returns Alice's/Bob's **shared** ACTIVE card. Two different people collide onto one loyalty card.
- **Should:** Reject a phone that normalizes to empty (or fewer than N digits) before upsert.
- **Verify:** `psql`: single customer with phone `''`, name flipped to "Bob"; single shared card token.

### S5-011 — Leading-plus-only normalizes to "+"
- **Priority:** P2 · **Type:** boundary
- **Steps:** phone `+()-.  ` (starts with `+`, 7 chars incl spaces).
- **Expected:** normalize → `"+"`. Document that this stores `+` as the phone — another empty-ish collision key distinct from `""`.
- **Verify:** `node` + `psql`.

### S5-012 — Name length 100 vs 101
- **Priority:** P1 · **Type:** boundary
- **Steps:** name 100 chars → pass; 101 chars → `{error:"Name is too long"}`.
- **Verify:** `node`.

### S5-013 — Name whitespace-only / trim
- **Priority:** P1 · **Type:** boundary
- **Steps:** name `"   "` → error "Name is required"; name `"  Juan  "` → stored `Juan`.
- **Verify:** `node` + `psql`.

### S5-014 — Rejoin with existing ACTIVE card returns SAME card
- **Priority:** P0 · **Type:** functional
- **Preconditions:** C1 has ACTIVE card token T1.
- **Steps:** Rejoin `/join/aroma-coffee` with C1's phone.
- **Expected:** `findOrCreateActiveCard` finds existing ACTIVE → returns T1 (no new card). Redirect `/card/T1`.
- **Verify:** `node` returns T1; `psql` card count unchanged.

### S5-015 — Rejoin updates customer name
- **Priority:** P1 · **Type:** functional
- **Steps:** C1 (phone `09171234567`, name "Juan"); rejoin with same phone, name "Juan Dela Cruz Jr".
- **Expected:** upsert `update:{name}` → customer name updated; same card returned.
- **Verify:** `psql` name changed; token unchanged.

### S5-016 — Rejoin after COMPLETED (unredeemed) card exists **[SUSPECTED DEFECT SD-9]**
- **Priority:** P1 · **Type:** functional/boundary
- **Preconditions:** C1 has a COMPLETED card (reached requiredStamps, not yet redeemed).
- **Steps:** C1 rejoins via join QR.
- **Expected (current):** `findOrCreateActiveCard` finds no ACTIVE card (partial index only blocks ACTIVE, and COMPLETED ≠ ACTIVE) → **creates a new ACTIVE card**. C1 now holds a COMPLETED card AND a fresh ACTIVE card simultaneously, bypassing the redeem-to-start-new-cycle flow.
- **Should:** Decide policy — either return the COMPLETED card (so staff redeems it) or explicitly allow parallel cards. Flag ambiguity.
- **Verify:** `psql`: C1 has one COMPLETED + one ACTIVE card for same program; partial index permits it (different status).

### S5-017 — Rejoin after REDEEMED card
- **Priority:** P1 · **Type:** functional
- **Preconditions:** C1's last card is REDEEMED and redemption already created a new ACTIVE (cycle 2) card.
- **Steps:** C1 rejoins.
- **Expected:** Finds the cycle-2 ACTIVE card → returns it (no third card).
- **Verify:** `psql`.

### S5-018 — Concurrent double-submit join (P2002 fallback)
- **Priority:** P0 · **Type:** concurrency
- **Preconditions:** New phone, no existing customer.
- **Steps:** Fire two `joinLoyaltyProgram` with identical name+phone concurrently.
- **Expected:** One creates the ACTIVE card; the other races past `findFirst`, hits the partial unique index on insert (P2002), and the catch re-fetches the ACTIVE card → both redirect to the **same** single card token. Exactly one customer, one card.
- **Verify:** `node` Promise.all; `psql` counts = 1 each; both returned tokens equal.

### S5-019 — Same phone joins two different businesses
- **Priority:** P1 · **Type:** isolation
- **Steps:** Phone `09171234567` joins Business A and Business B.
- **Expected:** Two separate customers (unique is `businessId+phone`), two separate cards — correct multi-tenant isolation.
- **Verify:** `psql`: one customer per business.

### S5-020 — Missing storeSlug in payload
- **Priority:** P2 · **Type:** negative
- **Steps:** POST join with `storeSlug` omitted/empty.
- **Expected:** `{error:"Missing store."}`.
- **Verify:** `node`.

### S5-021 — Phone with tabs/newlines
- **Priority:** P2 · **Type:** boundary
- **Steps:** phone `"0917\t123\n4567"` (whitespace class includes `\s`).
- **Expected:** regex `\s` allows; normalizes to `09171234567`. Confirm parity with space-separated.
- **Verify:** `node`.

---

# S6-card-token-security

Covers `src/lib/card-token.ts` (`extractCardToken`, `generateCardToken`), `src/lib/loyalty-card.ts`, `/card/[token]`.

### S6-001 — Unknown token 404-style state
- **Priority:** P0 · **Type:** negative
- **Steps:** GET `/card/thisisnotarealtoken12345`.
- **Expected:** `getCustomerCardByToken` null → ErrorState "Card not found" (HTTP 200 with error UI, not a crash).
- **Verify:** browser/`HTTP`.

### S6-002 — Token unguessability
- **Priority:** P1 · **Type:** security
- **Steps:** Inspect `generateCardToken` = `randomBytes(24).toString("base64url")`.
- **Expected:** 24 bytes = 192 bits entropy, 32-char base64url; not enumerable/sequential; not derived from customer data.
- **Verify:** `node`: generate 1000 tokens, assert all 32 chars, charset `[A-Za-z0-9_-]`, no collisions.

### S6-003 — No PII in customer card page/QR
- **Priority:** P0 · **Type:** security
- **Steps:** Load `/card/<token>`; view HTML source and the QR payload.
- **Expected:** Only customer *name*, store name, program name, reward, counts shown. **No** phone, email, customer id, business id, program id. QR encodes only `${appUrl}/staff/cards/${token}` (token, no PII). `getCustomerCardByToken` select-list confirms this.
- **Verify:** browser DOM inspection + decode QR data URI.

### S6-004 — Staff lookup includes businessId but page still authorizes
- **Priority:** P1 · **Type:** security
- **Steps:** Confirm `getStaffCardByToken` returns businessId used only server-side for `requireBusinessAccess`.
- **Expected:** businessId never rendered to client on `/staff/cards/[token]` beyond authorization use.
- **Verify:** browser DOM: no raw ids.

### S6-005 — extractCardToken: full `/card/` URL
- **Priority:** P1 · **Type:** functional
- **Steps:** `extractCardToken("https://app.test/card/ABC12345")`.
- **Expected:** → `ABC12345`.
- **Verify:** `node`.

### S6-006 — extractCardToken: full `/staff/cards/` URL
- **Priority:** P1 · **Type:** functional
- **Steps:** `extractCardToken("https://app.test/staff/cards/XYZ98765")`.
- **Expected:** → `XYZ98765` (staff pattern checked first).
- **Verify:** `node`.

### S6-007 — extractCardToken: raw valid token
- **Priority:** P1 · **Type:** functional
- **Steps:** `extractCardToken("aB3_-xY7long32charstring________")` (≥8, valid charset).
- **Expected:** returns the token unchanged.
- **Verify:** `node`.

### S6-008 — extractCardToken: raw token < 8 chars
- **Priority:** P1 · **Type:** boundary/negative
- **Steps:** `extractCardToken("abc123")` (6 chars, not a URL).
- **Expected:** regex `{8,}` fails → `null`.
- **Verify:** `node`.

### S6-009 — extractCardToken: invalid chars in raw token
- **Priority:** P1 · **Type:** negative
- **Steps:** `extractCardToken("abc!@#$%^&*")`.
- **Expected:** not a URL, fails charset regex → `null`.
- **Verify:** `node`.

### S6-010 — extractCardToken: URL-encoded token in path
- **Priority:** P2 · **Type:** boundary
- **Steps:** `extractCardToken("https://app.test/card/AB%2DCD1234")`.
- **Expected:** `decodeURIComponent("AB%2DCD1234")` → `AB-CD1234` returned.
- **Verify:** `node`.

### S6-011 — extractCardToken: malformed percent-encoding
- **Priority:** P2 · **Type:** negative
- **Steps:** `extractCardToken("https://app.test/card/%E0%A4%A")` (invalid sequence).
- **Expected:** `decodeURIComponent` throws inside try → caught → raw-token regex run on the full URL (contains `:`/`/`) fails → `null`. No unhandled exception.
- **Verify:** `node`.

### S6-012 — extractCardToken: whitespace / empty
- **Priority:** P2 · **Type:** boundary
- **Steps:** `""`, `"   "`, `"\n\t"`.
- **Expected:** all `null` (trim → empty → null).
- **Verify:** `node`.

### S6-013 — extractCardToken: `javascript:` and exotic schemes
- **Priority:** P1 · **Type:** security
- **Steps:** `extractCardToken("javascript:alert(1)")`, `"data:text/html,x"`, `"file:///etc/passwd"`, `"mailto:a@b.com"`.
- **Expected:** `new URL` parses these; pathname has no `/card/` or `/staff/cards/` match → `null`. No script/scheme passthrough into `router.push`.
- **Verify:** `node` each.

### S6-014 — extractCardToken: cross-origin card URL accepted **[SUSPECTED DEFECT SD-3]**
- **Priority:** P1 · **Type:** security
- **Steps:** `extractCardToken("https://evil.com/card/REALTOKEN32chars...")`.
- **Expected (current):** Returns `REALTOKEN...` — origin is ignored; only pathname shape matters. A malicious QR hosted on any domain that embeds a real token path is honored, and the scanner navigates staff to `/staff/cards/REALTOKEN`.
- **Should:** Restrict to the app's own origin (compare `url.origin` against `getAppUrl()`), or only accept path-relative/known-host inputs.
- **Verify:** `node`. Note impact is limited (token still must be valid + staff must belong to the business), but it violates "QR should point at our own domain".

### S6-015 — extractCardToken: URL path token skips length/charset check **[SUSPECTED DEFECT SD-10]**
- **Priority:** P2 · **Type:** boundary/security
- **Steps:** `extractCardToken("https://app.test/card/x")` (1-char), and `extractCardToken("https://app.test/card/a b")`.
- **Expected (current):** Returns `x` / `a b` — URL-derived tokens are not validated against `{8,}` charset, unlike raw tokens. Downstream lookup fails (not found), so not exploitable, but inconsistent.
- **Should:** Apply the same `{8,}` charset validation to URL-derived tokens.
- **Verify:** `node`.

### S6-016 — extractCardToken: query string & fragment ignored
- **Priority:** P2 · **Type:** functional
- **Steps:** `extractCardToken("https://app.test/card/TOKEN12345?ref=x#frag")`.
- **Expected:** pathname match → `TOKEN12345` (query/fragment excluded from pathname).
- **Verify:** `node`.

### S6-017 — extractCardToken: trailing slash / nested path
- **Priority:** P2 · **Type:** boundary
- **Steps:** `.../card/TOKEN12345/extra` and `.../card/TOKEN12345/`.
- **Expected:** `([^/]+)` captures `TOKEN12345` (stops at next slash).
- **Verify:** `node`.

### S6-018 — Non-URL junk string
- **Priority:** P2 · **Type:** negative
- **Steps:** `extractCardToken("hello world this is not a token")`.
- **Expected:** not a URL; has spaces → charset fail → `null`.
- **Verify:** `node`.

---

# S7-stamping

Covers `src/lib/actions/stamp.ts` (`addStamp`).

### S7-001 — Add stamp on ACTIVE card
- **Priority:** P0 · **Type:** functional
- **Preconditions:** C1 ACTIVE card, 0/5, staff logged in.
- **Steps:** Submit addStamp with C1 token.
- **Expected:** Stamp row created with `staffUserId=<staff>`; count 1/5; `{success:"Stamp added."}`; page refreshes.
- **Verify:** `psql` stamp row + staffUserId; browser count.

### S7-002 — Reaching requiredStamps flips to COMPLETED
- **Priority:** P0 · **Type:** functional
- **Preconditions:** C1 at 4/5.
- **Steps:** Add the 5th stamp.
- **Expected:** `stampCount+1 >= required` → card status COMPLETED; Redeem button appears.
- **Verify:** `psql status=COMPLETED`; browser shows RedeemRewardButton.

### S7-003 — requiredStamps=1 completes on first stamp
- **Priority:** P1 · **Type:** boundary
- **Preconditions:** Program requiredStamps=1; fresh card 0/1.
- **Steps:** Add one stamp.
- **Expected:** Immediately COMPLETED.
- **Verify:** `psql`.

### S7-004 — Add stamp on COMPLETED card rejected
- **Priority:** P0 · **Type:** negative
- **Preconditions:** C1 card COMPLETED.
- **Steps:** Submit addStamp.
- **Expected:** In-tx `freshCard.status !== "ACTIVE"` → `{error:"This card can't take more stamps right now."}`; no stamp added.
- **Verify:** `node` + `psql` count unchanged.

### S7-005 — Add stamp on REDEEMED card rejected
- **Priority:** P0 · **Type:** negative
- **Preconditions:** A REDEEMED card token.
- **Steps:** addStamp.
- **Expected:** status not ACTIVE → error message; no stamp.
- **Verify:** `node`.

### S7-006 — Add stamp on CANCELLED card rejected
- **Priority:** P1 · **Type:** negative
- **Preconditions:** Card manually set CANCELLED (via `psql`, since no UI cancels).
- **Steps:** addStamp.
- **Expected:** status not ACTIVE → error; no stamp.
- **Verify:** `node` + `psql`.

### S7-007 — Guard when stampCount already ≥ required on ACTIVE
- **Priority:** P1 · **Type:** negative/boundary
- **Preconditions:** Contrive an ACTIVE card whose stamp count already equals required (e.g. required lowered after stamping, or an over-stamped card from SD-1).
- **Steps:** addStamp.
- **Expected:** `stampCount >= required` → `{error:"This card is already full."}`.
- **Verify:** `node`.

### S7-008 — Unknown card token
- **Priority:** P1 · **Type:** negative
- **Steps:** addStamp with `cardToken=doesnotexist12345`.
- **Expected:** `getStaffCardByToken` null → `{error:"Card not found."}`.
- **Verify:** `node`.

### S7-009 — Missing cardToken
- **Priority:** P1 · **Type:** negative
- **Steps:** addStamp with empty/omitted cardToken.
- **Expected:** zod `min(1)` → `{error:"Missing card token"}`.
- **Verify:** `node`.

### S7-010 — Staff from another business rejected
- **Priority:** P0 · **Type:** security/isolation
- **Preconditions:** Owner A logged in; TOKEN_B belongs to Business B.
- **Steps:** addStamp TOKEN_B.
- **Expected:** `requireBusinessAccess(B)` → redirect `/dashboard`; no stamp.
- **Verify:** `node` (NEXT_REDIRECT) + `psql`.

### S7-011 — Audit trail records correct staffUserId
- **Priority:** P0 · **Type:** integration
- **Preconditions:** Staff A2 (not owner) adds stamps.
- **Steps:** A2 adds a stamp; then Owner A adds a stamp on same card.
- **Expected:** Two stamp rows with distinct `staffUserId`; `/dashboard/stats` and card history show correct staff names per stamp.
- **Verify:** `psql` + browser stats "by <name>".

### S7-012 — Concurrent double-tap Add Stamp over-stamps past required **[SUSPECTED DEFECT SD-1]**
- **Priority:** P0 · **Type:** concurrency
- **Preconditions:** C1 ACTIVE at 4/5 (required=5).
- **Steps:** Fire two `addStamp` for C1 concurrently (Promise.all).
- **Expected (current):** Both transactions read `freshCard.status=ACTIVE` and both `count()=4` (READ COMMITTED, no `SELECT … FOR UPDATE`, no unique/count constraint on stamps). Both insert → **6 stamps on a 5-stamp card**; both compute `4+1>=5` → both set COMPLETED. Result: over-stamped card.
- **Should:** Serialize with a row lock on the card (`SELECT … FOR UPDATE`), a `SERIALIZABLE` transaction, or a stamp-sequence unique constraint, so total stamps can never exceed required.
- **Verify:** `node` Promise.all against a real DB; `psql select count(*) from stamp where "loyaltyCardId"=<C1card>` → observe 6.

### S7-013 — Concurrent add at low count (no overshoot but both succeed)
- **Priority:** P2 · **Type:** concurrency
- **Preconditions:** C1 at 1/5.
- **Steps:** Two concurrent addStamp.
- **Expected:** 3/5, both succeed, card still ACTIVE — acceptable; documents that the race is only harmful at the completion boundary.
- **Verify:** `psql`.

### S7-014 — Add stamp revalidates despite client disabled button
- **Priority:** P1 · **Type:** security
- **Steps:** On a COMPLETED card the Add button is disabled client-side; POST addStamp directly anyway.
- **Expected:** Server rejects (status not ACTIVE). Client `canAddStamp` is UX-only.
- **Verify:** `node`.

---

# S8-undo

Covers `undoLastStamp` in `src/lib/actions/stamp.ts`.

### S8-001 — Undo on ACTIVE card
- **Priority:** P0 · **Type:** functional
- **Preconditions:** C1 ACTIVE at 3/5.
- **Steps:** undoLastStamp.
- **Expected:** Latest stamp (by createdAt desc) deleted → 2/5; `{success:"Last stamp undone."}`.
- **Verify:** `psql` count-1; browser.

### S8-002 — Undo on COMPLETED reverts to ACTIVE
- **Priority:** P0 · **Type:** functional
- **Preconditions:** C1 COMPLETED at 5/5.
- **Steps:** undoLastStamp.
- **Expected:** Delete latest → remaining 4 < 5 → status set back to ACTIVE; card usable again.
- **Verify:** `psql status=ACTIVE, count=4`.

### S8-003 — Undo on REDEEMED rejected
- **Priority:** P0 · **Type:** negative
- **Preconditions:** REDEEMED card.
- **Steps:** undoLastStamp.
- **Expected:** Guard `card.status==="REDEEMED"` → `{error:"This card's stamps can no longer be changed."}`; no delete.
- **Verify:** `node` + `psql`.

### S8-004 — Undo on CANCELLED rejected
- **Priority:** P1 · **Type:** negative
- **Preconditions:** CANCELLED card.
- **Steps:** undoLastStamp.
- **Expected:** Guard rejects; no delete.
- **Verify:** `node`.

### S8-005 — Undo with zero stamps
- **Priority:** P1 · **Type:** boundary/negative
- **Preconditions:** ACTIVE card 0/5.
- **Steps:** undoLastStamp.
- **Expected:** In-tx `!latestStamp` → `{error:"There are no stamps to undo."}`.
- **Verify:** `node`.

### S8-006 — Undo deletes the LATEST stamp
- **Priority:** P1 · **Type:** functional
- **Preconditions:** Card with 3 stamps at t1<t2<t3 (distinct createdAt).
- **Steps:** undo.
- **Expected:** t3 stamp deleted; t1,t2 remain.
- **Verify:** `psql`: remaining ids are the two oldest.

### S8-007 — Undo tie-break within same millisecond **[SUSPECTED DEFECT SD-12]**
- **Priority:** P2 · **Type:** boundary
- **Preconditions:** Insert two stamps with identical `createdAt` (same ms) via `psql`.
- **Steps:** undo.
- **Expected (current):** `orderBy createdAt desc` has a tie; which of the two is deleted is nondeterministic (no stable secondary sort on `id`/insertion order). Functionally both are stamps so the count is correct, but "undo the last one I added" is not guaranteed.
- **Should:** Add a deterministic tiebreaker (e.g. a monotonic sequence column or secondary `orderBy id`).
- **Verify:** `psql` repeated runs.

### S8-008 — Undo by a different staff member of same business
- **Priority:** P1 · **Type:** functional/integration
- **Preconditions:** Stamp added by A2; Owner A undoes it.
- **Expected:** Undo succeeds (any business member may undo, any role). Audit note: the undo itself is not logged (only stamp/redemption creation are logged) — record as an audit-coverage gap.
- **Verify:** `psql`; note absence of undo audit row.

### S8-009 — Undo by other-business staff rejected
- **Priority:** P0 · **Type:** security/isolation
- **Steps:** Owner A undoes on TOKEN_B.
- **Expected:** `requireBusinessAccess(B)` → redirect; no delete.
- **Verify:** `node` + `psql`.

### S8-010 — Concurrent undo+redeem on a COMPLETED card **[SUSPECTED DEFECT SD-2]**
- **Priority:** P0 · **Type:** concurrency
- **Preconditions:** C1 COMPLETED at 5/5.
- **Steps:** Fire `undoLastStamp(C1)` and `redeemReward(C1)` concurrently.
- **Expected (current):** `undoLastStamp` reads `card.status` **once, before** its transaction (from the initial `getStaffCardByToken`), and never re-reads status inside the tx (unlike `addStamp`/`redeemReward`, which re-check). If redeem commits first (card → REDEEMED, new ACTIVE cycle-2 card created), undo's stale `card.status="COMPLETED"` passes the guard, deletes a stamp from the now-REDEEMED card, then runs `if (card.status==="COMPLETED" && remaining<required)` → tries to `update` the REDEEMED card back to **ACTIVE**. That collides with the new cycle-2 ACTIVE card on the partial unique index → **P2002 unhandled → 500**; or, depending on interleaving, a stamp is silently deleted from a redeemed card.
- **Should:** Re-read and re-validate card status *inside* the undo transaction (mirror `addStamp`'s `findUniqueOrThrow` fresh-status check), and reject if not ACTIVE/COMPLETED.
- **Verify:** `node` Promise.all against real DB; inspect for thrown P2002 / two ACTIVE cards / stamp deleted from REDEEMED card via `psql`.

### S8-011 — Undo after redemption cycle started (sequential)
- **Priority:** P1 · **Type:** negative
- **Preconditions:** C1 redeemed; old card REDEEMED; new cycle-2 ACTIVE card exists.
- **Steps:** undoLastStamp on the OLD (REDEEMED) token.
- **Expected:** Guard rejects (REDEEMED) → error; no change.
- **Verify:** `node`.

### S8-012 — Undo unknown/missing token
- **Priority:** P2 · **Type:** negative
- **Steps:** undo with unknown token / empty.
- **Expected:** "Card not found." / "Missing card token".
- **Verify:** `node`.

---

# S9-redemption

Covers `redeemReward` in `src/lib/actions/rewards.ts`.

### S9-001 — Redeem COMPLETED card full cycle
- **Priority:** P0 · **Type:** functional
- **Preconditions:** C1 card COMPLETED, cycleNumber=1, staff logged in.
- **Steps:** Confirm dialog → redeemReward.
- **Expected (in one tx):** old card → REDEEMED; `reward_redemption` row created with staffUserId; new ACTIVE card created with cycleNumber=2 and a NEW random token; redirect `/staff/cards/<newToken>?redeemed=1`.
- **Verify:** `psql`: old REDEEMED, one redemption row, new ACTIVE cycle 2, new token ≠ old; browser shows "🎉 Reward redeemed!".

### S9-002 — Partial unique index permits new ACTIVE in same tx
- **Priority:** P0 · **Type:** integration
- **Steps:** Same as S9-001; verify update-before-insert ordering.
- **Expected:** Because old card is set REDEEMED before inserting the new ACTIVE card, the "one ACTIVE per customer+program" partial index is satisfied within the transaction.
- **Verify:** `psql`: exactly one ACTIVE card for C1+program after redeem.

### S9-003 — Redeem ACTIVE (not completed) rejected
- **Priority:** P0 · **Type:** negative
- **Preconditions:** C1 ACTIVE at 3/5.
- **Steps:** redeemReward.
- **Expected:** In-tx `freshCard.status !== "COMPLETED"` → `{error:"This card isn't ready to redeem yet."}`; no redemption, no new card.
- **Verify:** `node` + `psql`.

### S9-004 — Redeem already-REDEEMED rejected
- **Priority:** P0 · **Type:** negative
- **Preconditions:** Card already REDEEMED.
- **Steps:** redeemReward on old token.
- **Expected:** status not COMPLETED → "isn't ready to redeem yet"; no duplicate.
- **Verify:** `node`.

### S9-005 — Concurrent double-redeem (P2002 path)
- **Priority:** P0 · **Type:** concurrency
- **Preconditions:** C1 COMPLETED.
- **Steps:** Fire two redeemReward concurrently.
- **Expected:** One succeeds (redemption + new card). The other races past the status check but the **unique `reward_redemption.loyaltyCardId`** rejects its insert (P2002) → `{error:"This card has already been redeemed."}`. Exactly **one** redemption row and **one** new ACTIVE card.
- **Verify:** `node` Promise.all; `psql`: redemption count=1, new ACTIVE count=1.

### S9-006 — Redeem by other-business staff rejected
- **Priority:** P0 · **Type:** security/isolation
- **Steps:** Owner A redeems TOKEN_B (COMPLETED).
- **Expected:** `requireBusinessAccess(B)` redirect; no redemption/new card.
- **Verify:** `node` + `psql`.

### S9-007 — Redeem unknown/missing token
- **Priority:** P1 · **Type:** negative
- **Steps:** redeemReward unknown token / empty.
- **Expected:** "Card not found." / "Missing card token".
- **Verify:** `node`.

### S9-008 — Old token still resolves after redemption (shows REDEEMED)
- **Priority:** P1 · **Type:** functional
- **Preconditions:** C1 redeemed.
- **Steps:** GET `/staff/cards/<oldToken>` and `/card/<oldToken>`.
- **Expected:** Both resolve and show REDEEMED state (staff: no add/undo/redeem controls; customer card: "already been redeemed").
- **Verify:** browser.

### S9-009 — `?redeemed=1` banner display
- **Priority:** P2 · **Type:** usability
- **Steps:** After redeem, land on `/staff/cards/<newToken>?redeemed=1`.
- **Expected:** Green banner "🎉 Reward redeemed! This is the customer's new active card." New card 0/required.
- **Verify:** browser; also GET newToken without `?redeemed=1` → no banner.

### S9-010 — cycleNumber increments across multiple cycles
- **Priority:** P1 · **Type:** functional
- **Steps:** Complete+redeem C1 twice.
- **Expected:** cycleNumbers 1→2→3 on successive cards; each new card new token.
- **Verify:** `psql select "cycleNumber" from loyalty_card where "customerId"=<C1> order by "createdAt";`.

### S9-011 — Redeem confirm dialog cancel
- **Priority:** P2 · **Type:** usability
- **Steps:** Click Redeem, then Cancel in the `window.confirm`.
- **Expected:** `event.preventDefault()` stops submission; no server call; card unchanged.
- **Verify:** browser + `psql`.

### S9-012 — Redeem revalidates despite hidden button
- **Priority:** P1 · **Type:** security
- **Steps:** On a non-COMPLETED card the Redeem button is not rendered; POST redeemReward directly.
- **Expected:** Server rejects (status check).
- **Verify:** `node`.

### S9-013 — redirect happens outside try/catch (not swallowed)
- **Priority:** P2 · **Type:** functional
- **Steps:** Confirm successful redeem's `redirect()` is thrown after the transaction (NEXT_REDIRECT not caught by the P2002/RedeemRewardError handlers).
- **Expected:** Redirect completes; user reaches new card page (no "already redeemed" false error).
- **Verify:** browser; code review confirms `redirect` after `try`.

---

# S10-dashboard-stats

Covers `src/lib/dashboard.ts`, `/dashboard`, `/dashboard/stats`, `/dashboard/customers`.

### S10-001 — Empty state: no program, no customers
- **Priority:** P1 · **Type:** functional
- **Preconditions:** Fresh owner, no program/customers.
- **Steps:** Load `/dashboard`, `/dashboard/customers`, `/dashboard/stats`.
- **Expected:** Dashboard stats all 0; customers page "No customers yet" EmptyState; stats page "No stamps yet"/"No redemptions yet".
- **Verify:** browser.

### S10-002 — Counts correct after each mutation
- **Priority:** P0 · **Type:** integration
- **Steps:** Join C1 (customers=1, activeCards=1); add 5 stamps (totalStamps=5, on 5th completedCards=1, activeCards=0); redeem (redemptions=1, activeCards=1 new, completedCards=0).
- **Expected:** Dashboard StatCards reflect each step exactly.
- **Verify:** browser after each step + `psql` cross-check via `getDashboardStats`.

### S10-003 — Data isolation in all dashboard queries
- **Priority:** P0 · **Type:** isolation
- **Preconditions:** Business A and B both populated.
- **Steps:** As Owner A, load all three pages.
- **Expected:** Every count/list scoped to A only (queries filter `customer:{businessId}`); no B rows.
- **Verify:** browser + `psql` compare A-only counts.

### S10-004 — Customer list shows latest card status
- **Priority:** P1 · **Type:** functional
- **Steps:** C1 with ACTIVE card 3/5.
- **Expected:** Row shows "Active · Last activity <date>" and "3 / 5".
- **Verify:** browser.

### S10-005 — Customer with no card yet
- **Priority:** P2 · **Type:** boundary
- **Preconditions:** A customer row exists with zero cards (contrived via `psql`).
- **Steps:** Load customers page.
- **Expected:** "No card yet", "0 / 0", no lastActivity.
- **Verify:** browser.

### S10-006 — Customer status labels mapping
- **Priority:** P2 · **Type:** functional
- **Steps:** Customers with ACTIVE/COMPLETED/REDEEMED/CANCELLED latest cards.
- **Expected:** Labels "Active"/"Ready for reward"/"Redeemed"/"Cancelled" respectively.
- **Verify:** browser.

### S10-007 — lastActivity falls back to card.createdAt when no stamps
- **Priority:** P2 · **Type:** functional
- **Steps:** Customer joined, zero stamps.
- **Expected:** lastActivity = card.createdAt (not null).
- **Verify:** browser/`node`.

### S10-008 — Recent activity capped at 5
- **Priority:** P1 · **Type:** boundary
- **Steps:** Create 8 stamps and 7 redemptions.
- **Expected:** Stats page shows only the 5 most recent of each (take:5, desc).
- **Verify:** browser count; `psql` order.

### S10-009 — Large-N customers rendering (no pagination)
- **Priority:** P2 · **Type:** boundary/usability
- **Steps:** Seed 500 customers.
- **Expected:** `getCustomerList` returns all (no `take`/pagination) → page renders 500 cards. Flag as a scalability/UX gap (unbounded list, "N total" grows unbounded).
- **Verify:** browser perf; `psql` count.

### S10-010 — Loading states render
- **Priority:** P2 · **Type:** usability
- **Steps:** Throttle network; navigate to each dashboard route.
- **Expected:** `loading.tsx` skeletons appear (customers/program/stats all have loading files).
- **Verify:** browser with slow 3G throttle.

### S10-011 — Stats time formatting
- **Priority:** P2 · **Type:** functional
- **Steps:** Stamp/redeem, view stats.
- **Expected:** Activity lines format "Mon D, h:mm AM/PM" (locale-dependent) and read "+1 stamp for <name> by <staff>".
- **Verify:** browser.

### S10-012 — Owner with no OWNER membership sees no stats block
- **Priority:** P1 · **Type:** functional
- **Steps:** Staff A2 loads `/dashboard`.
- **Expected:** No stats grid; only staff tools + businesses list.
- **Verify:** browser.

---

# S11-ui-a11y

Covers layouts, forms, states, mobile, keyboard, labels.

### S11-001 — Mobile viewport rendering (375px)
- **Priority:** P1 · **Type:** usability
- **Steps:** Set viewport 375×812; load `/join/[slug]`, `/card/[token]`, `/staff/cards/[token]`, `/dashboard`.
- **Expected:** Single-column, `max-w-sm`/`max-w-2xl` layouts fit; nav horizontally scrolls; no horizontal body scroll.
- **Verify:** browser device emulation.

### S11-002 — Large tap targets for staff
- **Priority:** P1 · **Type:** usability
- **Steps:** Inspect Add/Undo/Redeem buttons on `/staff/cards/[token]`.
- **Expected:** `size="lg"`, full-width buttons; comfortably tappable (≥44px height).
- **Verify:** browser measure.

### S11-003 — Screenshot-friendly customer card
- **Priority:** P1 · **Type:** usability
- **Steps:** Load `/card/[token]` (ACTIVE mid-progress).
- **Expected:** Card, stamp grid, QR, "Show this QR to staff" all visible in one screen at mobile width; no clipping.
- **Verify:** browser screenshot.

### S11-004 — Loading states present on every applicable route
- **Priority:** P1 · **Type:** usability
- **Steps:** Verify `loading.tsx` for `/card/[token]`, `/join/[slug]`, `/dashboard/customers`, `/dashboard/program`, `/dashboard/stats`.
- **Expected:** All present and render skeletons.
- **Verify:** file check + browser throttle.

### S11-005 — Empty states present
- **Priority:** P1 · **Type:** usability
- **Steps:** No customers, no stamps, no program.
- **Expected:** EmptyState components render with helpful copy.
- **Verify:** browser.

### S11-006 — Error states present on lookups
- **Priority:** P1 · **Type:** usability
- **Steps:** Unknown `/card/x`, unknown `/join/x`, unknown `/staff/cards/x`.
- **Expected:** ErrorState with title/description on each.
- **Verify:** browser.

### S11-007 — No error boundary for thrown actions **[SUSPECTED DEFECT SD-13]**
- **Priority:** P1 · **Type:** usability
- **Steps:** Force an uncontrolled throw in a server action (e.g. DB down during addStamp non-StampActionError path).
- **Expected (current):** No `error.tsx`/`global-error.tsx` exists → the default Next error page shows (in prod, generic "Application error"). Controlled errors are handled, but unexpected throws have no branded boundary.
- **Should:** Add `error.tsx` (and `not-found.tsx`) boundaries.
- **Verify:** file check (none exist) + induced throw.

### S11-008 — Form error messages display
- **Priority:** P1 · **Type:** usability
- **Steps:** Submit register/login/program/join with invalid input.
- **Expected:** `state.error` renders in `text-destructive` under the form.
- **Verify:** browser.

### S11-009 — Disabled/pending button states
- **Priority:** P1 · **Type:** usability
- **Steps:** Submit each form; observe button during `isPending`.
- **Expected:** Button disabled + label swaps ("Logging in…", "Saving…", "Adding stamp…", "Redeeming…", "Joining…").
- **Verify:** browser (throttle to observe).

### S11-010 — Add/Undo disabled by canAddStamp/canUndo
- **Priority:** P1 · **Type:** usability
- **Steps:** COMPLETED card → Add disabled; 0-stamp card → Undo disabled; REDEEMED → both disabled.
- **Expected:** Matches `canAddStamp`/`canUndo` logic.
- **Verify:** browser.

### S11-011 — Keyboard navigation of forms
- **Priority:** P2 · **Type:** a11y
- **Steps:** Tab through register/login/program/join forms; submit with Enter.
- **Expected:** Logical tab order; inputs reachable; Enter submits; focus visible.
- **Verify:** browser keyboard-only.

### S11-012 — Labels/inputs associated
- **Priority:** P1 · **Type:** a11y
- **Steps:** Inspect each `<Label htmlFor>` ↔ `<Input id>` pair.
- **Expected:** All inputs have associated labels (email, password, businessName, name, phone, program fields, manual token).
- **Verify:** DOM/axe.

### S11-013 — QR image alt text
- **Priority:** P2 · **Type:** a11y
- **Steps:** Inspect customer QR and store-join QR images.
- **Expected:** Customer QR alt "Your personal QR code"; store QR has descriptive alt (verify `store-join-qr-code.tsx`).
- **Verify:** DOM.

### S11-014 — Focus management after scan navigation
- **Priority:** P2 · **Type:** a11y
- **Steps:** Scanner success → `router.push`.
- **Expected:** Navigation to card page; focus lands sensibly (document current behavior; no focus trap).
- **Verify:** browser.

### S11-015 — Color contrast of key text
- **Priority:** P2 · **Type:** a11y
- **Steps:** Check `text-muted-foreground`, destructive, emerald banners against backgrounds (light+dark).
- **Expected:** Meets WCAG AA (4.5:1) for body text.
- **Verify:** contrast tool; note any failures.

### S11-016 — Dark mode rendering
- **Priority:** P2 · **Type:** usability
- **Steps:** Toggle OS dark theme; load card/staff pages.
- **Expected:** `dark:` variants (emerald banners, etc.) render legibly.
- **Verify:** browser.

### S11-017 — Stamp grid scales with requiredStamps
- **Priority:** P2 · **Type:** usability/boundary
- **Steps:** Program requiredStamps=100; load card.
- **Expected:** `grid-cols-5` renders 100 cells (20 rows) without breaking layout; still screenshot-usable (note if 100 is unwieldy on mobile).
- **Verify:** browser.

### S11-018 — Long customer/store/program names don't break layout
- **Priority:** P2 · **Type:** usability/boundary
- **Steps:** 100-char name, long program/reward text.
- **Expected:** Wrapping/truncation acceptable; no overflow off-screen.
- **Verify:** browser.

---

# S12-scanner

Covers `src/components/scanner-panel.tsx`, `/staff/scan`.

### S12-001 — Camera permission denied
- **Priority:** P1 · **Type:** functional
- **Steps:** Deny camera permission on `/staff/scan`.
- **Expected:** `start().catch` detects permission/notallowed → state "denied" → overlay "Camera permission denied… use manual entry".
- **Verify:** browser (deny prompt).

### S12-002 — No camera device
- **Priority:** P1 · **Type:** functional
- **Steps:** Emulate no camera.
- **Expected:** catch → "unavailable" → "Scanner unavailable on this device. Use manual entry".
- **Verify:** browser (fake no-device) / desktop no-cam.

### S12-003 — Valid QR scanned navigates to card
- **Priority:** P0 · **Type:** functional
- **Steps:** Scan a valid customer QR (encodes `.../staff/cards/<token>`).
- **Expected:** `extractCardToken` → token; state "success"; scanner stops; `router.push('/staff/cards/<token>')`.
- **Verify:** browser with a real QR.

### S12-004 — Invalid QR content
- **Priority:** P1 · **Type:** negative
- **Steps:** Scan a QR encoding `https://example.com` (no card path).
- **Expected:** `extractCardToken` null → state "invalid" → "That doesn't look like a StampMate card QR. Keep scanning or use manual entry".
- **Verify:** browser.

### S12-005 — QR pointing at another business's card
- **Priority:** P0 · **Type:** security/isolation
- **Steps:** As Staff A, scan a QR for TOKEN_B.
- **Expected:** Scanner accepts token and navigates; `/staff/cards/TOKEN_B` then `requireBusinessAccess(B)` redirects `/dashboard`. Isolation enforced server-side, not at scan.
- **Verify:** browser.

### S12-006 — Manual entry: full URL
- **Priority:** P1 · **Type:** functional
- **Steps:** Paste `https://app/staff/cards/<token>` into manual field, click Go.
- **Expected:** extract → token → navigate.
- **Verify:** browser.

### S12-007 — Manual entry: raw token
- **Priority:** P1 · **Type:** functional
- **Steps:** Paste a raw 32-char token, Go.
- **Expected:** navigate to `/staff/cards/<token>`.
- **Verify:** browser.

### S12-008 — Manual entry: malformed input
- **Priority:** P1 · **Type:** negative
- **Steps:** Paste `abc` (too short) / `!!!` / empty, Go.
- **Expected:** `extractCardToken` null → "Enter a valid card link or token." inline error; no navigation.
- **Verify:** browser.

### S12-009 — Manual entry: cross-origin URL **[SUSPECTED DEFECT SD-3, UI surface]**
- **Priority:** P2 · **Type:** security
- **Steps:** Paste `https://evil.com/card/<realtoken>`, Go.
- **Expected (current):** Accepted → navigates to `/staff/cards/<realtoken>` (origin ignored). Server still enforces business access.
- **Verify:** browser; cross-reference S6-014.

### S12-010 — Scanner cleanup on unmount (no camera leak)
- **Priority:** P2 · **Type:** functional
- **Steps:** Navigate to `/staff/scan`, then away before/after start resolves.
- **Expected:** `safeStop` + `clear` stop the stream (handles Strict Mode double-invoke and pending-start unmount).
- **Verify:** browser: camera indicator turns off after navigation.

### S12-011 — Manual error clears on edit
- **Priority:** P2 · **Type:** usability
- **Steps:** Trigger manual error, then type in field.
- **Expected:** `onChange` clears `manualError`.
- **Verify:** browser.

---

# S13-data-integrity

Covers schema constraints, FK onDelete behavior, cascades, unique constraints.

### S13-001 — Stamp.staffUser onDelete RESTRICT
- **Priority:** P0 · **Type:** integration
- **Preconditions:** A user has stamps.
- **Steps:** Attempt `DELETE FROM "user" WHERE id=<staff>`.
- **Expected:** FK RESTRICT → deletion fails (stamps reference the user).
- **Verify:** `psql` → error.

### S13-002 — RewardRedemption.staffUser onDelete RESTRICT
- **Priority:** P0 · **Type:** integration
- **Steps:** Delete a user who has redemptions.
- **Expected:** RESTRICT → fails.
- **Verify:** `psql`.

### S13-003 — Business cascade to stores/customers/programs/cards/stamps
- **Priority:** P0 · **Type:** integration
- **Preconditions:** Business A fully populated; its staff users have NO stamps referencing them, OR delete-order handled.
- **Steps:** `DELETE FROM business WHERE id=<A>`.
- **Expected:** Cascades: staff_membership, store→loyalty_program→loyalty_card→stamp + reward_redemption, customer all deleted. BUT note: `stamp.staffUserId`/`redemption.staffUserId` → user is RESTRICT, yet the cascade deletes the *stamp rows* (stamp FK to card is CASCADE), which removes the referencing rows, so user deletion is unaffected here. Confirm business delete succeeds and leaves users intact.
- **Verify:** `psql` counts zero for A's stores/customers/cards/stamps; users still exist.

### S13-004 — Store slug unique constraint
- **Priority:** P1 · **Type:** integration
- **Steps:** Insert two stores with slug `aroma-coffee`.
- **Expected:** Second insert violates `store_slug_key`.
- **Verify:** `psql`.

### S13-005 — Customer businessId+phone unique
- **Priority:** P0 · **Type:** integration
- **Steps:** Insert two customers same businessId + phone `09171234567`.
- **Expected:** Violates `customer_businessId_phone_key`.
- **Verify:** `psql`.

### S13-006 — LoyaltyCard cardToken unique
- **Priority:** P1 · **Type:** integration
- **Steps:** Insert two cards with same cardToken.
- **Expected:** Violates `loyalty_card_cardToken_key`.
- **Verify:** `psql`.

### S13-007 — RewardRedemption loyaltyCardId unique (one redemption per card)
- **Priority:** P0 · **Type:** integration
- **Steps:** Insert two redemptions for the same loyaltyCardId.
- **Expected:** Violates `reward_redemption_loyaltyCardId_key` — the guarantee behind concurrent-redeem safety.
- **Verify:** `psql`.

### S13-008 — Partial unique index: one ACTIVE card per customer+program EXISTS
- **Priority:** P0 · **Type:** integration
- **Steps:** Confirm index present: `\d loyalty_card` / query `pg_indexes`.
- **Expected:** `loyalty_card_one_active_per_customer_program` UNIQUE … WHERE status='ACTIVE' exists (from raw migration SQL). Verified present in `20260706070621_.../migration.sql`.
- **Verify:** `psql SELECT indexdef FROM pg_indexes WHERE indexname='loyalty_card_one_active_per_customer_program';`.

### S13-009 — Partial index blocks two ACTIVE cards
- **Priority:** P0 · **Type:** integration
- **Steps:** Insert two ACTIVE cards for same customerId+loyaltyProgramId.
- **Expected:** Second violates the partial unique index.
- **Verify:** `psql`.

### S13-010 — Partial index allows ACTIVE + COMPLETED/REDEEMED
- **Priority:** P1 · **Type:** integration
- **Steps:** For one customer+program: one COMPLETED + one ACTIVE; one REDEEMED + one ACTIVE.
- **Expected:** Allowed (WHERE status='ACTIVE' only constrains ACTIVE rows).
- **Verify:** `psql`.

### S13-011 — User email unique
- **Priority:** P1 · **Type:** integration
- **Steps:** Insert two users with same email (bypassing app).
- **Expected:** Violates `user_email_key`. (Case-sensitivity noted in S1-009.)
- **Verify:** `psql`.

### S13-012 — StaffMembership userId+businessId unique
- **Priority:** P1 · **Type:** integration
- **Steps:** Insert duplicate membership for same user+business.
- **Expected:** Violates `staff_membership_userId_businessId_key`.
- **Verify:** `psql`.

### S13-013 — Session cascade on user delete
- **Priority:** P2 · **Type:** integration
- **Steps:** Delete a user with no stamps/redemptions but with sessions/accounts.
- **Expected:** session/account cascade-delete with the user (onDelete Cascade).
- **Verify:** `psql`.

### S13-014 — Card cascade deletes stamps + redemption
- **Priority:** P1 · **Type:** integration
- **Steps:** `DELETE FROM loyalty_card WHERE id=<card with stamps+redemption>`.
- **Expected:** stamps and reward_redemption cascade-deleted.
- **Verify:** `psql`.

### S13-015 — cardToken/id are server-generated UUID/base64url
- **Priority:** P1 · **Type:** integration
- **Steps:** Inspect generated ids.
- **Expected:** `Business.id`/`Store.id`/… are `@default(uuid())` (DB-generated); Better Auth ids via `crypto.randomUUID()`; cardToken via `randomBytes(24).base64url` — none client-supplied.
- **Verify:** `psql` format checks.

---

# S14-build-health

### S14-001 — Lint passes
- **Priority:** P0 · **Type:** functional
- **Steps:** `npm run lint`.
- **Expected:** Exit 0, no errors.
- **Verify:** terminal.

### S14-002 — Typecheck passes
- **Priority:** P0 · **Type:** functional
- **Steps:** `npm run typecheck` (`tsc --noEmit`).
- **Expected:** Exit 0.
- **Verify:** terminal.

### S14-003 — Build passes
- **Priority:** P0 · **Type:** functional
- **Steps:** `npm run build`.
- **Expected:** Next build succeeds; all routes compile; no type/lint failures gating build.
- **Verify:** terminal.

### S14-004 — Prisma client generated
- **Priority:** P1 · **Type:** functional
- **Steps:** `npm run db:generate` (postinstall runs `prisma generate`).
- **Expected:** `src/generated/prisma` regenerates without drift vs `schema.prisma`.
- **Verify:** terminal + `git status` clean on generated dir.

### S14-005 — Migrations apply cleanly to a fresh DB
- **Priority:** P1 · **Type:** integration
- **Steps:** `npm run db:deploy` against a clean database.
- **Expected:** All 5 migrations apply, including the hand-written partial unique index; final schema matches `schema.prisma` + raw index.
- **Verify:** `psql \d` + `pg_indexes`.

### S14-006 — No secrets committed
- **Priority:** P2 · **Type:** security
- **Steps:** Grep repo for `.env`, keys, `DATABASE_URL`, `BETTER_AUTH_URL` literals.
- **Expected:** No credentials in source; env-driven (`getAppUrl` reads `BETTER_AUTH_URL`).
- **Verify:** grep.

---

## Coverage summary & regression suites

**Smoke suite (must pass before any deploy):** S1-001, S1-010, S1-015, S3-001, S5-001, S7-001, S7-002, S9-001, S2-001, S14-001/002/003.

**Critical-path (deploy-blocking) suite:** all P0 cases — notably the isolation set (S2-009..013, S7-010, S8-009, S9-006, S10-003, S12-005), the constraint set (S13-001/002/005/007/008/009), and the concurrency set (S5-018, S7-012, S8-010, S9-005).

**Full regression suite:** all P0+P1 cases across S1–S13 plus S14 build health.

**Concurrency regression (run against a real Postgres, not SQLite/mock):** S3-017, S4-007, S5-018, S7-012, S7-013, S8-010, S9-005.

## Gaps / ambiguities needing product clarification

1. **Rejoin with an unredeemed COMPLETED card (SD-9):** Should rejoin return the COMPLETED card or mint a parallel ACTIVE card? Spec is silent.
2. **PH phone canonicalization (SD-5):** Is `+63917…` / `63917…` / `0917…` meant to be one subscriber? Current code says no.
3. **redirectTo (SD-8):** Should post-login deep-linking work? Currently the param is dead.
4. **Undo audit trail:** stamp/redemption creations are logged (staffUserId), but undo deletes leave no audit record — is that acceptable?
5. **Customer list pagination:** unbounded; no product limit defined.
6. **Card cancellation:** `CANCELLED` status is handled everywhere but no flow sets it — is a cancel action planned?
7. **Empty-normalized phone (SD-4):** define a minimum digit count for a valid phone.
