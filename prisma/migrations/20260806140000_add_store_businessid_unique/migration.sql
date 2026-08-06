-- Cleanup (I-2, and the I-3 pattern applied here too): any DB that ran the
-- pre-fix getOrCreateDefaultStore code may already hold more than one
-- store row per businessId — the old code only recovered from *slug*
-- collisions, so two concurrent calls for the SAME business that landed on
-- two different (both otherwise-available) slugs both succeeded. Without
-- this cleanup, CREATE UNIQUE INDEX below fails.
--
-- Canonical store per business ("survivor"): prefer whichever duplicate
-- already has a loyalty_program attached — a store nobody ever put a
-- program on is definitively the abandoned duplicate. Tie-break on the
-- oldest store, then id. Because of that ordering, the survivor already
-- owns a program whenever *any* store in the group does (there is no case
-- where the survivor is program-less while a duplicate isn't), so there is
-- nothing to "adopt" — only to merge in any *other* duplicate's program.
--
-- Merge: for every other duplicate store that also has its own program
-- (the same shape as the loyalty_program storeId cleanup one migration
-- up), pick which ACTIVE card each customer keeps over the post-merge
-- candidate set — every ACTIVE card across all of this business's
-- duplicate programs, survivor's own included, ranked most-progressed
-- first (most stamps, then oldest) — cancel the rest, repoint what's left
-- onto the survivor's program, then delete the emptied duplicate program.
-- Once every non-survivor store for this business has zero programs left,
-- deleting it cascades to nothing.
--
-- Ranking across the full post-merge set, not "loser vs survivor only", is
-- required once there are 3+ duplicate stores with programs: a one-sided
-- survivor-vs-loser comparison lets two losers that conflict with *each
-- other* both stay ACTIVE, and the repoint below then fails the unique
-- index. Ranking by progress, not by which program happens to be the
-- survivor's, avoids silently cancelling a nearly-complete card in favor
-- of an almost-empty one just because it belonged to the older store.
--
-- A DO block (not a one-shot statement) so it's a no-op, and therefore
-- safe to re-run, once no duplicates remain.
DO $$
DECLARE
  dup RECORD;
  survivor_id TEXT;
BEGIN
  FOR dup IN
    SELECT "businessId"
    FROM store
    GROUP BY "businessId"
    HAVING COUNT(*) > 1
  LOOP
    SELECT s.id INTO survivor_id
    FROM store s
    LEFT JOIN loyalty_program lp ON lp."storeId" = s.id
    WHERE s."businessId" = dup."businessId"
    ORDER BY (lp.id IS NULL) ASC, s."createdAt" ASC, s.id ASC
    LIMIT 1;

    WITH candidates AS (
      SELECT
        lc.id,
        lc."customerId",
        lc."createdAt",
        COUNT(st.id) AS stamp_count
      FROM loyalty_card lc
      JOIN loyalty_program lp ON lp.id = lc."loyaltyProgramId"
      JOIN store s ON s.id = lp."storeId"
      LEFT JOIN stamp st ON st."loyaltyCardId" = lc.id
      WHERE s."businessId" = dup."businessId"
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
    SET "loyaltyProgramId" = (
      SELECT id FROM loyalty_program WHERE "storeId" = survivor_id
    )
    WHERE "loyaltyProgramId" IN (
      SELECT lp.id FROM loyalty_program lp
      JOIN store s ON s.id = lp."storeId"
      WHERE s."businessId" = dup."businessId" AND s.id <> survivor_id
    );

    DELETE FROM loyalty_program
    WHERE "storeId" IN (
      SELECT id FROM store
      WHERE "businessId" = dup."businessId" AND id <> survivor_id
    );

    -- Safe now: every non-survivor store for this business has zero
    -- programs left, so deleting it cascades to nothing.
    DELETE FROM store
    WHERE "businessId" = dup."businessId" AND id <> survivor_id;
  END LOOP;
END $$;

-- DropIndex
DROP INDEX IF EXISTS "store_businessId_idx";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "store_businessId_key" ON "store"("businessId");
