import { sql, type Kysely } from 'kysely';
import type { Database } from '../src/schema';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('killmail_events')
    .addColumn('killmail_id', 'bigint', (col) => col.primaryKey())
    .addColumn('system_id', 'integer', (col) => col.notNull())
    .addColumn('occurred_at', 'timestamptz', (col) => col.notNull())
    .addColumn('victim_alliance_id', 'integer')
    .addColumn('attacker_alliance_ids', sql`integer[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::integer[]`),
    )
    .addColumn('isk_value', 'numeric')
    .addColumn('zkb_url', 'text', (col) => col.notNull())
    .addColumn('fetched_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('processed_at', 'timestamptz')
    .addColumn('battle_id', 'uuid')
    .addForeignKeyConstraint(
      'killmail_events_battle_id_fkey',
      ['battle_id'],
      'battles',
      ['id'],
      (constraint) => constraint.onDelete('set null'),
    )
    .execute();

  await db.schema
    .createIndex('killmail_events_processed_idx')
    .on('killmail_events')
    .column('processed_at')
    .execute();

  await db.schema
    .createIndex('killmail_events_system_time_idx')
    .on('killmail_events')
    .columns(['system_id', 'occurred_at'])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex('killmail_events_system_time_idx').ifExists().execute();
  await db.schema.dropIndex('killmail_events_processed_idx').ifExists().execute();
  await db.schema.dropTable('killmail_events').ifExists().execute();
}
