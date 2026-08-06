const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,}$/;

// Anchored to the *whole* pathname (not just "contains"), so a link like
// `/anything/card/<token>` — which the previous unanchored `/\/card\//`
// search would happily match — is correctly rejected instead of treated as
// a card link.
const STAFF_CARD_PATH = /^\/staff\/cards\/([^/]+)$/;
const CARD_PATH = /^\/card\/([^/]+)$/;

/**
 * Extracts and validates the token from a URL's `/staff/cards/[token]` or
 * `/card/[token]` path. Applied to both absolute and relative paths so
 * URL-derived tokens get the same charset/length check raw pasted tokens
 * do — an inconsistency here previously let a malformed URL path segment
 * through unchecked.
 */
function extractFromPathname(pathname: string): string | null {
  const match = pathname.match(STAFF_CARD_PATH) ?? pathname.match(CARD_PATH);
  if (!match) {
    return null;
  }
  let token: string;
  try {
    token = decodeURIComponent(match[1]);
  } catch {
    // Malformed percent-encoding in the path segment.
    return null;
  }
  return TOKEN_PATTERN.test(token) ? token : null;
}

/**
 * Pulls a card token out of either a full scanned/pasted URL
 * (`/staff/cards/[token]` or `/card/[token]`), a same-site relative path,
 * or a raw token string. Used by both the QR scanner and the manual-entry
 * fallback.
 *
 * `expectedOrigin` is the app's own origin to compare an absolute URL
 * against — pass `window.location.origin` from client code. This is a
 * parameter rather than an implicit `window` read for two reasons:
 *   1. `getAppUrl()` (the server-side source of truth for the app's origin,
 *      via `BETTER_AUTH_URL`) is not available in the browser, so the only
 *      caller (`ScannerPanel`, a client component) has no way to obtain the
 *      "real" app origin except `window.location.origin` itself.
 *   2. If this module is ever imported into server code (a route handler,
 *      a server action) with no `expectedOrigin` supplied, the origin check
 *      must FAIL CLOSED — reject every absolute URL — rather than silently
 *      evaluate to `typeof window !== "undefined"` being `false` and
 *      skipping the check entirely, which is what happened before this fix.
 *      A security check that vanishes when its assumptions don't hold is
 *      worse than one that's merely strict.
 *
 * Known caveat: because the comparison is against the *current* browser's
 * origin, staff scanning a production-printed QR while browsing from a
 * different host (a Vercel preview URL, a LAN IP in dev, a secondary
 * domain) will have that scan rejected here even though the token itself
 * is valid. Supporting that needs an explicit allowed-origins allowlist,
 * not a same-origin check — out of scope for this fix.
 */
export function extractCardToken(
  input: string,
  expectedOrigin?: string,
): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    // A card link should only ever be same-origin. The token itself is a
    // real 192-bit secret and requireBusinessAccess() still gates access
    // server-side either way, so this isn't an access-control bypass —
    // but honoring a QR/pasted link pointing at another domain (e.g. a
    // phishing page shaped like `https://evil.com/card/<token>`) is a
    // trust-surface gap the scanner shouldn't paper over by navigating
    // there anyway.
    const origin =
      expectedOrigin ??
      (typeof window !== "undefined" ? window.location.origin : null);
    if (origin === null || url.origin !== origin) {
      return null;
    }
    return extractFromPathname(url.pathname);
  } catch {
    // Not an absolute URL. Accept a same-site relative path, but only if
    // it can't be re-interpreted as pointing off-site: a leading "//" is
    // protocol-relative (resolves against whatever scheme it's placed
    // into), and a leading "\" is normalized to "/" by some browsers, so
    // both are rejected here the same way an open-redirect target would
    // be. ASCII tab/CR/LF are stripped first because the WHATWG URL parser
    // strips them anywhere in the input before parsing, so e.g. "/\t/evil"
    // must be evaluated as "//evil" (protocol-relative, rejected) rather
    // than at face value (see the matching fix in
    // sanitizeRedirectTarget/src/lib/validations/auth.ts for the same
    // class of bug). Otherwise, fall back to treating the input as a bare
    // token.
    const cleaned = trimmed.replace(/[\t\r\n]/g, "");
    const isSafeRelativePath =
      cleaned.startsWith("/") &&
      !cleaned.startsWith("//") &&
      !cleaned.includes("\\");
    if (isSafeRelativePath) {
      const relativeUrl = new URL(cleaned, "http://localhost");
      return extractFromPathname(relativeUrl.pathname);
    }
    return TOKEN_PATTERN.test(trimmed) ? trimmed : null;
  }
}
