# QA verification scripts

Re-runnable proof for the defects documented in `../QA-REPORT.md`. Committed so the
findings — especially the concurrency ones — can be reproduced rather than taken on trust.

These are deliberately **not** wired into `package.json`: they need a running app, a real
database, and a browser, so they're an acceptance harness rather than a unit-test suite.
Wiring them into CI is a reasonable follow-up but needs a decision on adding `playwright`
and `pg` as devDependencies.

## Setup

```bash
# from the repo root, with a database running and migrations applied
npm i --no-save playwright pg
npx playwright install chromium

# the scripts expect the app on :3100 and the DB URL below — override in the files if different
npm run dev -- -p 3100
```

Defaults: app `http://localhost:3100`, database
`postgresql://postgres:postgres@127.0.0.1:56322/postgres` (a local Supabase instance).
Both are constants at the top of `lib/harness.js`.

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
