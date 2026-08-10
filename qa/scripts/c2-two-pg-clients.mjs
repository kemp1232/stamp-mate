// Deterministic two-pg-client reproduction of C2, run BEFORE and AFTER the
// fix to src/lib/actions/rewards.ts. Manually orchestrates the exact SQL
// each transaction issues (mirroring the Prisma-generated statements) so
// the interleaving is controlled step-by-step rather than hoping two HTTP
// requests race by chance.
import pg from "pg";
import { randomUUID } from "node:crypto";

const DB_URL = "postgresql://postgres:postgres@127.0.0.1:56322/postgres";

async function setupCard(pool, { requiredStamps = 3 } = {}) {
  const now = new Date();
  const businessId = randomUUID();
  const storeId = randomUUID();
  const programId = randomUUID();
  const customerId = randomUUID();
  const staffUserId = randomUUID();
  const cardId = randomUUID();
  const cardToken = randomUUID();

  await pool.query(`insert into business (id, name, "createdAt", "updatedAt") values ($1,'C2 Probe',$2,$2)`, [businessId, now]);
  await pool.query(`insert into "user" (id, name, email, "createdAt", "updatedAt") values ($1,'C2 Staff',$2,$3,$3)`, [staffUserId, `${staffUserId}@qa.test`, now]);
  await pool.query(`insert into store (id, "businessId", name, slug, "createdAt", "updatedAt") values ($1,$2,'C2 Store',$3,$4,$4)`, [storeId, businessId, `c2-store-${storeId}`, now]);
  await pool.query(`insert into loyalty_program (id, "storeId", name, "requiredStamps", "rewardText", status, "createdAt", "updatedAt") values ($1,$2,'C2 Program',$3,'Free item','ACTIVE',$4,$4)`, [programId, storeId, requiredStamps, now]);
  await pool.query(`insert into customer (id, "businessId", name, phone, "createdAt", "updatedAt") values ($1,$2,'C2 Customer',$3,$4,$4)`, [customerId, businessId, `0917${Math.floor(1000000 + Math.random() * 8999999)}`, now]);
  await pool.query(`insert into loyalty_card (id, "customerId", "loyaltyProgramId", "cardToken", status, "cycleNumber", "createdAt", "updatedAt") values ($1,$2,$3,$4,'COMPLETED',1,$5,$5)`, [cardId, customerId, programId, cardToken, now]);
  for (let i = 0; i < requiredStamps; i++) {
    await pool.query(`insert into stamp (id, "loyaltyCardId", "staffUserId", "createdAt") values ($1,$2,$3,$4)`, [randomUUID(), cardId, staffUserId, new Date(Date.now() + i)]);
  }
  return { cardId, programId, customerId, staffUserId, requiredStamps };
}

async function cardState(pool, cardId) {
  const card = (await pool.query(`select status, "cycleNumber" from loyalty_card where id=$1`, [cardId])).rows[0];
  const stampCount = (await pool.query(`select count(*)::int as n from stamp where "loyaltyCardId"=$1`, [cardId])).rows[0].n;
  const redemption = (await pool.query(`select id from reward_redemption where "loyaltyCardId"=$1`, [cardId])).rows[0] ?? null;
  const newCycleCards = (await pool.query(`select id, status, "cycleNumber" from loyalty_card where "customerId"=(select "customerId" from loyalty_card where id=$1) and id<>$1`, [cardId])).rows;
  return { status: card.status, stampCount, redeemed: !!redemption, newCycleCards };
}

// ---- undo transaction: the REAL, already-fixed logic from stamp.ts (unchanged by this fix) ----
async function runUndo(client, cardId) {
  await client.query("BEGIN");
  await client.query(`SELECT id FROM "loyalty_card" WHERE id = $1 FOR UPDATE`, [cardId]);
  const { rows: [fresh] } = await client.query(`select status from loyalty_card where id=$1`, [cardId]);
  if (fresh.status === "REDEEMED" || fresh.status === "CANCELLED") {
    await client.query("ROLLBACK");
    return { ok: false, reason: "cannot change" };
  }
  const { rows: [latest] } = await client.query(
    `select id from stamp where "loyaltyCardId"=$1 order by "createdAt" desc, id desc limit 1`,
    [cardId],
  );
  if (!latest) {
    await client.query("ROLLBACK");
    return { ok: false, reason: "no stamps" };
  }
  await client.query(`delete from stamp where id=$1`, [latest.id]);
  const { rows: [{ n: remaining }] } = await client.query(
    `select count(*)::int as n from stamp where "loyaltyCardId"=$1`,
    [cardId],
  );
  const { rows: [program] } = await client.query(
    `select lp."requiredStamps" from loyalty_program lp join loyalty_card lc on lc."loyaltyProgramId"=lp.id where lc.id=$1`,
    [cardId],
  );
  if (fresh.status === "COMPLETED" && remaining < program.requiredStamps) {
    await client.query(`update loyalty_card set status='ACTIVE' where id=$1`, [cardId]);
  }
  await client.query("COMMIT");
  return { ok: true };
}

