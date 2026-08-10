// Full MVP flow at mobile viewport (390x844), plus dark mode, error page, and
// pagination checks. Captures console errors + failed network requests explicitly.
import {
  BASE_URL, sql, sql1, uid, launch, newContext, registerOwnerViaUI,
  createCustomer, createCard, signInUser,
} from "./lib/harness.js";
import fs from "node:fs";

const SHOTS = "/private/tmp/claude-501/-Users-raymundrafael-Desktop-repos-firstmate-stamp-mate/5aeec2be-dde4-480c-93c3-eef08c7c309f/scratchpad/qa/results/screenshots/final";
fs.mkdirSync(SHOTS, { recursive: true });

const consoleErrors = [];
const failedRequests = [];
let shotN = 0;

function wireCapture(page, label) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({ label, text: msg.text(), url: page.url() });
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push({ label, text: `pageerror: ${err.message}`, url: page.url() });
  });
  page.on("requestfailed", (req) => {
    failedRequests.push({ label, url: req.url(), method: req.method(), failure: req.failure()?.errorText, page: page.url() });
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      failedRequests.push({ label, url: res.url(), status: res.status(), page: page.url() });
    }
  });
}

async function shot(page, name) {
  shotN += 1;
  const file = `${SHOTS}/${String(shotN).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function checkOverflow(page, label) {
  const info = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  const overflow = info.scrollWidth > info.clientWidth + 1; // 1px tolerance
  return { label, ...info, overflow };
}

const overflowReport = [];
const results = {};

const browser = await launch();

// ─────────────────────────────────────────── 1. Register owner (mobile viewport)
const ctx = await newContext(browser, { mobile: true });
const page = await ctx.newPage();
wireCapture(page, "owner");
const bizName = uid("Mobile Cafe");
const owner = await registerOwnerViaUI(page, { businessName: bizName });
await page.waitForLoadState("networkidle").catch(() => {});
overflowReport.push(await checkOverflow(page, "after-register"));
await shot(page, "01-register-result-dashboard");
results.register = { url: page.url(), email: owner.email };

const u = await sql1(`select id, email from "user" where email = $1`, [owner.email]);
const m = await sql1(`select * from staff_membership where "userId" = $1`, [u.id]);
results.membership = { role: m?.role, businessId: m?.businessId };
const ownerSignIn = await signInUser({ email: owner.email, password: owner.password });
const ownerCookie = ownerSignIn.cookie;

// ─────────────────────────────────────────── 2. Create loyalty program
await page.goto(`${BASE_URL}/dashboard/program`);
await page.waitForLoadState("networkidle");
overflowReport.push(await checkOverflow(page, "program-form"));
await shot(page, "02-program-form");
await page.fill('input[name="name"]', "Mobile QA Program");
await page.fill('input[name="requiredStamps"]', "3");
await page.fill('input[name="rewardText"]', "Free pastry");
await page.click('button[type="submit"]');
await page.waitForTimeout(1800);
overflowReport.push(await checkOverflow(page, "after-program-create"));
await shot(page, "03-program-created");

const prog = await sql1(
  `select lp.* from loyalty_program lp join store s on s.id = lp."storeId" where s."businessId" = $1`,
  [m.businessId]);
const store = await sql1(`select * from store where "businessId" = $1`, [m.businessId]);
results.program = { name: prog?.name, requiredStamps: prog?.requiredStamps, status: prog?.status };
results.store = { slug: store?.slug };

// ─────────────────────────────────────────── 3. Open join QR page (as owner, to see the QR)
await page.goto(`${BASE_URL}/dashboard`);
await page.waitForLoadState("networkidle");
overflowReport.push(await checkOverflow(page, "dashboard"));
await shot(page, "04-dashboard-with-qr");

// ─────────────────────────────────────────── 4. Join as customer (separate mobile context)
const custCtx = await newContext(browser, { mobile: true });
const custPage = await custCtx.newPage();
wireCapture(custPage, "customer");
await custPage.goto(`${BASE_URL}/join/${store.slug}`);
await custPage.waitForLoadState("networkidle");
overflowReport.push(await checkOverflow(custPage, "join-page"));
await shot(custPage, "05-join-page");
await custPage.fill('input[name="name"]', "Mobile QA Customer");
await custPage.fill('input[name="phone"]', "0917 555 9911");
await custPage.click('button[type="submit"]');
await custPage.waitForURL(/\/card\//, { timeout: 15000 });
const cardToken = custPage.url().split("/card/")[1];
await custPage.waitForLoadState("networkidle");
await custPage.waitForSelector("text=Status", { timeout: 10000 }).catch(() => {});
await custPage.waitForTimeout(500);
overflowReport.push(await checkOverflow(custPage, "customer-card-fresh"));
await shot(custPage, "06-customer-card-fresh");
results.join = { cardToken, url: custPage.url() };

// ─────────────────────────────────────────── 5. Staff opens/scans the card
await page.goto(`${BASE_URL}/staff/cards/${cardToken}`);
await page.waitForLoadState("networkidle");
overflowReport.push(await checkOverflow(page, "staff-card-fresh"));
await shot(page, "07-staff-card-fresh");

// ─────────────────────────────────────────── 6. Add stamps to completion (3 required)
for (let i = 0; i < 3; i++) {
  await page.click('button:has-text("Add Stamp")');
  await page.waitForTimeout(1300);
  await shot(page, `08-staff-card-after-stamp-${i + 1}`);
}
overflowReport.push(await checkOverflow(page, "staff-card-completed"));
const cardAfterStamps = await sql1(`select id, status from loyalty_card where "cardToken"=$1`, [cardToken]);
results.afterStamps = cardAfterStamps;

// customer view after completion
await custPage.goto(`${BASE_URL}/card/${cardToken}`);
await custPage.waitForLoadState("networkidle");
overflowReport.push(await checkOverflow(custPage, "customer-card-completed"));
await shot(custPage, "09-customer-card-completed");

// ─────────────────────────────────────────── 7. Redeem
await page.goto(`${BASE_URL}/staff/cards/${cardToken}`);
await page.waitForLoadState("networkidle");
page.once("dialog", (d) => d.accept());
await page.click('button:has-text("Redeem Reward")');
await page.waitForTimeout(2500);
overflowReport.push(await checkOverflow(page, "staff-card-after-redeem"));
await shot(page, "10-staff-card-after-redeem");

const afterRedeem = await sql(
  `select status, "cycleNumber", "cardToken" from loyalty_card where "customerId"=(select "customerId" from loyalty_card where "cardToken"=$1) order by "cycleNumber"`,
  [cardToken]);
results.afterRedeem = afterRedeem;

// ─────────────────────────────────────────── 8. Confirm the new cycle card (customer view)
const newCard = afterRedeem.find((c) => c.cycleNumber === 2);
if (newCard) {
  await custPage.goto(`${BASE_URL}/card/${newCard.cardToken}`);
  await custPage.waitForLoadState("networkidle");
  overflowReport.push(await checkOverflow(custPage, "customer-card-new-cycle"));
  await shot(custPage, "11-customer-card-new-cycle");
}

await ctx.close();
await custCtx.close();

// ─────────────────────────────────────────── 9. Dark mode checks (mobile viewport)
const darkResults = {};
async function darkShot(url, name, label) {
  const dctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "dark",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  if (label === "dashboard" || label === "staff") await dctx.addCookies(cookieHeaderCookies(ownerCookie));
  const p = await dctx.newPage();
  wireCapture(p, `dark-${label}`);
  await p.goto(url);
  await p.waitForLoadState("networkidle").catch(() => {});
  const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  overflowReport.push(await checkOverflow(p, `dark-${label}`));
  await shot(p, name);
  await dctx.close();
  return bg;
}
function cookieHeaderCookies(cookieHeader) {
  return cookieHeader.split("; ").filter(Boolean).map((pair) => {
    const idx = pair.indexOf("=");
    return { name: pair.slice(0, idx), value: pair.slice(idx + 1), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" };
  });
}

darkResults.customerCard = await darkShot(`${BASE_URL}/card/${newCard ? newCard.cardToken : cardToken}`, "12-dark-customer-card", "customer-card");
darkResults.staffCard = await darkShot(`${BASE_URL}/staff/cards/${cardToken}`, "13-dark-staff-card", "staff");
darkResults.dashboard = await darkShot(`${BASE_URL}/dashboard`, "14-dark-dashboard", "dashboard");

// ─────────────────────────────────────────── 10. Error / not-found page (styled?)
{
  const ectx = await newContext(browser, { mobile: true });
  const ep = await ectx.newPage();
  wireCapture(ep, "404");
  await ep.goto(`${BASE_URL}/definitely-not-a-real-route-${uid("x")}`);
  await ep.waitForLoadState("networkidle").catch(() => {});
  overflowReport.push(await checkOverflow(ep, "404-page"));
  await shot(ep, "15-404-page");
  results.notFoundText = (await ep.textContent("body").catch(() => "")).slice(0, 300);
  await ectx.close();
}

// ─────────────────────────────────────────── 11. Customer list pagination -> page 2
{
  const pctx = await newContext(browser, { mobile: true, cookie: ownerCookie });
  const pp = await pctx.newPage();
  wireCapture(pp, "pagination");
  // seed extra customers so pagination is meaningful (business already has >25 from run? ensure)
  const existing = (await sql1(`select count(*)::int as n from customer where "businessId"=$1`, [m.businessId])).n;
  if (existing < 30) {
    for (let i = existing; i < 30; i++) {
      const c = await createCustomer(m.businessId, { name: `Page QA ${String(i).padStart(3, "0")}` });
      await createCard(c.id, prog.id);
    }
  }
  await pp.goto(`${BASE_URL}/dashboard/customers`);
  await pp.waitForLoadState("networkidle");
  overflowReport.push(await checkOverflow(pp, "customers-page1"));
  await shot(pp, "16-customers-page1");
  const page1Text = await pp.innerText("body");
  const nextBtn = await pp.$('button:has-text("Next"), a:has-text("Next"), button:has-text("2"), a:has-text("2")');
  let clicked = false;
  if (nextBtn) {
    await nextBtn.click();
    await pp.waitForTimeout(1200);
    clicked = true;
  }
  overflowReport.push(await checkOverflow(pp, "customers-page2"));
  await shot(pp, "17-customers-page2");
  const page2Text = await pp.innerText("body");
  results.pagination = { clicked, changed: page1Text !== page2Text, page2Url: pp.url() };
  await pctx.close();
}

await browser.close();

console.log("=== RESULTS ===");
console.log(JSON.stringify(results, null, 2));
console.log("=== DARK MODE BG ===");
console.log(JSON.stringify(darkResults, null, 2));
console.log("=== OVERFLOW REPORT ===");
console.log(JSON.stringify(overflowReport, null, 2));
console.log("=== CONSOLE ERRORS ===");
console.log(JSON.stringify(consoleErrors, null, 2));
console.log("=== FAILED / 4xx+5xx REQUESTS ===");
console.log(JSON.stringify(failedRequests, null, 2));
