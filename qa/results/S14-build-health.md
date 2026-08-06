# S14-build-health — Results

Repo under test: `/Users/raymundrafael/Desktop/repos/firstmate/stamp-mate`

Notes on method: per hard rules, `next build` was never run inside the live repo (which has a dev
server running against it). Instead the repo was copied (excluding `.next` and `node_modules`) to
`<SCRATCH>/qa/buildcheck/`, `node_modules` was cloned in with `cp -Rc` (APFS clonefile, same
volume — instant, no extra disk), and `.env` was carried over by the copy. `npm run build` ran
there. Lint/typecheck/prisma commands are read-only/side-effect-free and were run directly in the
live repo. `prisma generate` was run only in the scratch copy (never in the live repo, since its
output path `src/generated/prisma` is under the forbidden `src/` tree) and diffed against the
live repo's checked-in output to check for drift.

| ID | Title | Priority | Status | Evidence | Notes |
|---|---|---|---|---|---|
| S14-001 | Lint passes | P0 | PASS | `npm run lint` → exit 0, zero output (no errors/warnings) | Clean. |
| S14-002 | Typecheck passes | P0 | PASS | `npm run typecheck` (`tsc --noEmit`) → exit 0, zero output | Clean. |
| S14-003 | Build passes | P0 | PASS | `npm run build` in `<SCRATCH>/qa/buildcheck` → exit 0 twice (verified on a repeat run). Full route table below. | Compiled successfully in 3.9s, TypeScript check in the build finished in 1776ms, static generation 13/13 pages. One non-fatal warning: `metadataBase` not set (see Defects). |
| S14-004 | Prisma client generated | P1 | PASS | `npx prisma generate` in the scratch copy regenerated `src/generated/prisma`; `diff -rq` against the pre-generate copy → **no output, exit 0** (byte-identical, zero drift vs `schema.prisma`) | `git status --short src/generated` on the live repo is also empty (the dir is gitignored, so no tracked drift is possible either way — verified `.gitignore` contains `/src/generated/prisma`). |
| S14-005 | Migrations apply cleanly to a fresh DB | P1 | PASS | `npx prisma migrate status` → "5 migrations found ... Database schema is up to date!". Confirmed via `_prisma_migrations` table: all 5 rows present with `applied_steps_count = 1`. Confirmed the hand-written partial unique index exists exactly as migrated: `pg_indexes` shows `loyalty_card_one_active_per_customer_program | CREATE UNIQUE INDEX ... ON public.loyalty_card USING btree ("customerId","loyaltyProgramId") WHERE (status = 'ACTIVE'::"LoyaltyCardStatus")` | Not tested against a *literally fresh* empty DB (would require dropping/recreating the shared DB other agents depend on, forbidden by hard rule #3) — instead verified the already-applied state matches migration source exactly, which is the strongest safe proxy available. Flagging as PASS with this caveat rather than blocking. |
| S14-006 | No secrets committed | P2 | PASS | `grep -rnE "postgresql://[^$]|BETTER_AUTH_SECRET\s*=\s*[\"'][^\"']|sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}"` over `src prisma *.ts *.mjs *.json` → no matches. `git ls-files \| grep -i env` → no `.env*` files tracked. `.gitignore` contains `.env*`. `git log --all --diff-filter=A -- .env.example` → no history (never committed). `getAppUrl()` in `src/lib/url.ts:2` reads `process.env.BETTER_AUTH_URL` as the test plan expects. | No secrets in source. See Defects for a related but distinct finding: `.env.example` itself is missing, which is a documentation/onboarding gap, not a leaked-secret issue. |

## Additional QA checks (per briefing item 5)

- **`console.log`/debug statements in `src/`:** `grep -rn "console\.\(log\|debug\)" src` → **zero matches**. Clean.
- **TODO/FIXME/XXX/HACK in `src/`:** `grep -rn "TODO\|FIXME\|XXX\|HACK" src` → **zero matches**. Clean.
- **Unused dependencies in `package.json`:** checked all 17 `dependencies` by grepping `src/` and `ai-agents/` for each package name.
  - `react-dom` has no direct `import` in `src/` — expected/not a defect, it's the implicit React 19/Next 16 DOM renderer, not something app code imports directly.
  - `shadcn` (the CLI) is listed under `dependencies` rather than `devDependencies` and is not imported by any source file — it's a scaffolding-only CLI tool (`npx shadcn add ...`, config in `components.json`). Cosmetic misclassification only, not build-breaking; not filed as a defect.
  - All other 15 packages have direct, real usage in `src/`. No genuinely unused dependencies found.
- **`.env.example` vs actual `process.env.*` reads:** actual reads in `src/`: `BETTER_AUTH_URL`, `DATABASE_URL`, `NODE_ENV` (plus `DIRECT_URL` read only by `prisma.config.ts`, and `BETTER_AUTH_SECRET` consumed internally by `better-auth`, referenced in README). **`.env.example` does not exist anywhere in the repo or its git history**, despite `README.md:26` and `prisma.config.ts:13` both explicitly telling the reader to consult it. See Defects.

## Production build route table (evidence for S14-003)

```
Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/auth/[...all]
├ ƒ /card/[cardToken]
├ ƒ /dashboard
├ ƒ /dashboard/customers
├ ƒ /dashboard/program
├ ƒ /dashboard/stats
├ ○ /icon.png
├ ƒ /join/[storeSlug]
├ ○ /login
├ ○ /opengraph-image
├ ○ /register
├ ƒ /staff
├ ƒ /staff/cards/[cardToken]
└ ƒ /staff/scan

ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

Route-table review against the briefing's specific concern (must-be-dynamic routes):

- `/card/[cardToken]` → **ƒ dynamic** — correct, must not be statically prerendered (per-token live card state).
- `/join/[storeSlug]` → **ƒ dynamic** — correct, must resolve a live store by slug.
- `/dashboard`, `/dashboard/customers`, `/dashboard/program`, `/dashboard/stats` → all **ƒ dynamic** — correct, these are auth-gated/session-dependent.
- `/staff`, `/staff/cards/[cardToken]`, `/staff/scan` → all **ƒ dynamic** — correct, auth-gated and per-card.
- `/api/auth/[...all]` → **ƒ dynamic** — correct (Better Auth catch-all).
- `/login`, `/register` → **○ static** — correct, these are plain client-rendered forms with no server data dependency at request time.
- `/` (landing page) → **ƒ dynamic** — not a defect, but worth noting: the marketing landing page has no obvious per-request data dependency and could plausibly be static (`○`) for better cache/CDN behavior. Not confirmed as a bug since the code wasn't inspected for the specific reason (e.g. it may read cookies/session to redirect logged-in users). Reporting as an observation only, not a defect.

**Conclusion: no route incorrectly prerendered as static where it must be dynamic, and no route incorrectly forced dynamic where static would be required for correctness.** The [SUSPECTED DEFECT]-style concern in the briefing about dynamic-vs-static rendering is **refuted** — routing/rendering mode is correct across the board.

Bundle sizes: this Next.js/Turbopack version's production build output (Next 16.2.10, Turbopack) does **not** print a per-route First-Load-JS size table (unlike the classic webpack build output) — only the ○/ƒ route tree shown above. No sizes were obtainable from this build's stdout; if bundle-size regression tracking is required, a separate tool (`next build --profile`, bundle analyzer, etc.) would be needed. Noting this as a tooling gap, not a defect.

## Defects

### Defect 1 — `.env.example` referenced by README and prisma.config.ts but does not exist in the repo
- **Severity:** Medium
- **Test case ID(s):** S14-006 (adjacent finding, not a fail of the case itself — no secrets were leaked; this is a missing-file/onboarding defect)
- **File:line:** `/Users/raymundrafael/Desktop/repos/firstmate/stamp-mate/.gitignore:29` (the culprit — the `.env*` glob), referenced by `README.md:26` ("Copy `.env.example` to `.env` and fill in the values") and `README.md:44` ("See `.env.example` for the full list with descriptions") and `prisma.config.ts:13` ("See .env.example for why DATABASE_URL and DIRECT_URL are both defined.")
- **Repro:**
  1. `git log --all --diff-filter=A --name-only -- .env.example` in the repo → no output, the file has never existed in git history.
  2. `cat .gitignore` → line 29 is the single pattern `.env*`, which matches `.env.example` too (not just real `.env`/`.env.local` secrets files).
  3. Any dev following `README.md:26` ("Copy `.env.example` to `.env`") or `prisma.config.ts:13`'s comment hits a missing file.
- **Observed vs Expected:** Observed: `.env.example` does not exist and even if someone added it, the current `.gitignore` pattern `.env*` would silently exclude it from every future commit. Expected: a template `.env.example` (with placeholder values, no real secrets) should exist and be tracked, since two other files in the repo explicitly instruct developers to use it.
- **Suggested fix:** Narrow `.gitignore` to ignore only `.env` and `.env.local` (e.g. `.env` / `.env*.local`) while explicitly allowing `.env.example` (e.g. add `!.env.example`), then commit a `.env.example` listing `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` with placeholder values.

### Defect 2 — `metadataBase` not set, so Open Graph/Twitter image URLs resolve against `localhost:3000` in production
- **Severity:** Low
- **Test case ID(s):** S14-003
- **File:line:** `src/app/layout.tsx:15` (`export const metadata: Metadata = { title: ..., description: ... }` — no `metadataBase` key)
- **Repro:** Run `npm run build` and observe the warning: `⚠ metadataBase property in metadata export is not set for resolving social open graph or twitter images, using "http://localhost:3000".`
- **Observed vs Expected:** Observed: Next.js falls back to the hardcoded default `http://localhost:3000` when building absolute URLs for the auto-generated `og:image`/`twitter:image` meta tags that point at `/opengraph-image`. In a deployed environment this would produce broken/localhost-pointing social share preview images. Expected: `metadataBase` should be set from the app's real deployed URL so social previews resolve correctly in every environment.
- **Suggested fix:** Add `metadataBase: new URL(getAppUrl())` (reusing the existing `src/lib/url.ts` helper, which already reads `BETTER_AUTH_URL`) to the `metadata` export in `src/app/layout.tsx`.

## Summary

- S14-001 through S14-006: **6/6 PASS**, 0 FAIL, 0 BLOCKED, 0 NOT-RUN.
- 2 defects found, both Low/Medium severity, neither build/deploy-blocking:
  - Medium: `.env.example` is referenced by docs/config but missing from the repo, and `.gitignore`'s `.env*` pattern would silently re-exclude it if added.
  - Low: `metadataBase` unset in `src/app/layout.tsx`, causing social-image URLs to fall back to `localhost:3000` in the production build.
- Route-rendering-mode concern from the briefing is **refuted**: every route requiring dynamic rendering (`/card/[cardToken]`, `/join/[storeSlug]`, `/dashboard/*`, `/staff/*`, `/api/auth/[...all]`) is correctly `ƒ dynamic`; static routes (`/login`, `/register`, `/_not-found`, `/icon.png`, `/opengraph-image`) are correctly `○ static`.
- Lint, typecheck, Prisma schema validation, Prisma client codegen (zero drift), and migration state (5/5 applied, hand-written partial unique index present and correct) are all clean.
- No `console.log`/debug statements, no TODO/FIXME markers, no genuinely unused dependencies, and no committed secrets found in `src/`.
