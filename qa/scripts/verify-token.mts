// L-1 / L-2: extractCardToken origin + charset validation, against real source.
import { extractCardToken } from "../../src/lib/card-token.ts";

const VALID = "FhlX3MQg3j6FIUx9kZOHxMPTYpfHEneg";
let fails = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${label} -> ${JSON.stringify(actual)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`);
};

// Simulate the browser the scanner actually runs in.
(globalThis as any).window = { location: { origin: "http://localhost:3100" } };

console.log("--- same-origin (accepted) ---");
check("same-origin /staff/cards/", extractCardToken(`http://localhost:3100/staff/cards/${VALID}`), VALID);
check("same-origin /card/", extractCardToken(`http://localhost:3100/card/${VALID}`), VALID);
check("same-origin + query", extractCardToken(`http://localhost:3100/card/${VALID}?x=1`), VALID);
check("same-origin + fragment", extractCardToken(`http://localhost:3100/card/${VALID}#f`), VALID);
check("relative path", extractCardToken(`/card/${VALID}`), VALID);
check("raw token", extractCardToken(VALID), VALID);
check("raw token whitespace", extractCardToken(`  ${VALID}  `), VALID);

console.log("--- L-1 cross-origin (must be rejected) ---");
check("https://evil.com/card/", extractCardToken(`https://evil.com/card/${VALID}`), null);
check("https://evil.com/staff/cards/", extractCardToken(`https://evil.com/staff/cards/${VALID}`), null);
check("other port same host", extractCardToken(`http://localhost:9999/card/${VALID}`), null);
check("protocol-relative //evil.com", extractCardToken(`//evil.com/card/${VALID}`), null);
check("backslash /\\evil.com", extractCardToken(`/\\evil.com/card/${VALID}`), null);
check("javascript: scheme", extractCardToken(`javascript:alert(1)//card/${VALID}`), null);
check("data: scheme", extractCardToken(`data:text/html,/card/${VALID}`), null);

console.log("--- L-2 charset/length enforced on URL-derived tokens ---");
check("short token in URL", extractCardToken("http://localhost:3100/card/abc"), null);
check("bad charset in URL", extractCardToken("http://localhost:3100/card/tok!!en@@bad$$"), null);
check("encoded space in URL", extractCardToken("http://localhost:3100/card/tok%20en%20bad"), null);
check("malformed percent-encoding", extractCardToken("http://localhost:3100/card/%E0%A4%A"), null);
check("short raw token", extractCardToken("abc"), null);
check("bad charset raw", extractCardToken("tok!!en@@bad$$"), null);
check("empty", extractCardToken(""), null);
check("whitespace only", extractCardToken("   "), null);

console.log(fails === 0 ? "\nALL TOKEN CHECKS PASS" : `\n${fails} TOKEN CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
