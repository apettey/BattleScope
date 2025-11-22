import { type Kysely, sql } from 'kysely';
import type { Database } from '../src/schema.js';

export async function up(db: Kysely<Database>): Promise<void> {
  // Create the pilot_ship_history table
  await db.schema
    .createTable('pilot_ship_history')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('killmail_id', 'bigint', (col) =>
      col.notNull().references('killmail_events.killmail_id'),
    )
    .addColumn('character_id', 'bigint', (col) => col.notNull())
    .addColumn('ship_type_id', 'bigint', (col) => col.notNull())
    .addColumn('alliance_id', 'bigint')
    .addColumn('corp_id', 'bigint')
    .addColumn('system_id', 'bigint', (col) => col.notNull())
    .addColumn('is_loss', 'boolean', (col) => col.notNull())
    .addColumn('ship_value', 'bigint')
    .addColumn('killmail_value', 'bigint')
    .addColumn('occurred_at', 'timestamptz', (col) => col.notNull())
    .addColumn('zkb_url', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('unique_pilot_killmail', ['killmail_id', 'character_id'])
    .execute();

  // Create indexes for common queries

  // Index for querying all ships a character has flown
  await db.schema
    .createIndex('idx_pilot_ship_history_character')
    .on('pilot_ship_history')
    .column('character_id')
    .execute();

  // Index for querying all losses for a character
  await sql`
    CREATE INDEX idx_pilot_ship_history_character_losses
    ON pilot_ship_history(character_id)
    WHERE is_loss = true
  `.execute(db);

  // Index for querying by ship type
  await db.schema
    .createIndex('idx_pilot_ship_history_ship_type')
    .on('pilot_ship_history')
    .column('ship_type_id')
    .execute();

  // Index for querying character + ship type combination
  await db.schema
    .createIndex('idx_pilot_ship_history_character_ship')
    .on('pilot_ship_history')
    .columns(['character_id', 'ship_type_id'])
    .execute();

  // Index for time-based queries
  await sql`
    CREATE INDEX idx_pilot_ship_history_occurred_at
    ON pilot_ship_history(occurred_at DESC)
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop indexes
  await db.schema.dropIndex('idx_pilot_ship_history_occurred_at').ifExists().execute();
  await db.schema.dropIndex('idx_pilot_ship_history_character_ship').ifExists().execute();
  await db.schema.dropIndex('idx_pilot_ship_history_ship_type').ifExists().execute();
  await db.schema.dropIndex('idx_pilot_ship_history_character_losses').ifExists().execute();
  await db.schema.dropIndex('idx_pilot_ship_history_character').ifExists().execute();

  // Drop table
  await db.schema.dropTable('pilot_ship_history').ifExists().execute();
}
