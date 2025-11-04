import { sql, type Kysely } from 'kysely';
import type { Database } from '../src/schema.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex('battles_system_time_idx').ifExists().execute();
  await db.schema.dropIndex('killmail_events_system_time_idx').ifExists().execute();

  await sql`ALTER TABLE battles
    ALTER COLUMN system_id TYPE bigint,
    ALTER COLUMN total_kills TYPE bigint`.execute(db);

  await sql`ALTER TABLE battle_killmails
    ALTER COLUMN victim_alliance_id TYPE bigint,
    ALTER COLUMN side_id TYPE bigint`.execute(db);

  await sql`ALTER TABLE battle_killmails
    ADD COLUMN attacker_alliance_ids_tmp bigint[] DEFAULT ARRAY[]::bigint[] NOT NULL`.execute(db);
  await sql`UPDATE battle_killmails
    SET attacker_alliance_ids_tmp = COALESCE(attacker_alliance_ids::bigint[], ARRAY[]::bigint[])`.execute(
    db,
  );
  await sql`ALTER TABLE battle_killmails DROP COLUMN attacker_alliance_ids`.execute(db);
  await sql`ALTER TABLE battle_killmails RENAME COLUMN attacker_alliance_ids_tmp TO attacker_alliance_ids`.execute(
    db,
  );
  await sql`ALTER TABLE battle_killmails ALTER COLUMN attacker_alliance_ids DROP DEFAULT`.execute(
    db,
  );

  await sql`ALTER TABLE battle_participants
    ALTER COLUMN alliance_id TYPE bigint,
    ALTER COLUMN corp_id TYPE bigint,
    ALTER COLUMN ship_type_id TYPE bigint,
    ALTER COLUMN side_id TYPE bigint`.execute(db);

  await sql`ALTER TABLE killmail_events
    ALTER COLUMN system_id TYPE bigint,
    ALTER COLUMN victim_alliance_id TYPE bigint,
    ALTER COLUMN victim_corp_id TYPE bigint`.execute(db);

  await sql`ALTER TABLE killmail_events
    ADD COLUMN attacker_alliance_ids_tmp bigint[] DEFAULT ARRAY[]::bigint[] NOT NULL,
    ADD COLUMN attacker_corp_ids_tmp bigint[] DEFAULT ARRAY[]::bigint[] NOT NULL`.execute(db);
  await sql`UPDATE killmail_events
    SET attacker_alliance_ids_tmp = COALESCE(attacker_alliance_ids::bigint[], ARRAY[]::bigint[]),
        attacker_corp_ids_tmp = COALESCE(attacker_corp_ids::bigint[], ARRAY[]::bigint[])`.execute(
    db,
  );
  await sql`ALTER TABLE killmail_events DROP COLUMN attacker_alliance_ids`.execute(db);
  await sql`ALTER TABLE killmail_events DROP COLUMN attacker_corp_ids`.execute(db);
  await sql`ALTER TABLE killmail_events RENAME COLUMN attacker_alliance_ids_tmp TO attacker_alliance_ids`.execute(
    db,
  );
  await sql`ALTER TABLE killmail_events RENAME COLUMN attacker_corp_ids_tmp TO attacker_corp_ids`.execute(
    db,
  );
  await sql`ALTER TABLE killmail_events ALTER COLUMN attacker_alliance_ids SET DEFAULT ARRAY[]::bigint[]`.execute(
    db,
  );
  await sql`ALTER TABLE killmail_events ALTER COLUMN attacker_corp_ids SET DEFAULT ARRAY[]::bigint[]`.execute(
    db,
  );

  await db.schema
    .createIndex('battles_system_time_idx')
    .on('battles')
    .columns(['system_id', 'start_time', 'end_time'])
    .execute();

  await db.schema
    .createIndex('killmail_events_system_time_idx')
    .on('killmail_events')
    .columns(['system_id', 'occurred_at'])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex('battles_system_time_idx').ifExists().execute();
  await db.schema.dropIndex('killmail_events_system_time_idx').ifExists().execute();

  await sql`ALTER TABLE battles
    ALTER COLUMN system_id TYPE integer,
    ALTER COLUMN total_kills TYPE integer`.execute(db);

  await sql`ALTER TABLE battle_killmails
    ALTER COLUMN victim_alliance_id TYPE integer,
    ALTER COLUMN side_id TYPE smallint`.execute(db);

  await sql`ALTER TABLE battle_killmails
    ADD COLUMN attacker_alliance_ids_tmp integer[] DEFAULT ARRAY[]::integer[] NOT NULL`.execute(db);
  await sql`UPDATE battle_killmails
    SET attacker_alliance_ids_tmp = COALESCE(attacker_alliance_ids::integer[], ARRAY[]::integer[])`.execute(
    db,
  );
  await sql`ALTER TABLE battle_killmails DROP COLUMN attacker_alliance_ids`.execute(db);
  await sql`ALTER TABLE battle_killmails RENAME COLUMN attacker_alliance_ids_tmp TO attacker_alliance_ids`.execute(
    db,
  );
  await sql`ALTER TABLE battle_killmails ALTER COLUMN attacker_alliance_ids DROP DEFAULT`.execute(
    db,
  );

  await sql`ALTER TABLE battle_participants
    ALTER COLUMN alliance_id TYPE integer,
    ALTER COLUMN corp_id TYPE integer,
    ALTER COLUMN ship_type_id TYPE integer,
    ALTER COLUMN side_id TYPE smallint`.execute(db);

  await sql`ALTER TABLE killmail_events
    ALTER COLUMN system_id TYPE integer,
    ALTER COLUMN victim_alliance_id TYPE integer,
    ALTER COLUMN victim_corp_id TYPE integer`.execute(db);

  await sql`ALTER TABLE killmail_events
    ADD COLUMN attacker_alliance_ids_tmp integer[] DEFAULT ARRAY[]::integer[] NOT NULL,
    ADD COLUMN attacker_corp_ids_tmp integer[] DEFAULT ARRAY[]::integer[] NOT NULL`.execute(db);
  await sql`UPDATE killmail_events
    SET attacker_alliance_ids_tmp = COALESCE(attacker_alliance_ids::integer[], ARRAY[]::integer[]),
        attacker_corp_ids_tmp = COALESCE(attacker_corp_ids::integer[], ARRAY[]::integer[])`.execute(
    db,
  );
  await sql`ALTER TABLE killmail_events DROP COLUMN attacker_alliance_ids`.execute(db);
  await sql`ALTER TABLE killmail_events DROP COLUMN attacker_corp_ids`.execute(db);
  await sql`ALTER TABLE killmail_events RENAME COLUMN attacker_alliance_ids_tmp TO attacker_alliance_ids`.execute(
    db,
  );
  await sql`ALTER TABLE killmail_events RENAME COLUMN attacker_corp_ids_tmp TO attacker_corp_ids`.execute(
    db,
  );
  await sql`ALTER TABLE killmail_events ALTER COLUMN attacker_alliance_ids SET DEFAULT ARRAY[]::integer[]`.execute(
    db,
  );
  await sql`ALTER TABLE killmail_events ALTER COLUMN attacker_corp_ids SET DEFAULT ARRAY[]::integer[]`.execute(
    db,
  );

  await db.schema
    .createIndex('battles_system_time_idx')
    .on('battles')
    .columns(['system_id', 'start_time', 'end_time'])
    .execute();

  await db.schema
    .createIndex('killmail_events_system_time_idx')
    .on('killmail_events')
    .columns(['system_id', 'occurred_at'])
    .execute();
}
