# S6-card-token-security — Results

Covers `src/lib/card-token.ts` (`extractCardToken`, `generateCardToken`), `src/lib/loyalty-card.ts`, `/card/[token]`.

Test scripts:
- `<SCRATCH>/qa/S6-card-token-security/unit-matrix.mjs` — `extractCardToken`/token-entropy unit matrix, run via `npx --yes tsx` importing `src/lib/card-token.ts` directly (verified working: full source import, no re-implementation).
- `<SCRATCH>/qa/S6-card-token-security/browser.mjs` — Playwright, real HTTP against `http://localhost:3100`, real DB via `sql()`, real QR image decode via `jsqr`/`pngjs` (installed into `<SCRATCH>/qa/node_modules`, not the app repo).

One note on method for `generateCardToken`: it lives in `src/lib/loyalty-card.ts`, which has a top-level `import "server-only"` guard that throws `MODULE_NOT_FOUND` under plain `tsx`/node (confirmed by a direct-import attempt). The source was read directly and is exactly `randomBytes(24).toString("base64url")` — byte-for-byte the same algorithm as the harness's own `newCardToken()`. S6-002 exercises that identical call (`randomBytes(24).toString("base64url")`) 1000 times rather than re-implementing something different; this is a faithful proxy for `generateCardToken()`, not a guess.

## Results

