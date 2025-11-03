import { sql, type Kysely } from 'kysely';
import type { Database } from '../src/schema';

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.createType('space_type').asEnum(['kspace', 'jspace', 'pochven']).execute();

  await db.schema
    .createTable('battles')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('system_id', 'integer', (col) => col.notNull())
    .addColumn('space_type', sql`space_type`, (col) => col.notNull())
    .addColumn('start_time', 'timestamptz', (col) => col.notNull())
    .addColumn('end_time', 'timestamptz', (col) => col.notNull())
    .addColumn('total_kills', 'integer', (col) => col.notNull())
    .addColumn('total_isk_destroyed', 'numeric', (col) => col.notNull().defaultTo('0'))
    .addColumn('zkill_related_url', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('battles_system_time_idx')
    .on('battles')
    .columns(['system_id', 'start_time', 'end_time'])
    .execute();

  await db.schema
    .createTable('battle_killmails')
    .addColumn('battle_id', 'uuid', (col) => col.notNull())
    .addColumn('killmail_id', 'bigint', (col) => col.notNull())
    .addColumn('zkb_url', 'text', (col) => col.notNull())
    .addColumn('occurred_at', 'timestamptz', (col) => col.notNull())
    .addColumn('victim_alliance_id', 'integer')
    .addColumn('attacker_alliance_ids', sql`integer[]`, (col) => col.notNull())
    .addColumn('isk_value', 'numeric')
    .addColumn('side_id', 'smallint')
    .addPrimaryKeyConstraint('battle_killmails_pk', ['battle_id', 'killmail_id'])
    .addForeignKeyConstraint(
      'battle_killmails_battle_id_fkey',
      ['battle_id'],
      'battles',
      ['id'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .execute();

  await db.schema
    .createIndex('battle_killmails_killmail_id_idx')
    .on('battle_killmails')
    .column('killmail_id')
    .execute();

  await db.schema
    .createTable('battle_participants')
    .addColumn('battle_id', 'uuid', (col) => col.notNull())
    .addColumn('character_id', 'bigint', (col) => col.notNull())
    .addColumn('alliance_id', 'integer')
    .addColumn('corp_id', 'integer')
    .addColumn('ship_type_id', 'integer')
    .addColumn('side_id', 'smallint')
    .addColumn('is_victim', 'boolean', (col) => col.notNull().defaultTo(false))
    .addPrimaryKeyConstraint('battle_participants_pk', [
      'battle_id',
      'character_id',
      'ship_type_id',
    ])
    .addForeignKeyConstraint(
      'battle_participants_battle_id_fkey',
      ['battle_id'],
      'battles',
      ['id'],
      (constraint) => constraint.onDelete('cascade'),
    )
    .execute();

  await db.schema
    .createIndex('battle_participants_character_idx')
    .on('battle_participants')
    .columns(['character_id', 'battle_id'])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex('battle_participants_character_idx').ifExists().execute();
  await db.schema.dropTable('battle_participants').ifExists().execute();
  await db.schema.dropIndex('battle_killmails_killmail_id_idx').ifExists().execute();
  await db.schema.dropTable('battle_killmails').ifExists().execute();
  await db.schema.dropIndex('battles_system_time_idx').ifExists().execute();
  await db.schema.dropTable('battles').ifExists().execute();
  await db.schema.dropType('space_type').ifExists().execute();
}
