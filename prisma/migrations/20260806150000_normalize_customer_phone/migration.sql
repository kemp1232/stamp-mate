-- Cleanup (C-3): normalizePhone() now strips a leading "+" so "+639..."
-- and "639..." collapse to the same customer going forward (M-3). But
-- phone is half the natural key (@@unique([businessId, phone])) and the
-- join-flow upsert key, so any customer row already stored in the pre-fix
-- "+"-prefixed (or otherwise unnormalized) form must be merged with its
-- now-equivalent row BEFORE this migration rewrites the phone column —
-- otherwise the two rows collide on the unique index and the UPDATE below
-- fails, or a bare rewrite silently orphans the "+"-form customer's cards
-- behind a now-unreachable key. Written generally (group by normalized
-- digits, not just a "+" check) to catch any (businessId, phone) pair that
-- collides once normalized, e.g. legacy rows with stray formatting.
--
-- Survivor per colliding group: the oldest customer (tie-break: id). All of
-- that group's cards will end up pointed at the survivor's customerId, so
-- which ACTIVE card is kept per loyalty program is decided over the
-- *post-merge* candidate set: every ACTIVE card belonging to ANY customer
-- in the colliding group, survivor's own included, ranked (per program)
-- most-progressed first (most stamps, then oldest). Only the top-ranked
-- card per program stays ACTIVE; every other one is cancelled before the
-- repoint, so the partial unique index
-- "loyalty_card_one_active_per_customer_program" never sees two ACTIVE
-- rows land on the same (survivor_id, loyaltyProgramId) at once. Then the
-- now-emptied loser customer rows are deleted (ON DELETE CASCADE on
-- loyalty_card is a no-op at that point since every card has already been
-- moved off it).
--
-- Ranking across the full post-merge set (not "loser vs survivor only") is
-- required once there are 3+ colliding customer rows: a one-sided
-- survivor-vs-loser comparison lets two losers that conflict with *each
-- other* both stay ACTIVE, and the repoint below then fails the unique
-- index. Ranking by progress, not by which customer happens to be the
-- survivor, avoids silently cancelling a nearly-complete card in favor of
-- an almost-empty one just because it belonged to the older customer row.
--
-- A DO block so it's a no-op — and therefore safe to re-run — once no
-- collisions remain.
DO $$
DECLARE
  grp RECORD;
  survivor_id TEXT;
BEGIN
  FOR grp IN
    SELECT "businessId", regexp_replace(phone, '[^0-9]', '', 'g') AS digits
    FROM customer
    GROUP BY "businessId", digits
    -- Exclude phones that normalize to no digits at all. Those are the C-2
    -- shape (punctuation-only input) and are distinct people who were never
    -- meant to share a row — merging them here would compound that bug
    -- rather than fix it. New rows of this shape are now impossible; any
    -- legacy ones are left alone for a human to reconcile.
    HAVING COUNT(*) > 1 AND regexp_replace(phone, '[^0-9]', '', 'g') <> ''
  LOOP
    SELECT id INTO survivor_id
    FROM customer
    WHERE "businessId" = grp."businessId"
      AND regexp_replace(phone, '[^0-9]', '', 'g') = grp.digits
    ORDER BY "createdAt" ASC, id ASC
    LIMIT 1;

    WITH candidates AS (
      SELECT
        lc.id,
        lc."loyaltyProgramId",
        lc."createdAt",
        COUNT(st.id) AS stamp_count
      FROM loyalty_card lc
      LEFT JOIN stamp st ON st."loyaltyCardId" = lc.id
      WHERE lc."customerId" IN (
        SELECT id FROM customer
        WHERE "businessId" = grp."businessId"
          AND regexp_replace(phone, '[^0-9]', '', 'g') = grp.digits
      )
      AND lc.status = 'ACTIVE'
      GROUP BY lc.id, lc."loyaltyProgramId", lc."createdAt"
    ),
    ranked AS (
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY "loyaltyProgramId"
        ORDER BY stamp_count DESC, "createdAt" ASC, id ASC
      ) AS rn
      FROM candidates
    )
    UPDATE loyalty_card
    SET status = 'CANCELLED'
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

    UPDATE loyalty_card
    SET "customerId" = survivor_id
    WHERE "customerId" IN (
      SELECT id FROM customer
      WHERE "businessId" = grp."businessId"
        AND regexp_replace(phone, '[^0-9]', '', 'g') = grp.digits
        AND id <> survivor_id
    );

    DELETE FROM customer
    WHERE "businessId" = grp."businessId"
      AND regexp_replace(phone, '[^0-9]', '', 'g') = grp.digits
      AND id <> survivor_id;
  END LOOP;
END $$;

-- Now safe: no two customers in the same business normalize to the same
-- digits-only phone. Rewrite storage to the normalized form so future
-- upserts/lookups (which key on it) find the merged row. The WHERE clause
-- makes this a no-op on rows already stored normalized, so re-running is
-- safe.
-- Rows whose phone has no digits at all are skipped for the same reason the
-- dedupe loop skips them: two such rows would both rewrite to '' and violate
-- customer_businessId_phone_key, wedging this migration.
UPDATE customer
SET phone = regexp_replace(phone, '[^0-9]', '', 'g')
WHERE phone <> regexp_replace(phone, '[^0-9]', '', 'g')
  AND regexp_replace(phone, '[^0-9]', '', 'g') <> '';
