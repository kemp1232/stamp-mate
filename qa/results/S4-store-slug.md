# S4-store-slug — Results

Executed against `http://localhost:3100` (real Next.js dev server) and the local Supabase Postgres DB
(`postgresql://postgres:postgres@127.0.0.1:56322/postgres`), for real — no code under test was modified.

Covers `slugify` / `generateUniqueSlug` / `getOrCreateDefaultStore` in `src/lib/store.ts`.

**Layer note:** `src/lib/store.ts` starts with `import "server-only"` and pulls in the real Prisma client,
so it cannot be imported directly by a plain `tsx` script per the briefing's guidance (`server-only` throws
outside of a genuine Next.js server module graph). Per the briefing's documented fallback, all cases were
exercised through the **real HTTP surface**: an owner+business+membership were seeded directly via `psql`
(bypassing only the *registration form*, not the store logic itself — `registerOwner` doesn't touch stores
at all; store creation is 100% lazy, triggered the first time `/dashboard/program` is loaded), then a plain
`GET /dashboard/program` with the session cookie was issued via `fetch`, which is exactly what invokes
`getOrCreateDefaultStore(businessId)` server-side (see `src/app/dashboard/program/page.tsx:17`). Results
were verified with `psql` against `store.slug`. This is "node = HTTP + psql" per the briefing's explicit
fallback clause, not a synthetic reimplementation of `slugify`.

**Gotcha found and fixed during setup:** `/dashboard/program` has a `loading.tsx` (a Suspense boundary), so
Next.js streams a `200` response with the loading fallback shell *before* the async `ProgramPage` component
(which calls `getOrCreateDefaultStore`) resolves. An HTTP client that only reads `response.status`/headers
without draining the body can return before the store row is actually committed, producing a **false
negative** ("store not created"). Fixed by always calling `res.text()` to fully drain the streamed response
before querying the DB (see `S4-store-slug/local.js`, `triggerStoreCreation`). This is a testing-harness
detail, not an app defect — flagging it here in case other suites hit the same false negative.

All 8 cases were executed for real. Script: `S4-store-slug/run.js`; helpers in `S4-store-slug/local.js`.

