// C1: sanitizeRedirectTarget open-redirect attack matrix, against the real
// exported function (no reimplementation, no mocking of URL).
//
// This is the third round of this check. Round 1 covered TAB/CRLF-based
// bypasses of a blocklist. Round 2 closed those but the *test* only
// re-asserted the round-1 threat model (tab/CRLF/backslash/protocol-relative/
// absolute/javascript:) and enumerated zero ".." traversal vectors — so it
// certified a function that was still exploitable via
// "/..//evil.com" -> "//evil.com" (path-normalization manufacturing a
// protocol-relative *output* even though the *input* resolved same-origin).
//
// This round tests the OUTPUT invariant directly instead of enumerating
// known-bad strings: for every input, the returned value must either be the
// literal fallback, or satisfy "is actually a safe same-site relative
// reference" — checked by re-resolving the OUTPUT against a real origin and
// confirming it stays on that origin. That is the same check the previous
// round should have run on the return value, not just on the input.
import { sanitizeRedirectTarget } from "../../src/lib/validations/auth.ts";

const DEFAULT = "/dashboard";
// A different app origin than the one sanitizeRedirectTarget resolves
// against internally (RESOLUTION_BASE = http://redirect.invalid) — the
// point is to prove the OUTPUT is safe to hand to `redirect()` in a real
// deployment, not to reuse the function's own internal base.
const APP_ORIGIN = "https://app.example";

let fails = 0;
let passes = 0;

/**
 * The real invariant a same-site relative redirect target must satisfy:
 * starts with exactly one "/", is never protocol-relative ("//..."), never
 * carries a backslash (which some parsers normalize to "/"), and — the part
 * that actually proves safety rather than pattern-matching it — resolving
 * it against a real app origin must stay on that origin.
 */
function isSafeRedirectOutput(output: string): boolean {
  if (output === DEFAULT) return true;
  if (typeof output !== "string") return false;
  if (!output.startsWith("/")) return false;
  if (output.startsWith("//")) return false;
  if (output.includes("\\")) return false;
  let resolved: URL;
  try {
    resolved = new URL(output, APP_ORIGIN);
  } catch {
    return false;
  }
  return resolved.origin === APP_ORIGIN;
}

const checkInvariant = (label: string, input: string | null) => {
  const output = sanitizeRedirectTarget(input);
  const safe = isSafeRedirectOutput(output);
  if (safe) {
    passes++;
  } else {
    fails++;
    console.log(
      `❌ ${label} -> ${JSON.stringify(output)} (UNSAFE: resolves off-origin or malformed)`,
    );
  }
  return { output, safe };
};

const checkEquals = (label: string, actual: unknown, expected: unknown) => {
  const ok = actual === expected;
  if (ok) passes++;
  else fails++;
  console.log(
    `${ok ? "✅" : "❌"} ${label} -> ${JSON.stringify(actual)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`,
  );
};

console.log(
  "--- C1: '..' path-traversal / normalization open redirect (must resolve safely) ---",
);
// The round-3 defect: origin-of-input passed, but the RETURNED string
// itself was protocol-relative once ".." segments were normalized away.
const traversalVectors = [
  "/..//evil.com",
  "/a/..//evil.com",
  "/.//evil.com",
  "/%2e%2e//evil.com",
  "/..%2f%2fevil.com",
  "/../../evil.com",
  "/../..//evil.com",
  "/a/b/../../..//evil.com",
  "/./..//evil.com",
  "/.././/evil.com",
  "/%2e%2e/%2e%2e//evil.com",
  "/..///evil.com",
  "/a/../..//evil.com",
  "/%2e./%2e.//evil.com",
];
for (const v of traversalVectors) {
  const { output, safe } = checkInvariant(v, v);
  if (safe) {
    console.log(`✅ ${v} -> ${JSON.stringify(output)}`);
  }
}

console.log("\n--- TAB/CR/LF-based open redirect (round 1, must still hold) ---");
checkInvariant("raw TAB /\\t/evil.com", "/\t/evil.com");
checkInvariant("double TAB /\\t\\t//evil.com", "/\t\t//evil.com");
checkInvariant("CRLF /\\r\\n/evil.com", "/\r\n/evil.com");
// A tab embedded mid-segment just gets stripped, collapsing to a same-origin
// path ("/staff/evil.com") — not an open redirect, so this is expected to
// survive as that exact literal path, not fall back.
checkEquals(
  "TAB mid-path /sta\\tff/evil.com",
  sanitizeRedirectTarget("/sta\tff/evil.com"),
  "/staff/evil.com",
);
// %09 is percent-*encoded* text at this layer — it must survive as a
// literal (non-magic) path segment, not be misread as a traversal trick.
checkEquals(
  "encoded %09 (undecoded, literal)",
  sanitizeRedirectTarget("/%09/evil.com"),
  "/%09/evil.com",
);
checkEquals(
  "encoded %09%09 (undecoded, literal)",
  sanitizeRedirectTarget("/%09%09//evil.com"),
  "/%09%09//evil.com",
);

