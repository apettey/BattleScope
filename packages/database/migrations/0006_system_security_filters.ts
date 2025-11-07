import { sql, type Kysely } from 'kysely';
import type { Database } from '../src/schema.js';

export async function up(db: Kysely<Database>): Promise<void> {
  // Add system and security type tracking to rulesets
  await db.schema
    .alterTable('rulesets')
    .addColumn('tracked_system_ids', sql`bigint[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::bigint[]`),
    )
    .addColumn('tracked_security_types', sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable('rulesets')
    .dropColumn('tracked_system_ids')
    .dropColumn('tracked_security_types')
    .execute();
}
