# QA verification scripts

Re-runnable proof for the defects documented in `../QA-REPORT.md`. Committed so the
findings — especially the concurrency ones — can be reproduced rather than taken on trust.

`verify-token.mts`, `verify-i6-card-token.mts`, `verify-c1-open-redirect.mts`, and
`verify-fixes.js` run in CI on every PR (`.github/workflows/qa.yml`, `npm run qa:ci`) —
see "CI" below. `c2-two-pg-clients.mjs`, `verify-phone-migration.sh`, and `mobile-flow.mjs`
are not wired in; run them by hand per their notes.

## Setup (local)

```bash
# from the repo root, with a database running and migrations applied
npx playwright install chromium

# the scripts default to the app on :3100 and a local-Supabase-shaped DB URL —
# override both with QA_BASE_URL / QA_DB_URL env vars if yours differ
npm run dev -- -p 3100
```

Defaults: app `http://localhost:3100`, database
`postgresql://postgres:postgres@127.0.0.1:56322/postgres` (a local Supabase instance).
Both are constants at the top of `lib/harness.js`, overridable via `QA_BASE_URL` /
`QA_DB_URL` env vars (added so CI can point them at a plain Postgres service container
without editing source).

## CI

`.github/workflows/qa.yml` runs two jobs on every PR and push to `main`:

- **checks** — lint, typecheck, `next build` (no DB needed).
- **qa** — spins up a `postgres:16` service container, runs `prisma migrate deploy`,
  builds and starts the app on `:3100`, then runs `npm run qa:tokens` (the three `.mts`
  scripts — pure logic, no DB/browser) followed by `npm run qa:regression`
  (`verify-fixes.js` — the acceptance harness against the real running app + DB).

`verify-fixes.js` didn't use to fail the process on a FAIL/BLOCKED result — `summary()`
only prints. It now `process.exit(1)`s if anything didn't PASS, which is what makes it a
real CI gate instead of an always-green log.

Not run in CI, on purpose:

- **`c2-two-pg-clients.mjs`** — reproduces the undo-vs-redeem race (`H-1` in
  `QA-REPORT.md`) by hand-orchestrating the exact SQL statements each transaction issues,
  rather than calling the app. That makes it a step-by-step illustration of the
  interleaving, not a live check of the current source — it can drift silently if
  `stamp.ts`/`rewards.ts` change without this file being updated to match. The real
  concurrency proof against live code is the `H-1` check inside `verify-fixes.js`. Useful
  for understanding the bug by hand; run it manually.
- **`verify-phone-migration.sh`** — needs Docker + a specific local Supabase CLI
  container name and a hardcoded absolute repo path from the original author's machine.
  Not portable to a generic CI runner as-is.
- **`mobile-flow.mjs`** — pure evidence capture (screenshots, console errors, network
  failures) with no pass/fail assertions, and its screenshot output path is also a
  hardcoded absolute path from the original run. Good for a manual visual pass; would
  need real assertions (and a fixed output dir) before it belongs in an automated gate —
  a reasonable next step once visual regression baselines exist.

## Scripts

| Script | Covers | Needs |
| --- | --- | --- |
| `verify-fixes.js` | All 22 defects end to end — 19 runtime checks incl. the concurrency races (`C2-race` asserts a card is never REDEEMED with fewer stamps than required) and a full MVP regression | app + DB + browser |
| `verify-token.mts` | `extractCardToken` — 22 unit cases (cross-origin, charset, schemes) | `npx tsx` only |
| `verify-c1-open-redirect.mts` | `sanitizeRedirectTarget` — 2413 cases: a hand-picked matrix (tab bypass, `..` traversal family, encodings) plus a generative fuzz sweep. Asserts the **invariant** — re-resolving the returned string against a foreign origin must stay same-origin — rather than enumerating known-bad inputs, which is what let an earlier version pass while the function was still exploitable. | `npx tsx` only |
| `verify-i6-card-token.mts` | `extractCardToken` fail-closed behaviour and anchored paths | `npx tsx` only |
| `c2-two-pg-clients.mjs` | The `redeemReward` interleaving at the SQL level, with two raw `pg` clients. Note: this orchestrates statements step by step — it demonstrates the re-check, it does **not** exercise the `FOR UPDATE` lock (no transaction ever blocks). The real concurrent proof is the `C2-race` check in `verify-fixes.js`. | DB only |
| `verify-phone-migration.sh` | The phone-normalize migration, replayed on a throwaway DB: punctuation-only phones stay separate, a genuine `+63`/`63` pair merges keeping the higher-stamp card, and a second apply is a no-op. Needs Docker (uses the `supabase_db_stampmate-qa` container). | DB only |
| `mobile-flow.mjs` | Full MVP journey at 390x844 with console/network capture, dark mode, 404, pagination | app + DB + browser |

```bash
# .mts scripts import the app source relatively — run them from the repo root
npx --yes tsx qa/scripts/verify-c1-open-redirect.mts
npx --yes tsx qa/scripts/verify-token.mts
npx --yes tsx qa/scripts/verify-i6-card-token.mts

# these need playwright/pg installed alongside them
node qa/scripts/verify-fixes.js
node qa/scripts/c2-two-pg-clients.mjs
```

## Notes

- The scripts seed their own tenants with unique names, so they can run against a shared
  database without colliding — but they do write real rows. Don't point them at production.
- The race checks are probabilistic by nature. `verify-fixes.js` runs each several rounds;
  a single green run is not proof, which is why the fix round ran them three times over.
- `lib/concurrency.js` captures a real server-action POST via Playwright and replays it N
  times with `fetch`, which is what gives true simultaneity. Clicking a button N times in a
  browser does not — React serialises the action queue.