| ID | Title | Priority | Status | Evidence | Notes |
|----|-------|----------|--------|----------|-------|
| S6-001 | Unknown token 404-style state | P0 | PASS | `GET /card/thisisnotarealtoken12345` → HTTP 200, body contains "Card not found", no stack trace/error-class strings. `GET /staff/cards/thisisnotarealtoken12345` unauthenticated → 307-style redirect to `/login?redirectTo=...` (not a crash). Same URL as authenticated own-business staff → HTTP 200 with clean "not found" text, no stack trace. | Both `/card/` and `/staff/cards/` unknown-token paths verified; see sub-cases S6-001b/c in script output. |
| S6-002 | Token unguessability | P1 | PASS | 1000 tokens generated via the confirmed-identical algorithm: all exactly 32 chars, all match `^[A-Za-z0-9_-]{32}$`, 0 collisions among 1000. Sample: `PqP4RbicDpWBe4ECGBDm9FDlOPIZlBlb`, `syki_pzwXfl1cENRujlEwGEiqVFUYG8g`, ... | `randomBytes(24)` = 192 bits entropy, base64url of 24 bytes = exactly 32 chars (no padding, 192/6=32). Not derived from customer data — confirmed by code read (`generateCardToken()` takes no arguments). |
| S6-003 | No PII in customer card page/QR | P0 | PASS | Seeded a real customer with phone `09171234567`, real owner email, and captured `business.id`/`program.id`/`customer.id`. Loaded `/card/<token>`, fetched full page HTML (includes any embedded RSC flight/`__next_f.push` script data since `page.content()` returns the complete document). None of phone, owner email, customer id, business id, or program id appear anywhere in the HTML. Customer *name* does render (expected, not PII per spec). | Confirms `getCustomerCardByToken`'s select-list (`src/lib/loyalty-card.ts:15-40`) only returns name/store/program/reward/counts. |
| S6-003 (QR decode) | No PII in QR payload | P0 | PASS | Extracted the `<img alt="Your personal QR code">` `data:image/...` URI from the rendered page, decoded the actual PNG pixels with `jsqr`, and recovered the literal encoded string: `http://localhost:3100/staff/cards/CiBvLr4mkHR5WU5WSLxW-J-aU56CGlet` (real token, real run). Contains only the token; does not contain phone/email/customer id/business id/program id. | This is a genuine pixel-level QR decode of the rendered image, not just a code read. Matches `src/app/card/[cardToken]/page.tsx:27` (`staffCardUrl = ${getAppUrl()}/staff/cards/${card.cardToken}`) passed into `CustomerQRCode`→`QRCodeImage`→`QRCode.toDataURL(value,...)` (`src/components/qr-code-image.tsx:12`) with no other data merged in. |
| S6-004 | Staff lookup includes businessId but page still authorizes | P1 | PASS | Logged in as the card's own-business owner, loaded `/staff/cards/<token>`, fetched full HTML. `business.id`, `customer.id`, `program.id`, phone, and owner email do not appear anywhere in the rendered HTML. | `getStaffCardByToken` (`src/lib/loyalty-card.ts:49-91`) returns `businessId` in its JS return value for server-side `requireBusinessAccess` use only; confirmed it is never serialized into the client-visible HTML/RSC payload. |
| S6-005 | extractCardToken: full `/card/` URL | P1 | PASS | `extractCardToken("https://app.test/card/ABC12345")` → `"ABC12345"`. |  |
| S6-006 | extractCardToken: full `/staff/cards/` URL | P1 | PASS | `extractCardToken("https://app.test/staff/cards/XYZ98765")` → `"XYZ98765"`. Also verified staff-pattern precedence when a URL superficially also contains `/card/` in its query string — still correctly matches `/staff/cards/` first. |  |
| S6-007 | extractCardToken: raw valid token | P1 | PASS | `extractCardToken("aB3_-xY7long32charstring________")` → returned unchanged. |  |
| S6-008 | extractCardToken: raw token < 8 chars | P1 | PASS | 6-char `"abc123"` → `null`. Also checked the exact boundary: 7 chars → `null`, 8 chars → accepted. | Confirms the `{8,}` boundary is exactly at 8, not off-by-one. |
| S6-009 | extractCardToken: invalid chars in raw token | P1 | PASS | `extractCardToken("abc!@#$%^&*")` → `null`. |  |
| S6-010 | extractCardToken: URL-encoded token in path | P2 | PASS | `extractCardToken("https://app.test/card/AB%2DCD1234")` → `"AB-CD1234"`. |  |
| S6-011 | extractCardToken: malformed percent-encoding | P2 | PASS | `extractCardToken("https://app.test/card/%E0%A4%A")` → `null`, no unhandled exception/crash of the test process. |  |
| S6-012 | extractCardToken: whitespace / empty | P2 | PASS | `""` → `null`, `"   "` → `null`, `"\n\t"` → `null`. |  |
| S6-013 | extractCardToken: `javascript:` and exotic schemes | P1 | PASS | `"javascript:alert(1)"` → `null`, `"data:text/html,x"` → `null`, `"file:///etc/passwd"` → `null`, `"mailto:a@b.com"` → `null`. No scheme ever passes through. |  |
| S6-014 | **[SUSPECTED DEFECT SD-3]** cross-origin card URL accepted | P1 | PASS (confirms SD-3) | `extractCardToken("https://evil.com/card/REALTOKEN32charslongtoken123456")` → `"REALTOKEN32charslongtoken123456"` (returned, origin never checked). Also exercised live in the browser at the UI layer (S12-009): pasting `https://evil.com/card/<realTokenA>` into the staff manual-entry field and clicking Go **did navigate** to `/staff/cards/<realTokenA>`. | **CONFIRMED, not refuted.** See Defects below. Real-world impact assessed: limited but non-zero — see Defects section. |
| S6-015 | **[SUSPECTED DEFECT SD-10]** URL path token skips length/charset check | P2 | PASS (confirms SD-10) | `extractCardToken("https://app.test/card/x")` → `"x"` (1 char, returned unchecked). `extractCardToken("https://app.test/card/a b")` → `"a b"` (contains a space, returned unchecked). Neither is validated against the `{8,}`/charset regex that raw tokens must pass. | **CONFIRMED.** Downstream DB lookup (`findUnique({where:{cardToken}})`) simply won't find a matching row for junk-short tokens, so it degrades gracefully to "Card not found" today — but the validation asymmetry is real. See Defects below. |
| S6-016 | extractCardToken: query string & fragment ignored | P2 | PASS | `extractCardToken("https://app.test/card/TOKEN12345?ref=x#frag")` → `"TOKEN12345"`. |  |
| S6-017 | extractCardToken: trailing slash / nested path | P2 | PASS | `.../card/TOKEN12345/extra` → `"TOKEN12345"`; `.../card/TOKEN12345/` → `"TOKEN12345"`. |  |
| S6-018 | extractCardToken: non-URL junk string | P2 | PASS | `extractCardToken("hello world this is not a token")` → `null` (has spaces, fails raw-token charset check). |  |

