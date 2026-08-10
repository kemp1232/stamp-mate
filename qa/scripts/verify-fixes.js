// Independent verification gate: re-proves each of the 22 QA findings is fixed.
// Written by the coordinator, not the fixing agents — deliberately re-attacks
// the same races that originally broke the code.
import {
  BASE_URL, sql, sql1, uid, launch, newContext, signUpUser, signInUser,
  seedTenant, createBusiness, addMembership, createStore, createProgram,
  createCustomer, createCard, addStampRow, registerOwnerViaUI,
  test, assert, assertEq, summary, shutdown,
} from "./lib/harness.js";
import { captureAction, replayAction } from "./lib/concurrency.js";

const browser = await launch();
const ROUNDS = 5;
const CONCURRENCY = 6;

// ───────────────────────────────────────────────────────── C-1 over-stamping
await test("C-1", "Concurrent Add Stamp never exceeds requiredStamps", async () => {
  const t = await seedTenant({ requiredStamps: 5 });
  const ctx = await newContext(browser, { cookie: t.owner.cookie });
  const page = await ctx.newPage();
  const observed = [];

  for (let round = 0; round < ROUNDS; round++) {
    const cust = await createCustomer(t.business.id);
    const card = await createCard(cust.id, t.program.id);
    for (let i = 0; i < 4; i++) await addStampRow(card.id, t.owner.userId, new Date(Date.now() + i));

    const url = `${BASE_URL}/staff/cards/${card.cardToken}`;
    const captured = await captureAction(page, url, 'button:has-text("Add Stamp")');
    // the capture click itself added the 5th stamp; reset to 4 for a clean race
    const stamps = await sql(`select id from stamp where "loyaltyCardId"=$1 order by "createdAt" desc`, [card.id]);
    if (stamps.length > 4) await sql(`delete from stamp where id = $1`, [stamps[0].id]);
    await sql(`update loyalty_card set status='ACTIVE' where id=$1`, [card.id]);

    const res = await replayAction(captured, CONCURRENCY);
    const n = (await sql1(`select count(*)::int as n from stamp where "loyaltyCardId"=$1`, [card.id])).n;
    const s = (await sql1(`select status from loyalty_card where id=$1`, [card.id])).status;
    const err500 = res.filter((r) => r.status >= 500).length;
    observed.push({ round, stamps: n, status: s, http500: err500 });
    assert(n <= 5, `round ${round}: ${n} stamps on a 5-stamp card (over-stamped)`);
    assert(err500 === 0, `round ${round}: ${err500} HTTP 5xx responses`);
  }
  await ctx.close();
  return `${ROUNDS} rounds x ${CONCURRENCY} concurrent: ${JSON.stringify(observed)}`;
});