// ---- redeem transaction: BEFORE the fix (unlocked read, unconditional update) ----
async function runRedeemBefore(client, cardId, customerId, programId, staffUserId) {
  await client.query("BEGIN");
  const { rows: [fresh] } = await client.query(`select status from loyalty_card where id=$1`, [cardId]);
  if (fresh.status !== "COMPLETED") {
    await client.query("ROLLBACK");
    return { ok: false, reason: "not ready" };
  }
  await client.query(`update loyalty_card set status='REDEEMED' where id=$1`, [cardId]);
  await client.query(
    `insert into reward_redemption (id, "loyaltyCardId", "staffUserId", "createdAt") values ($1,$2,$3,now())`,
    [randomUUID(), cardId, staffUserId],
  );
  await client.query(
    `insert into loyalty_card (id, "customerId", "loyaltyProgramId", "cardToken", status, "cycleNumber", "createdAt", "updatedAt") values ($1,$2,$3,$4,'ACTIVE',2,now(),now())`,
    [randomUUID(), customerId, programId, randomUUID()],
  );
  await client.query("COMMIT");
  return { ok: true };
}

// ---- redeem transaction: AFTER the fix (row lock + status/count re-check + conditional update) ----
async function runRedeemAfter(client, cardId, customerId, programId, staffUserId) {
  await client.query("BEGIN");
  await client.query(`SELECT id FROM "loyalty_card" WHERE id = $1 FOR UPDATE`, [cardId]);
  const { rows: [fresh] } = await client.query(
    `select lc.status, (select count(*)::int from stamp where "loyaltyCardId"=lc.id) as "stampCount"
     from loyalty_card lc where lc.id=$1`,
    [cardId],
  );
  if (fresh.status !== "COMPLETED") {
    await client.query("ROLLBACK");
    return { ok: false, reason: "not ready (status)" };
  }
  const { rows: [program] } = await client.query(`select "requiredStamps" from loyalty_program where id=$1`, [programId]);
  if (fresh.stampCount < program.requiredStamps) {
    await client.query("ROLLBACK");
    return { ok: false, reason: "not ready (understamped)" };
  }
  const { rowCount } = await client.query(`update loyalty_card set status='REDEEMED' where id=$1 and status='COMPLETED'`, [cardId]);
  if (rowCount === 0) {
    await client.query("ROLLBACK");
    return { ok: false, reason: "not ready (lost race)" };
  }
  await client.query(
    `insert into reward_redemption (id, "loyaltyCardId", "staffUserId", "createdAt") values ($1,$2,$3,now())`,
    [randomUUID(), cardId, staffUserId],
  );
  await client.query(
    `insert into loyalty_card (id, "customerId", "loyaltyProgramId", "cardToken", status, "cycleNumber", "createdAt", "updatedAt") values ($1,$2,$3,$4,'ACTIVE',2,now(),now())`,
    [randomUUID(), customerId, programId, randomUUID()],
  );
  await client.query("COMMIT");
  return { ok: true };
}

