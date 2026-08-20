// Shared QA harness for StampMate.
// Usage from a suite script:  import { ... } from '../lib/harness.js'
import pg from "pg";
import { chromium } from "playwright";
import { randomUUID, randomBytes } from "node:crypto";

// Overridable via env so CI (standard Postgres port, app on a fixed port) doesn't
// need to touch source — local usage is unaffected since both fall back to the
// values that match `npm run dev -- -p 3100` against a local Supabase instance.
export const BASE_URL = process.env.QA_BASE_URL ?? "http://localhost:3100";
export const DB_URL = process.env.QA_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:56322/postgres";

export const pool = new pg.Pool({ connectionString: DB_URL, max: 8 });

/** Raw SQL. `sql('select * from customer where id = $1', [id])` -> rows array */
export async function sql(text, params = []) {
  const res = await pool.query(text, params);
  return res.rows;
}
export async function sql1(text, params = []) {
  const rows = await sql(text, params);
  return rows[0] ?? null;
}

/** Unique-per-run suffix so parallel suites never collide. */
export function uid(prefix = "t") {
  return `${prefix}-${randomBytes(5).toString("hex")}`;
}

// ---------------------------------------------------------------- auth (HTTP)

/**
 * Registers a Better Auth user via the real HTTP API (correct password hashing).
 * Returns { userId, email, password, cookie } where cookie is the raw Cookie header.
 */
export async function signUpUser({ name = "QA User", email, password = "password123" } = {}) {
  email = email ?? `${uid("user")}@qa.test`;
  const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE_URL },
    body: JSON.stringify({ name, email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`sign-up failed ${res.status}: ${JSON.stringify(body)}`);
  }
  const cookie = parseSetCookie(res.headers);
  const userId = body?.user?.id ?? (await sql1(`select id from "user" where email = $1`, [email]))?.id;
  return { userId, email, password, name, cookie };
}

export async function signInUser({ email, password = "password123" }) {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE_URL },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body, cookie: res.ok ? parseSetCookie(res.headers) : null };
}

function parseSetCookie(headers) {
  const raw = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie")].filter(Boolean);
  return raw.map((c) => c.split(";")[0]).join("; ");
}

/** Turn a raw Cookie header into playwright cookie objects for a context. */
export function cookieHeaderToPlaywright(cookieHeader) {
  return cookieHeader.split("; ").filter(Boolean).map((pair) => {
    const idx = pair.indexOf("=");
    return {
      name: pair.slice(0, idx),
      value: pair.slice(idx + 1),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    };
  });
}

// ------------------------------------------------------------ seeding (direct)

const now = () => new Date();

export async function createBusiness(name = uid("Biz")) {
  const id = randomUUID();
  await sql(
    `insert into business (id, name, "createdAt", "updatedAt") values ($1,$2,$3,$3)`,
    [id, name, now()],
  );
  return { id, name };
}

export async function addMembership(userId, businessId, role = "OWNER") {
  const id = randomUUID();
  await sql(
    `insert into staff_membership (id, role, "userId", "businessId", "createdAt", "updatedAt")
     values ($1,$2::"StaffRole",$3,$4,$5,$5)`,
    [id, role, userId, businessId, now()],
  );
  return id;
}

export async function createStore(businessId, name = uid("Store"), slug = null) {
  const id = randomUUID();
  slug = slug ?? uid("store");
  await sql(
    `insert into store (id, "businessId", name, slug, "createdAt", "updatedAt") values ($1,$2,$3,$4,$5,$5)`,
    [id, businessId, name, slug, now()],
  );
  return { id, businessId, name, slug };
}

export async function createProgram(storeId, { name = "QA Program", requiredStamps = 5, rewardText = "Free coffee", status = "ACTIVE" } = {}) {
  const id = randomUUID();
  await sql(
    `insert into loyalty_program (id, "storeId", name, "requiredStamps", "rewardText", status, "createdAt", "updatedAt")
     values ($1,$2,$3,$4,$5,$6::"LoyaltyProgramStatus",$7,$7)`,
    [id, storeId, name, requiredStamps, rewardText, status, now()],
  );
  return { id, storeId, name, requiredStamps, rewardText, status };
}

