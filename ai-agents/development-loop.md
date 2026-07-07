# StampMate — AI Development Loop

## 1. Purpose

This file defines the repeatable development workflow for StampMate, a QR-based customer loyalty stamp web app for small businesses.

Use this loop to:

- Keep scope small
- Avoid overengineering
- Use the right agent at the right time
- Build feature by feature
- Review before moving forward
- Keep the app working after every milestone

## 2. Development Loop Overview

Every milestone should go through this loop before starting the next milestone:

```txt
1. Plan
2. Design Data
3. Define Implementation Checklist
4. Implement Backend
5. Implement Frontend
6. Test
7. Review Security and Scope
8. Clean Up
9. Commit
```

## 3. Step 1: Plan

Responsible agent:

```txt
Product Planner Agent
```

Goal:

```txt
Convert the milestone into small, clear implementation tickets.
```

Prompt template:

```txt
You are the Product Planner Agent.

We are working on this milestone:

[PASTE MILESTONE NAME + DESCRIPTION]

Break this milestone into small implementation tickets.

For each ticket, include:
- Goal
- User story
- Scope
- Out of scope
- Acceptance criteria
- Edge cases

Do not add non-MVP features.
Keep the tasks small enough for one focused coding session.
```

Done when:

- The milestone is broken into clear tasks
- Every task has acceptance criteria
- Non-MVP features are excluded

## 4. Step 2: Design Data

Responsible agent:

```txt
Database Architect Agent
```

Goal:

```txt
Check if the current Prisma schema supports the milestone.
```

Prompt template:

```txt
You are the Database Architect Agent.

We are working on this milestone:

[PASTE MILESTONE NAME]

Here are the planned tickets:

[PASTE TICKETS]

Review the current Prisma schema and decide if changes are needed.

For any needed changes, provide:
- Models changed
- Fields added
- Relationships
- Indexes
- Constraints
- Prisma schema changes
- Migration notes
- Data safety notes

Keep the schema simple and MVP-focused.
```

Done when:

- Required schema changes are clear
- Relationships are defined
- Constraints are included
- Migration plan is ready

## 5. Step 3: Define Implementation Checklist

Responsible agent:

```txt
Product Planner Agent or Main Developer
```

Goal:

```txt
Turn the milestone into an ordered coding checklist.
```

Prompt template:

```txt
Create an implementation checklist for this milestone.

Use this format:

## Backend Tasks
- [ ] ...

## Frontend Tasks
- [ ] ...

## Auth/Security Tasks
- [ ] ...

## QA Tasks
- [ ] ...

Keep the checklist ordered so I can implement from top to bottom.
```

Done when:

- The checklist is ordered
- Backend, frontend, auth, and QA tasks are separated
- The checklist can be followed directly in code

## 6. Step 4: Implement Backend

Responsible agent:

```txt
Backend Feature Agent
```

Goal:

```txt
Implement server-side logic first.
```

Prompt template:

```txt
You are the Backend Feature Agent.

Implement this backend task:

[PASTE TASK]

Use:
- Next.js App Router
- TypeScript
- Prisma
- Zod validation
- Server actions or route handlers where appropriate

Follow these rules:
- Validate all inputs
- Enforce authorization on the server
- Keep business logic simple
- Do not add non-MVP features
- Return clear success and error states

Before coding, explain the files you will change.
After coding, summarize what changed and how to test it.
```

Backend implementation order:

```txt
1. Prisma schema changes
2. Database migration
3. Validation schemas
4. Server actions / route handlers
5. Query helpers
6. Authorization checks
7. Basic error handling
```

Done when:

- Backend logic works
- Inputs are validated
- Authorization is enforced
- Errors are handled clearly

## 7. Step 5: Implement Frontend

Responsible agent:

```txt
Frontend UI Agent
```

Goal:

```txt
Build UI after backend behavior exists.
```

Prompt template:

```txt
You are the Frontend UI Agent.

Implement this frontend task:

[PASTE TASK]

Use:
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui

Follow these rules:
- Mobile-first
- Simple language
- Clear loading states
- Clear empty states
- Clear error states
- Do not add non-MVP features

Before coding, explain the files you will change.
After coding, summarize what changed and how to test it.
```

Frontend implementation order:

```txt
1. Page route
2. Reusable components
3. Form UI
4. Server action integration
5. Loading state
6. Empty state
7. Error state
8. Mobile polish
```

Done when:

- UI works on mobile
- Forms connect to backend
- States are handled
- User can complete the intended flow

## 8. Step 6: Test

Responsible agent:

```txt
QA / Test Agent
```

Goal:

```txt
Test the feature manually and with automated tests where practical.
```

Prompt template:

```txt
You are the QA / Test Agent.

Create a test plan for this completed task:

[PASTE TASK OR FEATURE]

Include:
- Happy path
- Edge cases
- Security checks
- Mobile checks
- Regression checks
- Expected results

Also suggest any simple automated tests worth adding.
```

Manual test checklist:

```txt
- Does the happy path work?
- Are required fields validated?
- Are errors understandable?
- Are protected routes protected?
- Can users access only their own business data?
- Does the UI work on mobile?
- Does the feature break any previous flow?
```

Done when:

- Happy path passes
- Main edge cases pass
- Security checks pass
- No obvious regression exists

## 9. Step 7: Review Security and Scope

Responsible agent:

```txt
Auth & Security Agent
```

Goal:

```txt
Review correctness, security, and scope.
```

Prompt template:

```txt
You are the Auth & Security Agent.

Review this completed implementation:

[PASTE SUMMARY OR DIFF]

Check for:
- Missing server-side authorization
- Customer data exposure
- Unsafe QR token usage
- Cross-business access bugs
- Missing validation
- Non-MVP scope creep
- Risky assumptions

Return:
- Must fix
- Should fix
- Nice to have later
```

Done when:

- Must-fix issues are resolved
- Security rules are followed
- No non-MVP features were added accidentally

## 10. Step 8: Clean Up

Responsible agent:

```txt
Main Developer
```

Goal:

```txt
Clean up the code before committing.
```

Cleanup checklist:

```txt
- Remove unused code
- Remove console logs
- Rename unclear variables
- Extract repeated UI pieces
- Check TypeScript errors
- Run formatter
- Run linter
- Run tests
- Confirm app still runs
```

Suggested commands:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Only use commands that exist in the project.

Done when:

- Code is clean
- No obvious dead code
- TypeScript passes
- Build passes if available

## 11. Step 9: Commit

Responsible agent:

```txt
Main Developer
```

Goal:

```txt
Save a clean checkpoint.
```

Commit message examples:

```txt
feat: add business registration
feat: create loyalty program setup
feat: add customer join flow
feat: add customer digital card
feat: add staff QR scanner
feat: add stamp flow
feat: add reward redemption
fix: prevent stamps beyond required count
chore: clean up dashboard components
```

Done when:

- Changes are committed
- The app is still working
- The milestone checklist is updated

## 12. Per-Milestone Loop Guide

Use the full development loop for each milestone below.

## Phase 1: Foundation

### Milestone 1: Project Setup

Focus on:

```txt
- Next.js setup
- Tailwind setup
- shadcn/ui setup
- Prisma setup
- Supabase Postgres connection
- Project folder structure
```

### Milestone 2: Business and Staff Auth

Focus on:

```txt
- Better Auth setup
- Register
- Login
- Logout
- Protected dashboard routes
- Business owner role
- Staff membership model
```

### Milestone 3: Loyalty Program Setup

Focus on:

```txt
- Business/store setup
- Create loyalty program
- Edit loyalty program
- Required stamps
- Reward details
- Active/inactive status
```

## Phase 2: Customer Card

### Milestone 4: Store Join QR

Focus on:

```txt
- Store join link
- Store join QR generation
- Public join page
- Customer form
- Customer record creation
```

### Milestone 5: Customer Digital Stamp Card

Focus on:

```txt
- Customer card token
- Public card page
- Stamp progress display
- Personal customer QR
- Screenshot-friendly layout
```

## Phase 3: Staff Operations

### Milestone 6: Staff QR Scanner

Focus on:

```txt
- Staff scan page
- Camera QR scanner
- Open scanned customer card
- Manual fallback search
```

### Milestone 7: Add Stamp Flow

Focus on:

```txt
- Add stamp button
- Stamp history
- Prevent over-stamping
- Mark card as completed
- Undo last stamp
```

### Milestone 8: Reward Redemption

Focus on:

```txt
- Redeem reward button
- Redemption confirmation
- Redemption record
- Mark old card as redeemed
- Create new active card cycle
```

## Phase 4: Launch Readiness

### Milestone 9: Dashboard and Analytics

Focus on:

```txt
- Total customers
- Total stamps
- Total redemptions
- Recent activity
- Customer list
```

### Milestone 10: Polish, Security, and Deployment

Focus on:

```txt
- Mobile polish
- Loading states
- Empty states
- Error states
- Access control review
- Production environment variables
- Vercel deployment
```

## 13. Daily Development Flow

```txt
1. Pick one milestone
2. Pick one ticket only
3. Ask the relevant agent to clarify the task
4. Implement backend first
5. Implement frontend second
6. Test the happy path
7. Fix obvious issues
8. Commit
```

End-of-session progress note template:

```md
## Progress Today

### Completed

-

### Tested

-

### Issues Found

-

### Next Task

-
```

## 14. Scope Control Rule

Before accepting any new idea, ask: Is this required for the MVP success flow?

MVP success flow:

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

If the idea is not required for that flow, move it to the Post-MVP Backlog.

## 15. Post-MVP Backlog

```txt
- SMS OTP
- Email reminders
- Marketing campaigns
- Payment integration
- POS integration
- Multiple branch complexity
- Apple Wallet / Google Wallet
- Customer password login
- AI insights
- Advanced analytics
- Subscription billing
- Promo campaigns
- Customer segmentation
```

## 16. Recommended First Ticket

```txt
Milestone 1: Project Setup
Ticket: Initialize Next.js app with TypeScript, Tailwind CSS, shadcn/ui, Prisma, and Supabase Postgres.
```

Acceptance criteria:

```txt
- App runs locally
- Tailwind styles work
- shadcn/ui is installed
- Prisma is configured
- Supabase Postgres connection works
- First Prisma migration runs successfully
- Basic home page loads
```