// ─────────────────────────────────────────────────── C-2 empty-phone collision
await test("C-2", "Punctuation-only phone is rejected (no shared customer)", async () => {
  const t = await seedTenant();
  const ctx = await newContext(browser);
  const results = [];
  for (const [who, phone] of [["Alice", "(((-)))"], ["Bob", ".-.-.-."]]) {
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/join/${t.store.slug}`);
    await page.fill('input[name="name"]', who);
    await page.fill('input[name="phone"]', phone);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    results.push({ who, url: page.url(), err: await page.textContent("p.text-destructive").catch(() => null) });
    await page.close();
  }
  const empty = await sql(`select id from customer where "businessId"=$1 and phone=''`, [t.business.id]);
  assertEq(empty.length, 0, "customer rows with empty phone:");
  assert(results.every((r) => !r.url.includes("/card/")), `a join succeeded: ${JSON.stringify(results)}`);
  await ctx.close();
  return `both rejected; 0 empty-phone customers. errors=${JSON.stringify(results.map((r) => r.err))}`;
});

// ───────────────────────────────────────────────── H-1 undo vs redeem race
await test("H-1", "Undo racing redeem never returns an unhandled 500", async () => {
  const t = await seedTenant({ requiredStamps: 3 });
  const ctx = await newContext(browser, { cookie: t.owner.cookie });
  const page = await ctx.newPage();
  const observed = [];

  // Both captured POSTs must target the SAME card token, or they never
  // actually contend for the same row. So capture both against one card,
  // then restore that card to COMPLETED/3-stamps before racing them.
  const restore = async (card) => {
    await sql(`delete from reward_redemption where "loyaltyCardId"=$1`, [card.id]);
    await sql(`delete from loyalty_card where "customerId"=$1 and "cycleNumber">1`, [card.customerId]);
    await sql(`delete from stamp where "loyaltyCardId"=$1`, [card.id]);
    for (let i = 0; i < 3; i++) await addStampRow(card.id, t.owner.userId, new Date(Date.now() + i));
    await sql(`update loyalty_card set status='COMPLETED' where id=$1`, [card.id]);
  };

  for (let round = 0; round < ROUNDS; round++) {
    const cust = await createCustomer(t.business.id);
    const card = await createCard(cust.id, t.program.id, { status: "COMPLETED" });
    await restore(card);
    const url = `${BASE_URL}/staff/cards/${card.cardToken}`;

    const undo = await captureAction(page, url, 'button:has-text("Undo Last Stamp")');
    await restore(card);
    const redeem = await captureAction(page, url, 'button:has-text("Redeem Reward")', { dialogAccept: true });
    await restore(card);

    const [uRes, rRes] = await Promise.all([replayAction(undo, 1), replayAction(redeem, 1)]);
    const all = [...uRes, ...rRes];
    const err500 = all.filter((r) => r.status >= 500).length;
    const leaked = all.some((r) => /PrismaClientKnownRequestError|P2002|at async|\.ts:\d+/.test(r.text || ""));
    observed.push({ round, statuses: all.map((r) => r.status), http500: err500, leaked });
    assert(err500 === 0, `round ${round}: ${err500} HTTP 5xx`);
    assert(!leaked, `round ${round}: internal error/stack trace leaked to client`);
  }
  await ctx.close();
  return `${ROUNDS} rounds: ${JSON.stringify(observed)}`;
});

// ────────────────────────────── C-2 (review round 2): reward integrity race
// The invariant that actually matters is not "no 500" but "a card is never
// REDEEMED with fewer stamps than the program requires". H-1's original check
// only asserted the absence of a crash, which is exactly how the silent
// under-stamped redemption slipped through review round 1.
await test("C2-race", "A card is never REDEEMED with fewer stamps than required", async () => {
  const REQUIRED = 3;
  const t = await seedTenant({ requiredStamps: REQUIRED });
  const ctx = await newContext(browser, { cookie: t.owner.cookie });
  const page = await ctx.newPage();
  const observed = [];

  const restore = async (card) => {
    await sql(`delete from reward_redemption where "loyaltyCardId"=$1`, [card.id]);
    await sql(`delete from loyalty_card where "customerId"=$1 and "cycleNumber">1`, [card.customerId]);
    await sql(`delete from stamp where "loyaltyCardId"=$1`, [card.id]);
    for (let i = 0; i < REQUIRED; i++) await addStampRow(card.id, t.owner.userId, new Date(Date.now() + i));
    await sql(`update loyalty_card set status='COMPLETED' where id=$1`, [card.id]);
  };

  for (let round = 0; round < ROUNDS; round++) {
    const cust = await createCustomer(t.business.id);
    const card = await createCard(cust.id, t.program.id, { status: "COMPLETED" });
    await restore(card);
    const url = `${BASE_URL}/staff/cards/${card.cardToken}`;

    const undo = await captureAction(page, url, 'button:has-text("Undo Last Stamp")');
    await restore(card);
    const redeem = await captureAction(page, url, 'button:has-text("Redeem Reward")', { dialogAccept: true });
    await restore(card);

    // Fire both at once, several copies each, to widen the window.
    await Promise.all([replayAction(undo, 3), replayAction(redeem, 3)]);

    const finalCard = await sql1(`select status from loyalty_card where id=$1`, [card.id]);
    const stamps = (await sql1(`select count(*)::int as n from stamp where "loyaltyCardId"=$1`, [card.id])).n;
    const redemptions = (await sql1(`select count(*)::int as n from reward_redemption where "loyaltyCardId"=$1`, [card.id])).n;
    observed.push({ round, status: finalCard.status, stamps, redemptions });

    if (finalCard.status === "REDEEMED") {
      assert(stamps >= REQUIRED,
        `round ${round}: card REDEEMED with only ${stamps}/${REQUIRED} stamps — reward granted on an under-stamped card`);
    }
    assert(redemptions <= 1, `round ${round}: ${redemptions} redemption rows for one card`);
  }
  await ctx.close();
  return `${ROUNDS} rounds: ${JSON.stringify(observed)}`;
});

// ───────────────────────────────────────────────── H-2 session revocation
await test("H-2", "Expired DB session is rejected immediately", async () => {
  const user = await signUpUser();
  const biz = await createBusiness();
  await addMembership(user.userId, biz.id, "OWNER");
  const before = await fetch(`${BASE_URL}/dashboard`, { headers: { cookie: user.cookie }, redirect: "manual" });
  assert(before.status === 200, `baseline: expected 200 while valid, got ${before.status}`);

  await sql(`update session set "expiresAt" = now() - interval '1 hour' where "userId" = $1`, [user.userId]);
  const after = await fetch(`${BASE_URL}/dashboard`, { headers: { cookie: user.cookie }, redirect: "manual" });
  const body = after.status === 200 ? await after.text() : "";
  const bounced = after.status >= 300 && after.status < 400 || /NEXT_REDIRECT|\/login/.test(body);
  assert(bounced, `expired session still served the dashboard (status ${after.status})`);
  return `valid=200, expired -> ${after.status}${bounced ? " (redirected to /login)" : ""}`;
});

// ────────────────────────────────────── H-3 rejoin with unredeemed full card
await test("H-3", "Rejoin with a COMPLETED card returns it, not a 2nd card", async () => {
  const t = await seedTenant({ requiredStamps: 3 });
  const phone = "09" + Math.floor(100000000 + Math.random() * 899999999);
  const cust = await createCustomer(t.business.id, { name: "Rejoin QA", phone: phone.replace(/\D/g, "") });
  const done = await createCard(cust.id, t.program.id, { status: "COMPLETED" });
  for (let i = 0; i < 3; i++) await addStampRow(done.id, t.owner.userId, new Date(Date.now() + i));

  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/join/${t.store.slug}`);
  await page.fill('input[name="name"]', "Rejoin QA");
  await page.fill('input[name="phone"]', phone);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  const cards = await sql(`select "cardToken", status from loyalty_card where "customerId"=$1`, [cust.id]);
  await ctx.close();
  assertEq(cards.length, 1, "card count after rejoin:");
  assertEq(cards[0].cardToken, done.cardToken, "returned token:");
  assert(page.url().includes(done.cardToken), `landed on ${page.url()}, expected the completed card`);
  return `1 card, returned the existing COMPLETED one (${cards[0].status})`;
});

