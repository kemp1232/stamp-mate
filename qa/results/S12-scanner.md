# S12-scanner — Results

Covers `src/components/scanner-panel.tsx`, `/staff/scan`.

Test scripts (all in `<SCRATCH>/qa/S12-scanner/`):
- `seed.mjs` — seeds two isolated tenants (Business A: our own staff logs in here; Business B: a foreign tenant) via the harness, writes `tenants.json` with real card tokens.
- `gen-qr.mjs` — generates real QR PNGs with the `qrcode` npm package (installed into `<SCRATCH>/qa/node_modules`, not the app repo) encoding: (1) `http://localhost:3100/staff/cards/<Business A token>`, (2) `http://localhost:3100/staff/cards/<Business B token>`, (3) `https://example.com` (non-card content).
- Those PNGs were converted to Chromium fake-camera-capture `.y4m` files with `ffmpeg` (`assets/*.y4m`).
- `run.mjs` — the actual Playwright suite. Camera tests launch Chromium with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=<file>.y4m`, which streams a real, decodable QR image into `navigator.mediaDevices.getUserMedia()` exactly as a real camera would. This gives genuine end-to-end coverage of the camera → `html5-qrcode` decode → `extractCardToken` → `router.push` pipeline, verified with a standalone probe (`probe-fakecam.mjs`) before building the full suite. Permission-denied/no-device tests override `navigator.mediaDevices.getUserMedia` via `page.addInitScript` to reject with a real `DOMException("...", "NotAllowedError")` / `"NotFoundError"`, exercising the app's own `catch()` branching logic in `scanner-panel.tsx:83-89`.

All cases below were executed for real against the running app at `http://localhost:3100` with a real Postgres-backed session; nothing was stubbed at the application-code level.

## Results