export async function createCustomer(businessId, { name = "QA Customer", phone = null } = {}) {
  const id = randomUUID();
  phone = phone ?? `0917${Math.floor(1000000 + Math.random() * 8999999)}`;
  await sql(
    `insert into customer (id, "businessId", name, phone, "createdAt", "updatedAt") values ($1,$2,$3,$4,$5,$5)`,
    [id, businessId, name, phone, now()],
  );
  return { id, businessId, name, phone };
}

export function newCardToken() {
  return randomBytes(24).toString("base64url");
}

export async function createCard(customerId, loyaltyProgramId, { status = "ACTIVE", cycleNumber = 1, cardToken = null } = {}) {
  const id = randomUUID();
  cardToken = cardToken ?? newCardToken();
  await sql(
    `insert into loyalty_card (id, "customerId", "loyaltyProgramId", "cardToken", status, "cycleNumber", "createdAt", "updatedAt")
     values ($1,$2,$3,$4,$5::"LoyaltyCardStatus",$6,$7,$7)`,
    [id, customerId, loyaltyProgramId, cardToken, status, cycleNumber, now()],
  );
  return { id, customerId, loyaltyProgramId, cardToken, status, cycleNumber };
}

export async function addStampRow(loyaltyCardId, staffUserId, createdAt = new Date()) {
  const id = randomUUID();
  await sql(`insert into stamp (id, "loyaltyCardId", "staffUserId", "createdAt") values ($1,$2,$3,$4)`,
    [id, loyaltyCardId, staffUserId, createdAt]);
  return id;
}

/**
 * One call to get a fully-wired tenant:
 * returns { owner, business, store, program, customer, card }
 */
export async function seedTenant({ requiredStamps = 5, role = "OWNER", stamps = 0, cardStatus = "ACTIVE", programStatus = "ACTIVE", storeName = null } = {}) {
  const owner = await signUpUser();
  const business = await createBusiness();
  await addMembership(owner.userId, business.id, role);
  const store = await createStore(business.id, storeName ?? uid("Store"));
  const program = await createProgram(store.id, { requiredStamps, status: programStatus });
  const customer = await createCustomer(business.id);
  const card = await createCard(customer.id, program.id, { status: cardStatus });
  for (let i = 0; i < stamps; i++) {
    await addStampRow(card.id, owner.userId, new Date(Date.now() + i));
  }
  return { owner, business, store, program, customer, card };
}

// ------------------------------------------------------------------- browser

export async function launch({ mobile = false } = {}) {
  const browser = await chromium.launch();
  return browser;
}

/** Fresh isolated context; pass a cookie header to be logged in. */
export async function newContext(browser, { cookie = null, mobile = false } = {}) {
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
          userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
      : { viewport: { width: 1280, height: 900 } },
  );
  if (cookie) await ctx.addCookies(cookieHeaderToPlaywright(cookie));
  return ctx;
}

/** Registers a brand new owner THROUGH THE UI (exercises registerOwner action). */
export async function registerOwnerViaUI(page, { businessName = uid("Biz"), name = "QA Owner", email = null, password = "password123" } = {}) {
  email = email ?? `${uid("owner")}@qa.test`;
  await page.goto(`${BASE_URL}/register`);
  await page.fill('input[name="businessName"]', businessName);
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForLoadState("networkidle"),
    page.click('button[type="submit"]'),
  ]);
  return { businessName, name, email, password, url: page.url() };
}

// ------------------------------------------------------------------ reporting

const results = [];
export function record(id, title, status, detail = "", evidence = "") {
  results.push({ id, title, status, detail, evidence });
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : status === "BLOCKED" ? "⛔" : "⚠️";
  console.log(`${icon} ${id} ${title}${detail ? ` — ${detail}` : ""}`);
}

/**
 * Run one test case with automatic PASS/FAIL/ERROR capture.
 * fn should throw (e.g. via assert) to fail.
 */
export async function test(id, title, fn) {
  try {
    const detail = await fn();
    record(id, title, "PASS", typeof detail === "string" ? detail : "");
  } catch (err) {
    record(id, title, "FAIL", err?.message ?? String(err));
  }
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
export function assertEq(actual, expected, msg = "") {
  if (actual !== expected) throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export function summary() {
  const counts = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(counts));
  console.log("=== RESULTS_JSON_START ===");
  console.log(JSON.stringify(results, null, 2));
  console.log("=== RESULTS_JSON_END ===");
  return results;
}

export async function shutdown() {
  await pool.end().catch(() => {});
}
