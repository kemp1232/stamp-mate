#!/bin/bash
# Re-prove the phone-normalize migration AFTER the empty-digits guard was added.
# Runs against a throwaway database so the shared one is untouched.
set -euo pipefail
REPO=/Users/raymundrafael/Desktop/repos/firstmate/stamp-mate
C=supabase_db_stampmate-qa
DB=scratch_phone_guard

q() { docker exec -i "$C" psql -U postgres -d "$1" -v ON_ERROR_STOP=1 -q; }

echo "DROP DATABASE IF EXISTS $DB;" | q postgres
echo "CREATE DATABASE $DB;" | q postgres

for m in 20260706055719_add_auth_and_staff 20260706064540_add_store_and_loyalty_program \
         20260706070621_add_customer_and_loyalty_card 20260706082741_add_stamp \
         20260706091009_add_reward_redemption; do
  q "$DB" < "$REPO/prisma/migrations/$m/migration.sql"
done

q "$DB" <<'SQL'
insert into business (id,name,"createdAt","updatedAt") values ('b1','Guard Co',now(),now());
insert into "user" (id,name,email,"createdAt","updatedAt") values ('u1','S','s@x.test',now(),now());
insert into store (id,"businessId",name,slug,"createdAt","updatedAt") values ('s1','b1','St','st',now(),now());
insert into loyalty_program (id,"storeId",name,"requiredStamps","rewardText",status,"createdAt","updatedAt")
  values ('p1','s1','P',5,'R','ACTIVE',now(),now());
-- (a) punctuation-only phones, DISTINCT people: must NOT be merged
insert into customer (id,"businessId",name,phone,"createdAt","updatedAt") values
  ('cA','b1','Alice','(((-)))',now()-interval '2 day',now()),
  ('cB','b1','Bob','.-.-.-.',now()-interval '1 day',now());
-- (b) same subscriber in two formats: MUST merge, keeping the 4-stamp card
insert into customer (id,"businessId",name,phone,"createdAt","updatedAt") values
  ('cC','b1','Carol','+639171234567',now()-interval '2 day',now()),
  ('cD','b1','Carol2','639171234567',now()-interval '1 day',now());
insert into loyalty_card (id,"customerId","loyaltyProgramId","cardToken",status,"cycleNumber","createdAt","updatedAt") values
  ('kC','cC','p1','tokC','ACTIVE',1,now(),now()),
  ('kD','cD','p1','tokD','ACTIVE',1,now(),now());
insert into stamp (id,"loyaltyCardId","staffUserId","createdAt") values ('s_c1','kC','u1',now());
insert into stamp (id,"loyaltyCardId","staffUserId","createdAt") values
  ('s_d1','kD','u1',now()),('s_d2','kD','u1',now()),('s_d3','kD','u1',now()),('s_d4','kD','u1',now());
SQL

echo "=== BEFORE ==="
echo 'select id,name,phone from customer order by id;' | q "$DB"

q "$DB" < "$REPO/prisma/migrations/20260806150000_normalize_customer_phone/migration.sql"
echo "=== AFTER 1st apply ==="
echo 'select id,name,phone from customer order by id;' | q "$DB"
echo 'select id,"customerId",status,(select count(*) from stamp where "loyaltyCardId"=loyalty_card.id) as stamps from loyalty_card order by id;' | q "$DB"

q "$DB" < "$REPO/prisma/migrations/20260806150000_normalize_customer_phone/migration.sql"
echo "=== AFTER 2nd apply (idempotency) ==="
echo 'select id,name,phone from customer order by id;' | q "$DB"

echo "DROP DATABASE $DB;" | q postgres
echo "scratch DB dropped"