| ID | Title | Priority | Status | Evidence | Notes |
|----|-------|----------|--------|----------|-------|
| S12-001 | Camera permission denied | P1 | PASS | Overrode `getUserMedia` to reject with `DOMException("Permission denied","NotAllowedError")`. Page rendered overlay text "Camera permission denied." + "Allow camera access in your browser settings, or use manual entry below." No crash/Next.js error page. | Matches `scanner-panel.tsx:86-88` (`message.includes("notallowed")` → `state="denied"`). |
| S12-002 | No camera device | P1 | PASS | Overrode `getUserMedia` to reject with `DOMException("Requested device not found","NotFoundError")`. Overlay: "Scanner unavailable on this device." + "Use manual entry below instead." No crash. Corroborated (S12-002b) by the fact that this sandbox genuinely has no camera hardware — leaving `getUserMedia` unmocked naturally rejects (with `NotSupportedError`) and lands on the same "unavailable" state. | Two independent confirmations of the same code path. |
| S12-003 | Valid QR scanned navigates to card | P0 | PASS | Launched Chromium with a real fake video-capture device streaming a genuine QR image encoding `http://localhost:3100/staff/cards/<Business A token>`. The app auto-decoded it and navigated to `http://localhost:3100/staff/cards/CiBvLr4mkHR5WU5WSLxW-J-aU56CGlet` — the real card page rendered (not an error state). | Full camera→decode→navigate pipeline exercised with real bytes, not simulated. |
| S12-004 | Invalid QR content | P1 | PASS | Fake camera streamed a QR encoding `https://example.com` (no card path). Overlay showed: "That doesn't look like a StampMate card QR. Keep scanning or use manual entry below." Page stayed on `/staff/scan`. |  |
| S12-005 | QR pointing at another business's card | P0 | PASS | Fake camera streamed a QR encoding Business B's real card URL while Business A's owner was logged in. Scanner accepted and navigated to `/staff/cards/<Business B token>`, then the server-side `requireBusinessAccess()` check redirected to `/dashboard`. No Business B id appeared in the intermediate page HTML. DB check after the run: Business B's card row is still `status=ACTIVE`, untouched. | Isolation enforced server-side as expected, not at the scan layer — matches test plan expectation exactly. |
| S12-006 | Manual entry: full URL | P1 | PASS | Typed `http://localhost:3100/staff/cards/<Business A token>` into `#manual-token`, clicked Go → navigated to that exact URL. |  |
| S12-007 | Manual entry: raw token | P1 | PASS | Typed the raw 32-char Business A token, clicked Go → navigated to `http://localhost:3100/staff/cards/<token>`. |  |
| — (extra) | Manual entry: another business's card token | P0 | PASS | Typed Business B's raw token into manual entry, clicked Go → scanner navigated, then server redirected to `/dashboard` (same isolation guarantee as S12-005, exercised via the manual-entry surface per the briefing's explicit ask). Logged as case `S12-005b` in the script output. |  |
| S12-008 | Manual entry: malformed input | P1 | PASS | `"abc"` (too short), `"!!!"` (bad charset), and `""` (empty) each produced the inline error "Enter a valid card link or token." and the page stayed on `/staff/scan` (no navigation) for all three. |  |
| S12-009 | **[SUSPECTED DEFECT SD-3, UI surface]** Manual entry: cross-origin URL | P2 | PASS (confirms SD-3 at the UI layer) | Typed `https://evil.com/card/<real Business A token>`, clicked Go → navigated to `/staff/cards/<token>` anyway (origin ignored). Cross-references S6-014, where the same behavior was confirmed at the `extractCardToken` unit level. | See Defects section (shared with S6's writeup of SD-3). |
| S12-010 | Scanner cleanup on unmount (no camera leak) | P2 | PASS | With the scanner actively running (fake camera streaming a non-matching QR so it keeps scanning), confirmed a live `<video>` element (`paused:false, readyState:4`) inside `#staff-qr-scanner` before navigating away. After `page.goto('/dashboard')`, the `<video>` element is completely gone from the DOM (`document.querySelector('video')` → null), confirming `safeStop`/`clear` tore down the camera element on unmount. | Direct DOM-level evidence of the camera indicator turning off, not just code reading. |
| S12-011 | Manual error clears on edit | P2 | PASS | Triggered the "Enter a valid card link or token." error with `"abc"`, then typed one more character (`"abcd"`) — the `.text-destructive` error element disappeared immediately, confirming the `onChange` handler clears `manualError` (`scanner-panel.tsx:155-158`). |  |

**Totals: 15/15 executed cases PASS** (11 planned S12 cases + 4 additional sub-cases: S12-002b corroboration, S12-005b manual-entry version of the cross-business check, and the two malformed-input variants beyond the single planned malformed case), 0 FAIL, 0 BLOCKED, 0 NOT-RUN.

## Defects

### Defect — SD-3 (UI surface): manual entry accepts a cross-origin card URL
- **Severity:** Low (same underlying root cause and impact profile as the S6 writeup — see `results/S6-card-token-security.md` Defect 1 for the full impact analysis; this entry documents the confirmation at the `/staff/scan` UI surface specifically, as the briefing asked for both layers.)
- **Test case ID(s):** S12-009 (UI), S6-014 (unit, `extractCardToken` itself)
- **File:line:** `src/lib/card-token.ts:12-17` (root cause; `scanner-panel.tsx:97-105`'s `handleManualSubmit` calls `extractCardToken` directly with no additional origin check of its own).
- **Repro:** On `/staff/scan`, paste `https://evil.com/card/<a real card token>` into the manual-entry field and click Go. The app navigates to `/staff/cards/<token>` exactly as if the token had been entered directly.
- **Observed vs Expected:** Observed: no origin validation at either the extraction function or the manual-entry form. Expected: either reject non-app-origin URLs, or explicitly accept/document that only the path shape (not the origin) is trusted, given the server-side `requireBusinessAccess` backstop.
- **Suggested fix:** Same as S6's Defect 1 — add an origin check inside `extractCardToken` so both the scanner and the manual-entry form are protected by a single fix.

## Notes on method / limitations

- Camera-permission and no-device paths were tested by overriding `navigator.mediaDevices.getUserMedia` via Playwright's `page.addInitScript`, which runs *before* any app code and causes the real browser API call the app makes to reject with a real `DOMException` — this exercises the app's actual `.catch()` branching, not a mock of the app's own code.
- The valid-QR, invalid-QR, and cross-business-QR camera scenarios (S12-003/004/005) used Chromium's built-in `--use-fake-device-for-media-stream` + `--use-file-for-fake-video-capture=<file>.y4m` flags to stream **real, freshly generated QR code images** frame-by-frame into the exact same `getUserMedia()` call path a physical camera would use. This was verified working end-to-end with a standalone probe script before being relied on for the suite, so these results reflect genuine camera-pipeline behavior, not a shortcut around it.
- No repo files were modified; all QR/video assets and npm packages (`jsqr`, `pngjs`, `qrcode`) were installed only into the QA scratchpad's own `node_modules`/`package.json`, never the app's.