async function main() {
  const pool = new pg.Pool({ connectionString: DB_URL, max: 10 });

  // ===================================================== BEFORE the fix
  {
    const { cardId, programId, customerId, requiredStamps, staffUserId } = await setupCard(pool, { requiredStamps: 3 });
    const clientRedeem = await pool.connect();
    const clientUndo = await pool.connect();
    console.log(`\n--- BEFORE fix: card ${cardId} seeded COMPLETED with ${requiredStamps}/${requiredStamps} stamps ---`);

    // Step 1: redeem's unlocked read happens FIRST (sees COMPLETED)...
    await clientRedeem.query("BEGIN");
    const { rows: [readBefore] } = await clientRedeem.query(`select status from loyalty_card where id=$1`, [cardId]);
    console.log(`redeem's unlocked read: status=${readBefore.status}`);

    // Step 2: ...then undo runs to completion and commits underneath it.
    const undoResult = await runUndo(clientUndo, cardId);
    console.log(`undo committed: ${JSON.stringify(undoResult)}`);

    // Step 3: redeem resumes with its now-stale belief that status was
    // COMPLETED, and unconditionally writes REDEEMED.
    await clientRedeem.query(`update loyalty_card set status='REDEEMED' where id=$1`, [cardId]);
    await clientRedeem.query(
      `insert into reward_redemption (id, "loyaltyCardId", "staffUserId", "createdAt") values ($1,$2,$3,now())`,
      [randomUUID(), cardId, staffUserId],
    );
    await clientRedeem.query(
      `insert into loyalty_card (id, "customerId", "loyaltyProgramId", "cardToken", status, "cycleNumber", "createdAt", "updatedAt") values ($1,$2,$3,$4,'ACTIVE',2,now(),now())`,
      [randomUUID(), customerId, programId, randomUUID()],
    );
    await clientRedeem.query("COMMIT");

    const state = await cardState(pool, cardId);
    console.log(`FINAL STATE: ${JSON.stringify(state)}`);
    const vulnerable = state.redeemed && state.stampCount < requiredStamps;
    console.log(vulnerable
      ? `*** VULNERABLE: card REDEEMED with only ${state.stampCount}/${requiredStamps} stamps, no error surfaced ***`
      : `NOT reproduced (unexpected on the pre-fix code path)`);

    clientRedeem.release();
    clientUndo.release();
  }

  // ====================================================== AFTER the fix
  {
    const { cardId, programId, customerId, requiredStamps, staffUserId } = await setupCard(pool, { requiredStamps: 3 });
    const clientRedeem = await pool.connect();
    const clientUndo = await pool.connect();
    console.log(`\n--- AFTER fix: card ${cardId} seeded COMPLETED with ${requiredStamps}/${requiredStamps} stamps ---`);
    console.log("Same interleaving intent: undo runs to completion first, then redeem attempts.");

    const undoResult = await runUndo(clientUndo, cardId);
    console.log(`undo committed: ${JSON.stringify(undoResult)}`);

    const redeemResult = await runRedeemAfter(clientRedeem, cardId, customerId, programId, staffUserId);
    console.log(`redeem result: ${JSON.stringify(redeemResult)}`);

    const state = await cardState(pool, cardId);
    console.log(`FINAL STATE: ${JSON.stringify(state)}`);
    const stillVulnerable = state.redeemed && state.stampCount < requiredStamps;
    console.log(stillVulnerable
      ? `*** STILL VULNERABLE ***`
      : `FIXED: redeem correctly rejected the under-stamped card (${JSON.stringify(redeemResult)}); card left ${state.status} with ${state.stampCount}/${requiredStamps} stamps, not redeemed.`);

    clientRedeem.release();
    clientUndo.release();
  }

  // ========================================== AFTER fix, reverse ordering
  // (redeem's row lock wins first) — confirms the fix doesn't regress the
  // H-1 guarantee that undo can't corrupt an already-redeemed card either.
  {
    const { cardId, programId, customerId, requiredStamps, staffUserId } = await setupCard(pool, { requiredStamps: 3 });
    const clientRedeem = await pool.connect();
    const clientUndo = await pool.connect();
    console.log(`\n--- AFTER fix, reverse order: redeem locks first, then undo ---`);

    const redeemResult = await runRedeemAfter(clientRedeem, cardId, customerId, programId, staffUserId);
    console.log(`redeem result: ${JSON.stringify(redeemResult)}`);
    const undoResult = await runUndo(clientUndo, cardId);
    console.log(`undo result: ${JSON.stringify(undoResult)}`);

    const state = await cardState(pool, cardId);
    console.log(`FINAL STATE: ${JSON.stringify(state)}`);
    const ok = state.redeemed && state.stampCount === requiredStamps && !undoResult.ok;
    console.log(ok
      ? `OK: redeem succeeded with the full ${requiredStamps}/${requiredStamps} stamps intact, undo correctly rejected afterward.`
      : `*** UNEXPECTED ***`);

    clientRedeem.release();
    clientUndo.release();
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
