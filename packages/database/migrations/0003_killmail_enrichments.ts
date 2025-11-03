import { sql, type Kysely } from 'kysely';
import type { Database } from '../src/schema.js';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable('killmail_enrichments')
    .addColumn('killmail_id', 'bigint', (col) => col.primaryKey())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('payload', 'jsonb')
    .addColumn('error', 'text')
    .addColumn('fetched_at', 'timestamptz')
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('killmail_enrichments_status_idx')
    .on('killmail_enrichments')
    .column('status')
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex('killmail_enrichments_status_idx').ifExists().execute();
  await db.schema.dropTable('killmail_enrichments').ifExists().execute();
}