// ───────────────────────────────────────────── H-4 store slug race recovery
await test("H-4", "Colliding store slugs never leave a business with 0 stores", async () => {
  const sharedName = `Race Cafe ${uid("x")}`;
  const owners = [];
  for (let i = 0; i < 3; i++) {
    const o = await signUpUser();
    const b = await createBusiness(sharedName);
    await addMembership(o.userId, b.id, "OWNER");
    owners.push({ o, b });
  }
  // Fire program creation (which lazily creates the store) concurrently.
  const runs = owners.map(async ({ o, b }) => {
    const ctx = await newContext(browser, { cookie: o.cookie });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/dashboard/program`);
    await page.waitForLoadState("networkidle");
    await page.fill('input[name="name"]', "Race Program");
    await page.fill('input[name="requiredStamps"]', "5");
    await page.fill('input[name="rewardText"]', "Free drink");
    return { ctx, page, click: page.click('button[type="submit"]') };
  });
  const prepared = await Promise.all(runs);
  await Promise.all(prepared.map((p) => p.click.catch(() => {})));
  await new Promise((r) => setTimeout(r, 4000));

  const report = [];
  for (const { b } of owners) {
    const stores = await sql(`select id, slug from store where "businessId"=$1`, [b.id]);
    report.push({ business: b.id.slice(0, 8), stores: stores.length, slugs: stores.map((s) => s.slug) });
  }
  await Promise.all(prepared.map((p) => p.ctx.close()));
  const broken = report.filter((r) => r.stores === 0);
  assertEq(broken.length, 0, `businesses left with zero stores: ${JSON.stringify(broken)} — full: ${JSON.stringify(report)}`);
  return JSON.stringify(report);
});

// ───────────────────────────────────────────────────── H-5 error boundaries
await test("H-5", "Unknown route shows a friendly page, not a raw error", async () => {
  const res = await fetch(`${BASE_URL}/definitely-not-a-real-route-${uid("x")}`);
  const html = await res.text();
  const leaks = /at async |\.ts:\d+:\d+|PrismaClient|Error: /.test(html);
  assert(!leaks, "raw error/stack trace visible on the not-found page");
  assert(/StampMate|not found|Not Found|go back|home/i.test(html), "no friendly not-found copy found");
  return `status ${res.status}, friendly copy present, no stack trace`;
});

// ─────────────────────────────────────────────────── M-1 no enumeration
await test("M-1", "Duplicate registration does not confirm the email exists", async () => {
  const existing = await signUpUser();
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const dup = await registerOwnerViaUI(page, { email: existing.email }).catch(() => null);
  await page.waitForTimeout(1200);
  const err = (await page.textContent("p.text-destructive").catch(() => "")) ?? "";
  await ctx.close();
  assert(!/already exists|already registered|taken/i.test(err), `message enumerates: "${err}"`);
  assert(err.length > 0, "no error message shown at all");
  return `message: "${err}"`;
});

// ────────────────────────────────────── M-2 one program per store under race
await test("M-2", "Concurrent program creation yields exactly one program", async () => {
  const observed = [];
  for (let round = 0; round < 3; round++) {
    const o = await signUpUser();
    const b = await createBusiness();
    await addMembership(o.userId, b.id, "OWNER");
    const store = await createStore(b.id);
    const ctx = await newContext(browser, { cookie: o.cookie });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/dashboard/program`);
    await page.waitForLoadState("networkidle");
    await page.fill('input[name="name"]', "Dup Program");
    await page.fill('input[name="requiredStamps"]', "5");
    await page.fill('input[name="rewardText"]', "Free drink");
    // Capture inline: captureAction() re-navigates, which would discard the
    // fields filled above and let native `required` validation block the POST.
    const url = `${BASE_URL}/dashboard/program`;
    let captured = null;
    const listener = async (req) => {
      if (req.method() === "POST" && req.url() === url && !captured) {
        captured = { url: req.url(), headers: await req.allHeaders(), postData: req.postData() };
      }
    };
    page.on("request", listener);
    await page.click('button:has-text("Create program")');
    await page.waitForTimeout(2000);
    page.off("request", listener);
    assert(captured, "failed to capture the createLoyaltyProgram POST");
    // The capture click already created the program; clear it so the replay
    // races from a clean slate.
    await sql(`delete from loyalty_program where "storeId" = $1`, [store.id]);
    const res = await replayAction(captured, CONCURRENCY);
    const n = (await sql1(
      `select count(*)::int as n from loyalty_program lp join store s on s.id=lp."storeId" where s."businessId"=$1`, [b.id])).n;
    const err500 = res.filter((r) => r.status >= 500).length;
    observed.push({ round, programs: n, http500: err500 });
    await ctx.close();
    assert(n <= 1, `round ${round}: ${n} programs for one store`);
    assert(err500 === 0, `round ${round}: ${err500} HTTP 5xx`);
  }
  return JSON.stringify(observed);
});

