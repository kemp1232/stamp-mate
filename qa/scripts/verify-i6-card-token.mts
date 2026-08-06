// I6: extractCardToken fail-closed-off-browser + anchored path patterns +
// explicit expectedOrigin param, against the real exported function.
import { extractCardToken } from "../../src/lib/card-token.ts";

const VALID = "FhlX3MQg3j6FIUx9kZOHxMPTYpfHEneg";
let fails = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(
    `${ok ? "✅" : "❌"} ${label} -> ${JSON.stringify(actual)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`,
  );
};

// No `window` global at all here — simulates this module being imported
// into server code (a route handler / server action), which is exactly the
// scenario the old `typeof window !== "undefined"` guard silently
// vanished in.
console.log("--- fail-closed when no window and no expectedOrigin ---");
check(
  "absolute same-looking URL, no origin available",
  extractCardToken(`http://localhost:3100/card/${VALID}`),
  null,
);
check(
  "absolute evil URL, no origin available",
  extractCardToken(`https://evil.com/card/${VALID}`),
  null,
);
check(
  "relative path still works with no window (no absolute-URL ambiguity)",
  extractCardToken(`/card/${VALID}`),
  VALID,
);
check("raw token still works with no window", extractCardToken(VALID), VALID);

console.log("\n--- explicit expectedOrigin param (server-safe usage) ---");
check(
  "matches expectedOrigin",
  extractCardToken(`http://localhost:3100/card/${VALID}`, "http://localhost:3100"),
  VALID,
);
check(
  "mismatches expectedOrigin",
  extractCardToken(`http://localhost:3100/card/${VALID}`, "https://app.example.com"),
  null,
);

console.log("\n--- anchored path patterns (must reject embedded matches) ---");
(globalThis as any).window = { location: { origin: "http://localhost:3100" } };
check(
  "/anything/card/TOKEN no longer matches (previously did)",
  extractCardToken(`http://localhost:3100/anything/card/${VALID}`),
  null,
);
check(
  "/anything/staff/cards/TOKEN no longer matches",
  extractCardToken(`http://localhost:3100/anything/staff/cards/${VALID}`),
  null,
);
check(
  "trailing segment after token rejected",
  extractCardToken(`http://localhost:3100/card/${VALID}/extra`),
  null,
);
check(
  "exact /card/TOKEN still matches",
  extractCardToken(`http://localhost:3100/card/${VALID}`),
  VALID,
);
check(
  "exact /staff/cards/TOKEN still matches",
  extractCardToken(`http://localhost:3100/staff/cards/${VALID}`),
  VALID,
);

console.log("\n--- relative-path branch strips tabs like C1 ---");
check(
  "relative path with tab collapsing to protocol-relative is rejected",
  extractCardToken(`/\t/evil.com/card/${VALID}`),
  null,
);

console.log(
  fails === 0 ? "\nALL I6 CHECKS PASS" : `\n${fails} CHECK(S) FAILED`,
);
process.exit(fails === 0 ? 0 : 1);
