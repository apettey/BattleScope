import { sql, type Kysely } from 'kysely';
import type { Database } from '../src/schema.js';

const ACTIVE_RULESET_ID = '00000000-0000-0000-0000-000000000001';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('rulesets')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('min_pilots', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('tracked_alliance_ids', sql`bigint[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::bigint[]`),
    )
    .addColumn('tracked_corp_ids', sql`bigint[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::bigint[]`),
    )
    .addColumn('ignore_unlisted', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('updated_by', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    INSERT INTO rulesets (id, min_pilots, tracked_alliance_ids, tracked_corp_ids, ignore_unlisted)
    VALUES (${ACTIVE_RULESET_ID}::uuid, 1, ARRAY[]::bigint[], ARRAY[]::bigint[], false)
    ON CONFLICT (id) DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('rulesets').ifExists().execute();
}
