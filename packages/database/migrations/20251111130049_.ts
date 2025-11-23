import { sql, type Kysely } from 'kysely';
import type { Database } from '../src/schema.js';

export async function up(db: Kysely<Database>): Promise<void> {
  // Drop the existing primary key that includes ship_type_id
  await db.schema
    .alterTable('battle_participants')
    .dropConstraint('battle_participants_pk')
    .execute();

  // Delete duplicate (battle_id, character_id) entries, keeping the first one
  // This is needed because the old PK allowed multiple entries per character per battle (different ships)
  await sql`
    DELETE FROM battle_participants bp1
    USING battle_participants bp2
    WHERE bp1.battle_id = bp2.battle_id
      AND bp1.character_id = bp2.character_id
      AND bp1.ctid > bp2.ctid
  `.execute(db);

  // Create new primary key on just battle_id and character_id
  await db.schema
    .alterTable('battle_participants')
    .addPrimaryKeyConstraint('battle_participants_pk', ['battle_id', 'character_id'])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop the new primary key
  await db.schema
    .alterTable('battle_participants')
    .dropConstraint('battle_participants_pk')
    .execute();

  // Make ship_type_id not null again
  await db.schema
    .alterTable('battle_participants')
    .alterColumn('ship_type_id', (col) => col.setNotNull())
    .execute();

  // Restore original primary key including ship_type_id
  await db.schema
    .alterTable('battle_participants')
    .addPrimaryKeyConstraint('battle_participants_pk', [
      'battle_id',
      'character_id',
      'ship_type_id',
    ])
    .execute();
}
