import { sql, type Kysely } from 'kysely';
import type { Database } from '../src/schema.js';

/**
 * Migration 0007: Auth tables for EVE SSO authentication and feature-scoped RBAC
 *
 * Creates tables for:
 * - accounts: User accounts
 * - characters: EVE characters linked to accounts
 * - features: Feature areas (battle-reports, battle-intel, etc.)
 * - roles: Role definitions (user, fc, director, admin)
 * - account_feature_roles: Role assignments per feature
 * - feature_settings: Feature-specific settings
 * - auth_config: Org gating configuration (singleton)
 * - audit_logs: Audit trail for auth actions
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // Create accounts table
  await db.schema
    .createTable('accounts')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('email', 'text', (col) => col.unique())
    .addColumn('display_name', 'text', (col) => col.notNull())
    .addColumn('primary_character_id', 'uuid')
    .addColumn('is_blocked', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('is_deleted', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('is_super_admin', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('last_login_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Create characters table
  await db.schema
    .createTable('characters')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('account_id', 'uuid', (col) =>
      col.notNull().references('accounts.id').onDelete('cascade'),
    )
    .addColumn('eve_character_id', 'bigint', (col) => col.notNull().unique())
    .addColumn('eve_character_name', 'text', (col) => col.notNull())
    .addColumn('corp_id', 'bigint', (col) => col.notNull())
    .addColumn('corp_name', 'text', (col) => col.notNull())
    .addColumn('alliance_id', 'bigint')
    .addColumn('alliance_name', 'text')
    .addColumn('portrait_url', 'text')
    .addColumn('esi_access_token', 'bytea')
    .addColumn('esi_refresh_token', 'bytea')
    .addColumn('esi_token_expires_at', 'timestamptz')
    .addColumn('scopes', sql`text[]`, (col) => col.notNull().defaultTo(sql`ARRAY[]::text[]`))
    .addColumn('last_verified_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Add foreign key from accounts to characters for primary_character_id
  // This must be done after characters table exists
  await sql`
    ALTER TABLE accounts
    ADD CONSTRAINT accounts_primary_character_fk
    FOREIGN KEY (primary_character_id) REFERENCES characters(id) ON DELETE SET NULL
  `.execute(db);

  // Create indexes on characters
  await db.schema
    .createIndex('idx_characters_account_id')
    .on('characters')
    .column('account_id')
    .execute();

  await db.schema
    .createIndex('idx_characters_eve_character_id')
    .on('characters')
    .column('eve_character_id')
    .execute();

  await db.schema
    .createIndex('idx_characters_corp_id')
    .on('characters')
    .column('corp_id')
    .execute();

  await db.schema
    .createIndex('idx_characters_alliance_id')
    .on('characters')
    .column('alliance_id')
    .execute();

  // Create features table
  await db.schema
    .createTable('features')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('key', 'text', (col) => col.notNull().unique())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Create roles table
  await db.schema
    .createTable('roles')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('key', 'text', (col) => col.notNull().unique())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('rank', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Create account_feature_roles table
  await db.schema
    .createTable('account_feature_roles')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('account_id', 'uuid', (col) =>
      col.notNull().references('accounts.id').onDelete('cascade'),
    )
    .addColumn('feature_id', 'uuid', (col) =>
      col.notNull().references('features.id').onDelete('cascade'),
    )
    .addColumn('role_id', 'uuid', (col) =>
      col.notNull().references('roles.id').onDelete('restrict'),
    )
    .addColumn('granted_by', 'uuid', (col) => col.references('accounts.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Add unique constraint for one role per account per feature
  await db.schema
    .createIndex('idx_account_feature_roles_unique')
    .on('account_feature_roles')
    .columns(['account_id', 'feature_id'])
    .unique()
    .execute();

  await db.schema
    .createIndex('idx_account_feature_roles_account_id')
    .on('account_feature_roles')
    .column('account_id')
    .execute();

  await db.schema
    .createIndex('idx_account_feature_roles_feature_id')
    .on('account_feature_roles')
    .column('feature_id')
    .execute();

  // Create feature_settings table
  await db.schema
    .createTable('feature_settings')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('feature_id', 'uuid', (col) =>
      col.notNull().references('features.id').onDelete('cascade'),
    )
    .addColumn('key', 'text', (col) => col.notNull())
    .addColumn('value', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('updated_by', 'uuid', (col) => col.references('accounts.id').onDelete('set null'))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Add unique constraint for one value per feature per key
  await db.schema
    .createIndex('idx_feature_settings_unique')
    .on('feature_settings')
    .columns(['feature_id', 'key'])
    .unique()
    .execute();

  // Create auth_config table (singleton)
  await db.schema
    .createTable('auth_config')
    .addColumn('id', 'boolean', (col) => col.primaryKey().defaultTo(true))
    .addColumn('require_membership', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('allowed_corp_ids', sql`bigint[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::bigint[]`),
    )
    .addColumn('allowed_alliance_ids', sql`bigint[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::bigint[]`),
    )
    .addColumn('denied_corp_ids', sql`bigint[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::bigint[]`),
    )
    .addColumn('denied_alliance_ids', sql`bigint[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::bigint[]`),
    )
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Add constraint to ensure only one row
  await sql`
    ALTER TABLE auth_config
    ADD CONSTRAINT auth_config_singleton CHECK (id = true)
  `.execute(db);

  // Create audit_logs table
  await db.schema
    .createTable('audit_logs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('actor_account_id', 'uuid', (col) =>
      col.references('accounts.id').onDelete('set null'),
    )
    .addColumn('action', 'text', (col) => col.notNull())
    .addColumn('target_type', 'text', (col) => col.notNull())
    .addColumn('target_id', 'text', (col) => col.notNull())
    .addColumn('metadata', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // Create indexes on audit_logs
  await db.schema
    .createIndex('idx_audit_logs_actor_account_id')
    .on('audit_logs')
    .column('actor_account_id')
    .execute();

  await db.schema
    .createIndex('idx_audit_logs_action')
    .on('audit_logs')
    .column('action')
    .execute();

  await db.schema
    .createIndex('idx_audit_logs_created_at')
    .on('audit_logs')
    .column('created_at')
    .execute();

  // Create trigger function for updated_at if it doesn't exist
  await sql`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  // Create triggers for updated_at
  await sql`
    CREATE TRIGGER trg_accounts_updated
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at()
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_characters_updated
    BEFORE UPDATE ON characters
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at()
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_features_updated
    BEFORE UPDATE ON features
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at()
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_roles_updated
    BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at()
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_feature_settings_updated
    BEFORE UPDATE ON feature_settings
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at()
  `.execute(db);

  await sql`
    CREATE TRIGGER trg_auth_config_updated
    BEFORE UPDATE ON auth_config
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at()
  `.execute(db);

  // Insert seed data for roles
  await sql`
    INSERT INTO roles (key, name, rank) VALUES
      ('user', 'User', 10),
      ('fc', 'Fleet Commander', 20),
      ('director', 'Director', 30),
      ('admin', 'Admin', 40)
    ON CONFLICT (key) DO NOTHING
  `.execute(db);

  // Insert seed data for features
  await sql`
    INSERT INTO features (key, name, description) VALUES
      ('battle-reports', 'Battle Reports', 'View and analyze reconstructed battles'),
      ('battle-intel', 'Battle Intel', 'Real-time killmail feed and intelligence')
    ON CONFLICT (key) DO NOTHING
  `.execute(db);

  // Insert singleton auth_config row
  await sql`
    INSERT INTO auth_config (id, require_membership) VALUES (true, true)
    ON CONFLICT (id) DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop triggers
  await sql`DROP TRIGGER IF EXISTS trg_auth_config_updated ON auth_config`.execute(db);
  await sql`DROP TRIGGER IF EXISTS trg_feature_settings_updated ON feature_settings`.execute(db);
  await sql`DROP TRIGGER IF EXISTS trg_roles_updated ON roles`.execute(db);
  await sql`DROP TRIGGER IF EXISTS trg_features_updated ON features`.execute(db);
  await sql`DROP TRIGGER IF EXISTS trg_characters_updated ON characters`.execute(db);
  await sql`DROP TRIGGER IF EXISTS trg_accounts_updated ON accounts`.execute(db);

  // Drop tables in reverse order (respecting foreign keys)
  await db.schema.dropTable('audit_logs').ifExists().execute();
  await db.schema.dropTable('auth_config').ifExists().execute();
  await db.schema.dropTable('feature_settings').ifExists().execute();
  await db.schema.dropTable('account_feature_roles').ifExists().execute();
  await db.schema.dropTable('roles').ifExists().execute();
  await db.schema.dropTable('features').ifExists().execute();

  // Drop foreign key constraint from accounts before dropping characters
  await sql`
    ALTER TABLE accounts
    DROP CONSTRAINT IF EXISTS accounts_primary_character_fk
  `.execute(db);

  await db.schema.dropTable('characters').ifExists().execute();
  await db.schema.dropTable('accounts').ifExists().execute();
}