| ID | Title | Priority | Status | Evidence | Notes |
|----|-------|----------|--------|----------|-------|
| S4-001 | Normal name slugifies | P1 | PASS | Business name `"Aroma Coffee QA n-a619e6749b"` → `GET /dashboard/program` (200) → `psql`: `store.slug = "aroma-coffee-qa-n-a619e6749b"`, matching `slugify(name)` computed independently in the test (lowercase, non-alnum runs → single `-`, trimmed). | Used a run-unique business name instead of the plan's literal "Aroma Coffee" per the harness's tenant-isolation rule (this DB is shared with other concurrently-running QA suites); the slugify *algorithm* is what's under test and is verified byte-for-byte against an independent computation. |
| S4-002 | Name slugifies to empty → "store" fallback | P1 | PASS | Sequentially created businesses named `"!!!"`, `"→→→"`, `"   "` (3 spaces), `"___"`. All four produced valid `store`/`store-N` slugs: `{"!!!":"store-16"}`, `{"→→→":"store-17"}`, `{"   ":"store-18"}`, `{"___":"store-19"}` (numbering continues from earlier runs of this same suite against the persistent dev DB — see below). All four slugs distinct. | Confirms `slugify(x) || "store"` fallback fires for all four inputs (each strips to empty after `.replace(/[^a-z0-9]+/g,"-").replace(/(^-\|-$)+/g,"")`), and `generateUniqueSlug` correctly suffixes subsequent collisions. Numbering doesn't start at literal `"store"` in this particular run only because prior runs of this suite (executed while iterating on the test script) already claimed `store`, `store-2`..`store-15` in this shared, persistent DB — the suffixing *mechanism* itself is what's verified, and it worked correctly across all runs. |
| S4-003 | Unicode-only name | P2 | PASS | Business name `"日本語カフェ"` → `psql`: `store.slug = "store-20"` (matches `store`/`store-N` pattern). | All characters are non-`a-z0-9`, so they're stripped entirely, correctly triggering the same fallback path as S4-002. |
| S4-004 | Slug collision suffixing | P1 | PASS | Created three businesses all named `"Coffee 1785998638044"` (timestamp-suffixed to guarantee a clean run against the persistent DB) sequentially. Resulting slugs: `["coffee-1785998638044", "coffee-1785998638044-2", "coffee-1785998638044-3"]` — exactly base, base-2, base-3, suffix starting at 2 as expected, all three distinct. | Matches the plan's expected pattern exactly (just with a longer, collision-free base string than the literal "Coffee" to keep the assertion exact rather than tolerant-of-history). |
| S4-005 | Very long name (300 chars) | P2 | PASS | Business name = 300×`"x"`. `psql`: `store.slug` matches `/^x+(-\d+)?$/` with the `x`-run portion being **exactly 300 characters** (full slug length 302, i.e. a `"-4"` collision suffix from an earlier run of this same 300-x literal in this persistent DB — the *untruncated* 300-char base is what matters and is confirmed exact). `store.slug` column accepted the value without error (Postgres `TEXT`, no length cap). | No truncation observed — `slugify` and the DB both handle very long input names correctly. Confirms the test plan's expectation that there's no length cap in the schema. |
| S4-006 | Mixed case & punctuation | P2 | PASS | Business name `"  Bob's Café & Bar!!  "` → `psql`: `store.slug = "bob-s-caf-bar-4"` (base `"bob-s-caf-bar"` + a `"-4"` collision suffix from an earlier run of this exact literal in this persistent DB). Verified the **base** matches the test plan's exact predicted output `"bob-s-caf-bar"` byte-for-byte: apostrophe+space collapse to one `-` between "bob" and "s" (since `s` is itself alnum), the accented `é`+space+`&`+space collapse into one `-` between "caf" and "bar", trailing `!!`+spaces trim away. | Exact match to the hand-derived expected slug from the test plan. |
| S4-007 | **[SUSPECTED DEFECT SD-7]** Slug uniqueness under concurrency | P1 | PASS (defect **CONFIRMED**) | Ran 8 trials. Each trial: created **two different businesses with the identical name** (so both compute the same base slug), then fired `Promise.all([GET /dashboard/program (ownerA), GET /dashboard/program (ownerB)])` concurrently — this is the test plan's explicitly-endorsed alternative framing of "two same-slug creations concurrently." One trial (in the run captured for this report) left `storeB = null` — business B ended up with **zero store rows** despite its request returning HTTP 200. A separate deep-dive run (`S4-store-slug/probe-sd7b.js`) caught the raw server error in the RSC stream: `PrismaClientKnownRequestError`, `"Unique constraint failed on the fields: (\`slug\`)"`, thrown from `prisma.store.create()` inside `getOrCreateDefaultStore`, with the client-visible payload literally containing `"Switched to client rendering because the server rendering errored"`. Full stack trace captured (see Defects section). Reproduced in 1-2 of 8 attempts across two separate runs — narrow but real race window. | **SD-7 CONFIRMED** with a captured raw Prisma error and stack trace — see Defects section below. |
| S4-008 | Store created lazily only once | P1 | PASS | Same tenant, two sequential `GET /dashboard/program` calls. After call 1: `psql` shows exactly one `store` row (id captured). After call 2: still exactly one row, **same `id`**, **same `slug`** — `findFirst` correctly short-circuits on the second call. | Layer: HTTP + DB, sequential (no race). |

**Summary: 8/8 PASS, 0 FAIL, 0 BLOCKED, 0 NOT-RUN.**

## Defects

