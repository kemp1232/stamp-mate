# StampMate

QR-based digital loyalty stamp cards for small businesses. Business owners register, set up a loyalty program, and print a join QR code. Customers scan it to get a digital stamp card — no account or password needed. Staff scan the customer's personal QR to add stamps and redeem rewards.

## Tech stack

- Next.js App Router + TypeScript
- Tailwind CSS + shadcn/ui
- Prisma + Supabase Postgres
- Better Auth (business owner/staff accounts)
- `qrcode` (generate QR codes) + `html5-qrcode` (staff camera scanner)

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (or any Postgres database)

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the values (see below).

3. Apply the database schema:

   ```bash
   npm run db:migrate
   ```

4. Start the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Environment variables

See `.env.example` for the full list with descriptions. In short:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Postgres connection (used by the app at runtime) |
| `DIRECT_URL` | Direct Postgres connection (used by `prisma migrate`) |
| `BETTER_AUTH_SECRET` | Random secret signing session cookies — generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | The app's own base URL (also used to build QR code links) |

Get `DATABASE_URL`/`DIRECT_URL` from your Supabase project's **Project Settings → Database → Connection string**.

## Useful scripts

```bash
npm run dev          # start the dev server
npm run build        # production build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run db:migrate   # create + apply a migration (local dev)
npm run db:deploy    # apply existing migrations without creating new ones (production)
npm run db:studio    # browse the database with Prisma Studio
npx prisma validate  # validate the Prisma schema
```

## Deploying to Vercel

1. Push the repo to GitHub and import it into Vercel.
2. Set the environment variables above in the Vercel project settings — use your **production** Supabase credentials and set `BETTER_AUTH_URL` to your deployed domain (e.g. `https://your-app.vercel.app`), not `localhost`.
3. Run `npm run db:deploy` against your production database once (locally, with production env vars loaded, or via a one-off Vercel deploy step) to apply migrations before the first deploy.
4. Deploy. `postinstall` runs `prisma generate` automatically as part of the build, so no extra build command configuration is needed.

## Project structure

```
prisma/schema.prisma        Database schema and migrations
src/app/                    Routes (App Router)
src/app/dashboard/          Owner-only: loyalty program, customers, stats
src/app/join/[storeSlug]/   Public: customer join flow
src/app/card/[cardToken]/   Public: customer's digital stamp card
src/app/staff/              Staff-only: QR scanner, customer card, stamp/redeem actions
src/lib/actions/            Server actions (mutations)
src/lib/                    Auth, authorization, and query helpers
src/components/             Shared UI components
```
