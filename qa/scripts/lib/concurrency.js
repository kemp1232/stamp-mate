// Extra helper (additive, does not modify harness.js exports) for capturing a real
// Next.js server-action POST via Playwright and replaying it N times concurrently
// with raw fetch, to get TRUE simultaneity for race-condition testing.
import { BASE_URL } from "./harness.js";

/**
 * Navigates to `url`, clicks `buttonSelector`, and captures the resulting
 * server-action POST (url, headers incl. cookie/next-action/content-type, raw body).
 * Pass dialogAccept:true for buttons that trigger a window.confirm().
 */
export async function captureAction(page, url, buttonSelector, { dialogAccept = false } = {}) {
  let captured = null;
  const listener = async (req) => {
    if (req.method() === "POST" && req.url() === url && !captured) {
      const headers = await req.allHeaders();
      captured = { url: req.url(), headers, postData: req.postData() };
    }
  };
  page.on("request", listener);
  if (dialogAccept) page.once("dialog", (d) => d.accept());
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await page.click(buttonSelector);
  await page.waitForTimeout(1500);
  page.off("request", listener);
  if (!captured) throw new Error(`Failed to capture POST to ${url} after clicking ${buttonSelector}`);
  return captured;
}

/** Replays a captured action request `times` times, fired concurrently via Promise.all. */
export async function replayAction(captured, times = 1) {
  const headers = { ...captured.headers };
  delete headers["content-length"];
  delete headers["host"];
  delete headers["connection"];
  const reqs = [];
  for (let i = 0; i < times; i++) {
    reqs.push(
      fetch(captured.url, { method: "POST", headers, body: captured.postData }).then(async (res) => ({
        status: res.status,
        ok: res.ok,
        text: await res.text().catch(() => ""),
      })).catch((err) => ({ status: null, ok: false, error: String(err) })),
    );
  }
  return Promise.all(reqs);
}

export { BASE_URL };
