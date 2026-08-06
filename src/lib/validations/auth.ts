import { z } from "zod";

export const registerSchema = z.object({
  businessName: z.string().trim().min(2, "Business name is required"),
  name: z.string().trim().min(1, "Your name is required"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const DEFAULT_REDIRECT = "/dashboard";

// Any origin works here — it's discarded immediately after resolution. What
// matters is that it never itself contains a path/query that could leak
// through, so a fixed, inert placeholder is used rather than the request's
// real origin.
const RESOLUTION_BASE = "http://redirect.invalid";

/**
 * Validates the post-auth `redirectTo` destination (set by the middleware
 * in src/proxy.ts when it bounces a logged-out user off a deep link, and
 * carried through login/register as a hidden field). Only a same-site
 * relative path is safe here — anything else falls back to /dashboard.
 *
 * This resolves the value against a dummy origin with the real WHATWG URL
 * parser and compares origins, rather than blocklisting specific
 * substrings/characters. A blocklist approach previously missed that the
 * URL parser strips ASCII tab/CR/LF *anywhere* in the input before parsing
 * (per the WHATWG URL spec's "remove all ASCII tab or newline" step) — so
 * `"/\t/evil.com"` slipped past a `\r`/`\n`-only check, still started with
 * a single "/", and then resolved protocol-relative to `https://evil.com/`
 * once a browser (or Next's `new URL()` on the client) parsed it. Stripping
 * the same characters *before* the leading-slash/backslash checks and then
 * resolving+comparing origins closes that gap by construction instead of by
 * enumeration.
 *
 * Checking `resolved.origin` alone is *still not enough*, because the
 * origin check validates the INPUT's resolution, not the OUTPUT that
 * actually gets returned and later fed to `redirect()`. The WHATWG path
 * normalization that collapses ".." segments can manufacture a
 * protocol-relative output even when the input resolved same-origin:
 * `new URL("/..//evil.com", "http://redirect.invalid")` pops the leading
 * empty segment for ".." and is left with pathname `"//evil.com"` — origin
 * still reports `http://redirect.invalid` (the resolution happened against
 * a real base), but the *returned string* `"//evil.com"` is itself a
 * protocol-relative reference. Handed to `redirect()` and later resolved
 * against the app's own origin (e.g. `new URL("//evil.com",
 * "https://app.example")`), it takes on the app's scheme but evil.com's
 * host. `/a/..//evil.com`, `/.//evil.com`, and percent-encoded `..`
 * (`/%2e%2e//evil.com`, left undecoded by the URL parser in a path segment
 * so it doesn't even need the literal dots) all reach the same output.
 * The fix is to re-validate the constructed OUTPUT string against the same
 * invariant a safe same-site relative reference must satisfy — starts with
 * exactly one "/", not "//", and no backslash — rather than trusting that a
 * same-origin *input* resolution implies a same-origin *output* string.
 *
 * This intentionally does not use Zod — an unsafe or malformed value
 * should silently fall back, not surface a validation error to the user.
 */
export function sanitizeRedirectTarget(
  value: FormDataEntryValue | null,
): string {
  if (typeof value !== "string" || value.length === 0) {
    return DEFAULT_REDIRECT;
  }

  // Mirror the URL parser's own "strip ASCII tab and newline" step so what
  // we validate is exactly what would end up being parsed.
  const cleaned = value.replace(/[\t\r\n]/g, "");

  if (!cleaned.startsWith("/") || cleaned.includes("\\")) {
    return DEFAULT_REDIRECT;
  }

  let resolved: URL;
  try {
    resolved = new URL(cleaned, RESOLUTION_BASE);
  } catch {
    return DEFAULT_REDIRECT;
  }

  if (resolved.origin !== RESOLUTION_BASE) {
    return DEFAULT_REDIRECT;
  }

  const target = `${resolved.pathname}${resolved.search}${resolved.hash}`;

  // Re-validate the OUTPUT, not just the input: ".." segment normalization
  // (including percent-encoded "..") can turn a same-origin-resolving input
  // into a protocol-relative output string (see doc comment above). A safe
  // same-site relative reference must start with exactly one "/", never
  // "//", and carry no backslash.
  if (
    !target.startsWith("/") ||
    target.startsWith("//") ||
    target.includes("\\")
  ) {
    return DEFAULT_REDIRECT;
  }

  return target;
}