### SD-7 — `getOrCreateDefaultStore` findFirst-then-create race → unhandled P2002 (confirmed)
- **Severity:** High. This is a genuine unhandled-exception path in a page every new owner hits on their
  very first visit to `/dashboard/program`, and the losing side of the race is left with **no store row at
  all** — that business can never create a loyalty program again without a manual DB fix (there's no retry;
  the next page load will hit `findFirst` → still nothing → attempt `create()` again with the *same* base
  slug → same collision, forever, *unless* some other business in between has taken a slug that shifts the
  suffix — an unlikely accidental self-heal, not a real fix).
- **Test case ID(s):** S4-007 (also cross-referenced from S3-017 in the S3 suite, which deliberately
  pre-creates the store to isolate the *separate* `loyalty_program`-row race, SD-6, from this one).
- **File:line:** `src/lib/store.ts:30-43` (`getOrCreateDefaultStore`), specifically:
  - Line 31: `const existing = await prisma.store.findFirst({ where: { businessId } });` — both concurrent
    requests (different businesses, same computed slug) pass this individually since it's scoped by
    `businessId`, not `slug`.
  - Line 39: `const slug = await generateUniqueSlug(business.name);` — internally does
    `while (await prisma.store.findUnique({ where: { slug } })) ...` (line 18) — both requests can see the
    slug as free at the same instant.
  - **Line 41: `return prisma.store.create({ data: { businessId, name: business.name, slug } });`** — the
    losing request's `create()` throws `PrismaClientKnownRequestError` (`P2002`, unique constraint on
    `store.slug`), and **nothing catches it**. It propagates all the way up through `ProgramPage` (an async
    Server Component) and crashes that request's render.
- **Repro:** Two different businesses with the identical name and no store yet. Fire two
  `GET /dashboard/program` requests (each with its own owner's session cookie) via `Promise.all`. Repeat a
  handful of times — the window is narrow (reproduced in 1-2 of 8 attempts per run across two separate runs
  in this session). Minimal repro: `S4-store-slug/probe-sd7b.js`; suite test: `S4-store-slug/run.js` →
  `S4-007`.
- **Observed vs Expected:** Observed: HTTP status stays `200` (React has already started streaming the
  `loading.tsx` fallback before the crash), but the RSC payload for the losing request embeds a raw,
  user-facing stack trace and the string `"Switched to client rendering because the server rendering
  errored"`; that business's `store` table has **zero rows**. Captured raw payload excerpt:
  ```
  {"digest":"451871120","name":"PrismaClientKnownRequestError",
   "message":"\nInvalid `prisma.store.create()` invocation ...
   Unique constraint failed on the fields: (`slug`)",
   "stack":[["ProgramPage", ".../chunks/ssr/[root-of-the-server]__....js",291,19,289,1,true]] ...}
  ```
  Expected: exactly one of the two concurrent requests should win and get a store; the other should either
  retry with a re-computed unique slug, or be caught and gracefully re-fetch the now-existing store for its
  business (n.b. since the two businesses in this repro are *different*, "re-fetch existing store" doesn't
  even apply cleanly — the losing business genuinely needs a **new** store with a different slug, which
  means the fix has to retry slug generation, not just re-query).
- **Suggested fix:** Wrap the `findUnique`-loop-then-`create` in a retry: on `P2002` from
  `prisma.store.create()`, loop back into `generateUniqueSlug` (which will now see the just-created
  competing slug via `findUnique` and pick the next suffix) and retry the `create()` a bounded number of
  times. Alternatively, use a single upsert-style pattern or a Postgres advisory lock keyed on the base slug
  to fully serialize slug allocation.

## Notes

- This suite and S3-017 (`SD-6`) intentionally avoid interfering with each other: S3-017 pre-creates the
  store via direct DB insert before racing `createLoyaltyProgram`, specifically so its result isolates the
  `loyalty_program`-row race from this suite's `store`-row race. Both races are real and independently
  confirmed.
- Numbering/suffix values in the evidence column (e.g. `store-16`, `-4`) reflect this being a **persistent,
  shared dev DB** re-used across multiple iterations of writing/debugging this suite in the same session —
  each individual test's *pattern* assertion (not a hardcoded literal) is what was actually verified, so
  this doesn't weaken any result.