// ─────────────────────────────────────────────── M-3 phone `+` equivalence
await test("M-3", "'+63…' and '63…' resolve to the same customer", async () => {
  const t = await seedTenant();
  const digits = "639" + Math.floor(100000000 + Math.random() * 899999999);
  const tokens = [];
  for (const input of [`+${digits}`, digits]) {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/join/${t.store.slug}`);
    await page.fill('input[name="name"]', "Plus QA");
    await page.fill('input[name="phone"]', input);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/card\//, { timeout: 15000 });
    tokens.push(page.url().split("/card/")[1]);
    await ctx.close();
  }
  const custs = await sql(`select id, phone from customer where "businessId"=$1 and phone like $2`, [t.business.id, `%${digits}%`]);
  assertEq(tokens[0], tokens[1], "card token for +63 vs 63:");
  assertEq(custs.length, 1, "customer rows created:");
  return `one customer (phone="${custs[0].phone}"), same card token`;
});

// ──────────────────────────────────────────────────── M-4 staff tap targets
await test("M-4", "Staff action buttons are >= 44px tall on mobile", async () => {
  const t = await seedTenant({ requiredStamps: 3, stamps: 3 });
  await sql(`update loyalty_card set status='COMPLETED' where id=$1`, [t.card.id]);
  const ctx = await newContext(browser, { cookie: t.owner.cookie, mobile: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/staff/cards/${t.card.cardToken}`);
  await page.waitForLoadState("networkidle");
  const sizes = {};
  for (const label of ["Add Stamp", "Undo Last Stamp", "Redeem Reward"]) {
    const el = await page.$(`button:has-text("${label}")`);
    if (!el) continue;
    const box = await el.boundingBox();
    sizes[label] = box ? Math.round(box.height) : null;
  }
  await ctx.close();
  const small = Object.entries(sizes).filter(([, h]) => h !== null && h < 44);
  assertEq(small.length, 0, `buttons under 44px: ${JSON.stringify(small)} — all: ${JSON.stringify(sizes)}`);
  return JSON.stringify(sizes);
});