**Totals: 18/18 PASS, 0 FAIL, 0 BLOCKED, 0 NOT-RUN.**

(Two suspected defects were the subject of dedicated cases: SD-3 in S6-014, SD-10 in S6-015 — both **confirmed** with hard evidence, not refuted.)

## Defects

### Defect 1 — SD-3: `extractCardToken` accepts a card path from any origin
- **Severity:** Low (assessed; see impact analysis below — priority in the test plan is P1 but real-world exploitability is limited)
- **Test case ID(s):** S6-014, S12-009 (S6/S12 cross-reference)
- **File:line:** `src/lib/card-token.ts:12-17`
  ```ts
  const url = new URL(trimmed);
  const match =
    url.pathname.match(/\/staff\/cards\/([^/]+)/) ??
    url.pathname.match(/\/card\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
  ```
  `url.origin` is never compared against `getAppUrl()` (`src/lib/url.ts:1-3`) or any allowlist.
- **Repro:** `npx --yes tsx` script calling `extractCardToken("https://evil.com/card/REALTOKEN32charslongtoken123456")` → returns the token. Live UI repro: on `/staff/scan`, type `https://evil.com/card/<realtoken>` into the manual-entry field and click Go — the app navigates to `/staff/cards/<realtoken>` (verified in this session, S12-009).
- **Observed vs Expected:** Observed: any domain hosting a path shaped like `/card/<token>` or `/staff/cards/<token>` is honored — a phishing page at `evil.com` could embed a real token in its URL and get scanned/pasted successfully. Expected (per test plan): restrict to the app's own origin, or explicitly document the accepted decision.
- **Impact assessment (requested by briefing):** Real-world severity is low-moderate, not critical, because: (1) the token itself is still the real, unguessable 192-bit token — this bug does not let an attacker forge or guess tokens, it only affects *where the token string is allowed to come from*; (2) every downstream use (`/staff/cards/[token]`) re-checks `requireBusinessAccess()` server-side (confirmed working in S12-005/S12-005b: cross-business tokens are blocked regardless of scan origin); (3) the exploitable scenario is narrow — an attacker would need to already possess a valid token (e.g., by shoulder-surfing a customer's own QR) and then trick staff into scanning/pasting a spoofed link containing it, which offers no additional capability over just handing staff the real QR/token directly. The main residual risk is UX/trust (a malicious "StampMate" clone page on another domain feels legitimate) rather than an access-control bypass.
- **Suggested fix:** When `url.protocol` is `http:`/`https:`, additionally compare `url.origin === new URL(getAppUrl()).origin` before accepting the match; reject otherwise. Keep raw-token acceptance unchanged.

### Defect 2 — SD-10: URL-derived tokens skip the raw-token `{8,}` charset/length validation
- **Severity:** Low
- **Test case ID(s):** S6-015
- **File:line:** `src/lib/card-token.ts:12-21` — the `try` branch (URL path) returns `decodeURIComponent(match[1])` unconditionally, while only the `catch` branch (non-URL raw token) applies `/^[A-Za-z0-9_-]{8,}$/.test(trimmed)`.
- **Repro:** `extractCardToken("https://app.test/card/x")` → `"x"`; `extractCardToken("https://app.test/card/a b")` → `"a b"` (both bypass the charset/length check a raw token would be held to).
- **Observed vs Expected:** Observed: a 1-character or space-containing token extracted from a URL path is returned as-is. Expected: the same `{8,}` charset validation applied to raw tokens should also apply to URL-derived tokens, for consistency.
- **Impact assessment:** Not currently exploitable — the resulting bogus token is passed to `getCustomerCardByToken`/`getStaffCardByToken`, which do an exact-match Prisma `findUnique` and simply return `null` for a token that can't exist in the DB (real tokens are always 32 chars from `generateCardToken()`), degrading gracefully to the existing "Card not found" state (confirmed in S6-001). This is purely a validation-consistency / defense-in-depth gap, not a functional bug today.
- **Suggested fix:** Apply the same `/^[A-Za-z0-9_-]{8,}$/` test to the URL-path-extracted value before returning it, mirroring the raw-token branch.
