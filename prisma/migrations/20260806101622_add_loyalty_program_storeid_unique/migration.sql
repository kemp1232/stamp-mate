-- Cleanup (I-3): any DB that ran the pre-fix getOrCreateDefaultStore /
-- createLoyaltyProgram code (H-4, M-2) may already hold more than one
-- loyalty_program row per storeId from a concurrent-create race. Without
-- this cleanup, CREATE UNIQUE INDEX below fails and `prisma migrate deploy`
-- aborts into a failed migration state that needs a manual
-- `prisma migrate resolve`.
--
-- Keep the OLDEST program per store as the survivor (tie-break: id, for
-- rows created in the same millisecond). All of that store's cards will end
-- up pointed at the survivor's id, so which ACTIVE card a given customer
-- keeps is decided over the *post-merge* candidate set: every ACTIVE card on
-- ANY of the store's duplicate programs, survivor's own included, ranked by
-- most-progressed first (most stamps, then oldest). Only the top-ranked
-- card per customer stays ACTIVE; every other one for that customer is
-- cancelled before the repoint, so the partial unique index
-- "loyalty_card_one_active_per_customer_program" never sees two ACTIVE
-- rows for the same (customerId, survivor_id) land at once.
--
-- Ranking across the full post-merge set (not "loser vs survivor only") is
-- required once there are 3+ duplicate programs: with a one-sided
-- survivor-vs-loser comparison, two losers that conflict with *each other*
-- (but not with the survivor) are both left ACTIVE and the repoint below
-- fails the unique index. And ranking by progress (not by which program
-- happens to be the survivor) is required because the survivor is picked by
-- program age, not by which of its cards has more stamps — a naive
-- survivor-wins cancellation can silently cancel a nearly-complete card in
-- favor of an almost-empty one.
--
-- Written as a DO block (not a one-shot statement) so it's a no-op — and
-- therefore safe to re-run — once no duplicates remain, which also makes
-- this file idempotent for `migrate deploy` re-execution.
DO $$
DECLARE
  dup RECORD;
  survivor_id TEXT;
BEGIN
  FOR dup IN
    SELECT "storeId"
    FROM loyalty_program
    GROUP BY "storeId"
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO survivor_id
    FROM loyalty_program
    WHERE "storeId" = dup."storeId"
    ORDER BY "createdAt" ASC, id ASC
    LIMIT 1;

    WITH candidates AS (
      SELECT
        lc.id,
        lc."customerId",
        lc."createdAt",
        COUNT(st.id) AS stamp_count
      FROM loyalty_card lc
      LEFT JOIN stamp st ON st."loyaltyCardId" = lc.id
      WHERE lc."loyaltyProgramId" IN (
        SELECT id FROM loyalty_program WHERE "storeId" = dup."storeId"
      )
      AND lc.status = 'ACTIVE'
      GROUP BY lc.id, lc."customerId", lc."createdAt"
    ),
    ranked AS (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY "customerId"
        ORDER BY stamp_count DESC, "createdAt" ASC, id ASC
      ) AS rn
      FROM candidates
    )
    UPDATE loyalty_card
    SET status = 'CANCELLED'
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

    UPDATE loyalty_card
    SET "loyaltyProgramId" = survivor_id
    WHERE "loyaltyProgramId" IN (
      SELECT id FROM loyalty_program
      WHERE "storeId" = dup."storeId" AND id <> survivor_id
    );

    DELETE FROM loyalty_program
    WHERE "storeId" = dup."storeId" AND id <> survivor_id;
  END LOOP;
END $$;

-- DropIndex
DROP INDEX IF EXISTS "loyalty_program_storeId_idx";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_program_storeId_key" ON "loyalty_program"("storeId");
