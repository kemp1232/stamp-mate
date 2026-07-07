# StampMate — Project Guidance

## 1. Project Summary

StampMate is a QR-based customer loyalty stamp web app for small businesses.

For the MVP, business owners and staff log in, but customers do not need accounts. Customers join from a store QR code, receive a unique card link, and use a personal QR code for staff to add stamps or redeem rewards.

## 2. Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase Postgres
- Prisma
- Better Auth
- qrcode
- html5-qrcode
- Vercel

## 3. Core MVP Rule

Before adding any feature, check if it supports the MVP success flow.

```txt
Business owner registers
Business creates loyalty program
Business prints/displays join QR
Customer scans join QR
Customer gets personal QR card
Staff scans customer QR
Staff adds stamp
Customer reaches required stamps
Staff redeems reward
Customer starts new card cycle
```

If a feature is not required for this flow, move it to the post-MVP backlog.

## 4. Development Workflow

Follow `/ai-agents/development-loop.md` for the development loop.

Loop summary:

```txt
Plan → Design Data → Define Checklist → Implement Backend → Implement Frontend → Test → Review Security and Scope → Clean Up → Commit
```

## 5. Agent References

- Planning: `/ai-agents/product-planner.md`
- Database: `/ai-agents/database-architect.md`
- Auth/security: `/ai-agents/auth-security.md`
- Frontend: `/ai-agents/frontend-ui.md`
- Backend: `/ai-agents/backend-feature.md`
- QA/testing: `/ai-agents/qa-test.md`
- Development loop: `/ai-agents/development-loop.md`

## 6. MVP Restrictions

Do not build these for the MVP:

- SMS OTP
- Email marketing
- Payment integration
- POS integration
- Complex multi-branch support
- Apple Wallet / Google Wallet
- Customer password login
- AI insights
- Advanced analytics
- Subscription billing

## 7. Coding Rules

- Keep tasks small.
- Prefer simple implementation over perfect abstraction.
- Implement backend logic before frontend UI.
- Use TypeScript.
- Use Zod for input validation.
- Use Prisma for database access.
- Do not add non-MVP features without asking.
- Do not create app features when only documentation is requested.

## 8. Security Rules

- Enforce authorization on the server.
- Staff-only actions must require authenticated staff.
- Customers cannot add stamps to themselves.
- Do not expose customer phone numbers or emails in QR codes.
- QR codes should contain only random tokens or URLs with random tokens.
- Staff can only access customers, cards, stamps, and redemptions from their own business/store.
- Log stamp and redemption actions with the staff user ID.

## 9. UI Rules

- Mobile-first.
- Keep screens simple for non-technical users.
- Use shadcn/ui where appropriate.
- Staff buttons should be large and easy to tap.
- Customer card should be screenshot-friendly.
- Always include loading, empty, and error states where useful.

## 10. Testing Rules

- Test the happy path for every feature.
- Test route protection.
- Test cross-business data isolation.
- Test QR token flows.
- Test mobile usability.
- Run lint/typecheck/build when available.