console.log("\n--- pre-existing vectors (round 2, must still hold) ---");
checkInvariant("backslash /\\evil.com", "/\\evil.com");
checkInvariant("protocol-relative //evil.com", "//evil.com");
checkInvariant("absolute https://evil.com", "https://evil.com");
checkInvariant("javascript: scheme", "javascript:alert(1)");
checkInvariant("no leading slash evil.com", "evil.com");
checkInvariant("empty string", "");
checkInvariant("null value", null);
checkInvariant("backslash-tab combo /\\\\t evil.com", "/\\\t/evil.com");

console.log("\n--- legitimate paths must survive intact (exact match) ---");
checkEquals("/staff", sanitizeRedirectTarget("/staff"), "/staff");
checkEquals(
  "/staff/cards/abc?x=1#f",
  sanitizeRedirectTarget("/staff/cards/abc?x=1#f"),
  "/staff/cards/abc?x=1#f",
);
checkEquals(
  "/dashboard/customers?page=2",
  sanitizeRedirectTarget("/dashboard/customers?page=2"),
  "/dashboard/customers?page=2",
);
checkEquals(
  "path with encoded space /staff/cards/a%20b",
  sanitizeRedirectTarget("/staff/cards/a%20b"),
  "/staff/cards/a%20b",
);
// Legitimate paths may legally contain ".." as long as normalization keeps
// them same-origin (e.g. a client-side deep link built by string
// concatenation) — the invariant, not a "no dots anywhere" blocklist, is
// what must gate this.
checkInvariant("in-bounds traversal /staff/../dashboard", "/staff/../dashboard");
checkEquals(
  "in-bounds traversal resolves correctly",
  sanitizeRedirectTarget("/staff/../dashboard"),
  "/dashboard",
);

console.log("\n--- generative fuzz: token-combination sweep ---");
// Build inputs out of every fragment that has ever contributed to a bypass
// (raw and percent-encoded traversal, protocol-relative markers, backslash,
// whitespace/control characters, NUL) combined with an off-site target, and
// assert the safety invariant holds for every combination — not just the
// hand-picked cases above.
const tokens = [
  "/",
  "..",
  ".",
  "//",
  "\\",
  "%2e",
  "%2f",
  "%5c",
  "\t",
  "\r",
  "\n",
  "\0",
  "evil.com",
];

let fuzzCases = 0;
let fuzzFails = 0;
function runFuzz(len: number) {
  const idx = new Array(len).fill(0);
  while (true) {
    const combo = idx.map((i) => tokens[i]).join("");
    const input = combo.startsWith("/") ? combo : `/${combo}`;
    fuzzCases++;
    const output = sanitizeRedirectTarget(input);
    if (!isSafeRedirectOutput(output)) {
      fuzzFails++;
      fails++;
      console.log(
        `❌ fuzz[${JSON.stringify(input)}] -> ${JSON.stringify(output)} (UNSAFE)`,
      );
    }
    // odometer increment
    let pos = len - 1;
    while (pos >= 0) {
      idx[pos]++;
      if (idx[pos] < tokens.length) break;
      idx[pos] = 0;
      pos--;
    }
    if (pos < 0) break;
  }
}
runFuzz(1);
runFuzz(2);
runFuzz(3);
if (fuzzFails === 0) {
  passes += fuzzCases;
  console.log(
    `✅ fuzz sweep: ${fuzzCases} generated cases, all satisfy the safety invariant`,
  );
} else {
  console.log(
    `❌ fuzz sweep: ${fuzzFails} of ${fuzzCases} generated cases violated the safety invariant`,
  );
}

const totalCases = passes + fails;
console.log(`\nTotal cases run: ${totalCases} (${fuzzCases} from fuzz sweep)`);
console.log(
  fails === 0
    ? "\nALL C1 ATTACK-MATRIX CHECKS PASS"
    : `\n${fails} CHECK(S) FAILED`,
);
process.exit(fails === 0 ? 0 : 1);
