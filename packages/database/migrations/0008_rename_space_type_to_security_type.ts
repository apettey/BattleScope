import { sql, type Kysely } from 'kysely';
import type { Database } from '../src/schema.js';

export async function up(db: Kysely<Database>): Promise<void> {
  // Step 1: Create new enum type with all values
  await sql`
    CREATE TYPE security_type AS ENUM ('highsec', 'lowsec', 'nullsec', 'wormhole', 'pochven')
  `.execute(db);

  // Step 2: Add new column with new type
  await sql`
    ALTER TABLE battles ADD COLUMN security_type_new security_type
  `.execute(db);

  // Step 3: Migrate data from old column to new column
  await sql`
    UPDATE battles
    SET security_type_new = CASE
      WHEN space_type = 'jspace' THEN 'wormhole'::security_type
      WHEN space_type = 'pochven' THEN 'pochven'::security_type
      WHEN space_type = 'kspace' THEN 'nullsec'::security_type
      ELSE 'nullsec'::security_type
    END
  `.execute(db);

  // Step 4: Drop old column
  await sql`
    ALTER TABLE battles DROP COLUMN space_type
  `.execute(db);

  // Step 5: Rename new column to security_type
  await sql`
    ALTER TABLE battles RENAME COLUMN security_type_new TO security_type
  `.execute(db);

  // Step 6: Drop old enum type
  await sql`
    DROP TYPE space_type
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Step 1: Create old enum type
  await sql`
    CREATE TYPE space_type AS ENUM ('kspace', 'jspace', 'pochven')
  `.execute(db);

  // Step 2: Add old column
  await sql`
    ALTER TABLE battles ADD COLUMN space_type_old space_type
  `.execute(db);

  // Step 3: Migrate data back
  await sql`
    UPDATE battles
    SET space_type_old = CASE
      WHEN security_type = 'wormhole' THEN 'jspace'::space_type
      WHEN security_type = 'pochven' THEN 'pochven'::space_type
      WHEN security_type IN ('highsec', 'lowsec', 'nullsec') THEN 'kspace'::space_type
      ELSE 'kspace'::space_type
    END
  `.execute(db);

  // Step 4: Drop new column
  await sql`
    ALTER TABLE battles DROP COLUMN security_type
  `.execute(db);

  // Step 5: Rename old column back
  await sql`
    ALTER TABLE battles RENAME COLUMN space_type_old TO space_type
  `.execute(db);

  // Step 6: Drop new enum type
  await sql`
    DROP TYPE security_type
  `.execute(db);
}