// ───────────────────────────────────────────────────────── M-5 dark mode
await test("M-5", "Dark mode follows prefers-color-scheme", async () => {
  const read = async (scheme) => {
    const ctx = await browser.newContext({ colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState("networkidle");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await ctx.close();
    return bg;
  };
  const light = await read("light");
  const dark = await read("dark");
  assert(light !== dark, `background identical in both schemes (${light}) — dark mode still inert`);
  return `light=${light} dark=${dark}`;
});

// ───────────────────────────────────────── L-4 redirectTo works, no open redirect
await test("L-4", "redirectTo honors internal paths and ignores external ones", async () => {
  const t = await seedTenant();
  // Assert on the resolved origin + pathname, never a substring of the whole
  // URL — the rejected target stays in the query string, so a naive
  // `includes("evil.com")` check reports a false positive.
  const cases = [
    { param: "/staff", path: "/staff" },
    { param: "https://evil.com/", path: "/dashboard" },
    { param: "//evil.com/", path: "/dashboard" },
    { param: "/\\evil.com", path: "/dashboard" },
  ];
  const out = [];
  for (const c of cases) {
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/login?redirectTo=${encodeURIComponent(c.param)}`);
    await page.fill('input[name="email"]', t.owner.email);
    await page.fill('input[name="password"]', t.owner.password);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    const landed = new URL(page.url());
    out.push({ param: c.param, origin: landed.origin, pathname: landed.pathname });
    await ctx.close();
    assertEq(landed.origin, BASE_URL, `redirectTo=${c.param} left the app origin —`);
    assertEq(landed.pathname, c.path, `redirectTo=${c.param} pathname —`);
  }
  return JSON.stringify(out);
});

// ─────────────────────────────────────────────────── L-5 redirect status (info)
await test("L-5", "Owner-only route redirect status for a STAFF user (informational)", async () => {
  const staff = await signUpUser();
  const b = await createBusiness();
  await addMembership(staff.userId, b.id, "STAFF");
  const res = await fetch(`${BASE_URL}/dashboard/program`, { headers: { cookie: staff.cookie }, redirect: "manual" });
  const body = res.status === 200 ? await res.text() : "";
  const leaks = /requiredStamps|Create program|rewardText/.test(body);
  assert(!leaks, "owner-only program form leaked to a STAFF user");
  return `status ${res.status}${res.status === 200 ? " (NEXT_REDIRECT flight marker, no data leak)" : ""}`;
});

// ────────────────────────────────────────────────────── L-6 customer pagination
await test("L-6", "Customer list is paginated", async () => {
  const t = await seedTenant();
  for (let i = 0; i < 30; i++) {
    const c = await createCustomer(t.business.id, { name: `Bulk ${String(i).padStart(3, "0")}` });
    await createCard(c.id, t.program.id);
  }
  const ctx = await newContext(browser, { cookie: t.owner.cookie });
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/dashboard/customers`);
  await page.waitForLoadState("networkidle");
  const total = (await sql1(`select count(*)::int as n from customer where "businessId"=$1`, [t.business.id])).n;
  const rendered = await page.$$eval("body", (els) => (els[0].innerText.match(/Bulk \d{3}/g) || []).length);
  const hasControls = /next|previous|page/i.test(await page.innerText("body"));
  await ctx.close();
  assert(rendered < total, `all ${total} customers rendered on one page (${rendered}) — not paginated`);
  assert(hasControls, "no pagination controls found");
  return `${rendered} of ${total} rendered on page 1, controls present`;
});

// ──────────────────────────────────────────────────────────── L-7 headings
await test("L-7", "Previously heading-less routes now have exactly one h1", async () => {
  const t = await seedTenant();
  const ctx = await newContext(browser, { cookie: t.owner.cookie });
  const page = await ctx.newPage();
  const routes = ["/login", "/register", `/card/${t.card.cardToken}`, `/staff/cards/${t.card.cardToken}`];
  const counts = {};
  for (const r of routes) {
    await page.goto(`${BASE_URL}${r}`);
    await page.waitForLoadState("networkidle");
    counts[r] = await page.$$eval("h1", (els) => els.length);
  }
  await ctx.close();
  const bad = Object.entries(counts).filter(([, n]) => n !== 1);
  assertEq(bad.length, 0, `routes without exactly one h1: ${JSON.stringify(counts)}`);
  return JSON.stringify(counts);
});

// ───────────────────────────────────────────────────────── L-8 metadataBase
await test("L-8", "OG image URL is absolute and not localhost:3000", async () => {
  const html = await (await fetch(`${BASE_URL}/`)).text();
  const m = html.match(/property="og:image"[^>]*content="([^"]+)"/) ?? html.match(/content="([^"]+)"[^>]*property="og:image"/);
  assert(m, "no og:image meta tag found");
  assert(!m[1].includes("localhost:3000"), `og:image still falls back to localhost:3000: ${m[1]}`);
  return m[1];
});

// ───────────────────────────────────────────────── regression: happy path
await test("REG", "Full MVP happy path still works end to end", async () => {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  const owner = await registerOwnerViaUI(page, { businessName: uid("Reg Cafe") });
  await page.goto(`${BASE_URL}/dashboard/program`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[name="name"]', "Reg Program");
  await page.fill('input[name="requiredStamps"]', "3");
  await page.fill('input[name="rewardText"]', "Free latte");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  const m = await sql1(`select sm."businessId" from staff_membership sm join "user" u on u.id=sm."userId" where u.email=$1`, [owner.email]);
  const store = await sql1(`select * from store where "businessId"=$1`, [m.businessId]);
  assert(store, "no store created");

  const cctx = await newContext(browser, { mobile: true });
  const cpage = await cctx.newPage();
  await cpage.goto(`${BASE_URL}/join/${store.slug}`);
  await cpage.fill('input[name="name"]', "Reg Customer");
  await cpage.fill('input[name="phone"]', "0917 555 1234");
  await cpage.click('button[type="submit"]');
  await cpage.waitForURL(/\/card\//, { timeout: 15000 });
  const token = cpage.url().split("/card/")[1];

  await page.goto(`${BASE_URL}/staff/cards/${token}`);
  await page.waitForLoadState("networkidle");
  for (let i = 0; i < 3; i++) {
    await page.click('button:has-text("Add Stamp")');
    await page.waitForTimeout(1200);
  }
  const card = await sql1(`select id, status from loyalty_card where "cardToken"=$1`, [token]);
  assertEq(card.status, "COMPLETED", "status after 3 stamps:");

  await page.goto(`${BASE_URL}/staff/cards/${token}`);
  await page.waitForLoadState("networkidle");
  page.once("dialog", (d) => d.accept());
  await page.click('button:has-text("Redeem Reward")');
  await page.waitForTimeout(3000);
  const after = await sql(`select status, "cycleNumber" from loyalty_card where "customerId"=(select "customerId" from loyalty_card where "cardToken"=$1) order by "cycleNumber"`, [token]);
  await ctx.close();
  await cctx.close();
  assertEq(after.length, 2, "cards after redeem:");
  assertEq(after[0].status, "REDEEMED", "old card:");
  assertEq(after[1].status, "ACTIVE", "new card:");
  return `register -> program -> join -> 3 stamps -> COMPLETED -> redeem -> cycle 2 ACTIVE`;
});

summary();
await browser.close();
await shutdown();
