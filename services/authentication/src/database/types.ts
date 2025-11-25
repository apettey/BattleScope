import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface AccountsTable {
  id: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  email: string | null;
  display_name: string;
  primary_character_id: string | null;
  is_blocked: boolean;
  is_deleted: boolean;
  is_super_admin: boolean;
  last_login_at: Date | null;
}

export interface CharactersTable {
  id: Generated<string>;
  account_id: string;
  eve_character_id: number;
  eve_character_name: string;
  corp_id: number;
  corp_name: string;
  alliance_id: number | null;
  alliance_name: string | null;
  portrait_url: string | null;
  esi_access_token: Buffer | null;
  esi_refresh_token: Buffer | null;
  esi_token_expires_at: Date | null;
  scopes: string[];
  last_verified_at: Date | null;
}

export interface FeaturesTable {
  id: Generated<string>;
  key: string;
  name: string;
  description: string | null;
}

export interface RolesTable {
  id: Generated<string>;
  key: string;
  rank: number;
}

export interface AccountFeatureRolesTable {
  id: Generated<string>;
  account_id: string;
  feature_id: string;
  role_id: string;
  granted_by: string | null;
  created_at: Generated<Date>;
}

export interface FeatureSettingsTable {
  id: Generated<string>;
  feature_id: string;
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: Generated<Date>;
}

export interface AuthConfigTable {
  id: boolean;
  require_membership: boolean;
  allowed_corp_ids: number[];
  allowed_alliance_ids: number[];
  denied_corp_ids: number[];
  denied_alliance_ids: number[];
}

export interface AuditLogsTable {
  id: Generated<string>;
  actor_account_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  metadata: unknown;
  created_at: Generated<Date>;
}

export interface Database {
  accounts: AccountsTable;
  characters: CharactersTable;
  features: FeaturesTable;
  roles: RolesTable;
  account_feature_roles: AccountFeatureRolesTable;
  feature_settings: FeatureSettingsTable;
  auth_config: AuthConfigTable;
  audit_logs: AuditLogsTable;
}

// Type helpers
export type Account = Selectable<AccountsTable>;
export type NewAccount = Insertable<AccountsTable>;
export type AccountUpdate = Updateable<AccountsTable>;

export type Character = Selectable<CharactersTable>;
export type NewCharacter = Insertable<CharactersTable>;
export type CharacterUpdate = Updateable<CharactersTable>;

export type Feature = Selectable<FeaturesTable>;
export type Role = Selectable<RolesTable>;
export type AccountFeatureRole = Selectable<AccountFeatureRolesTable>;
export type AuditLog = Selectable<AuditLogsTable>;
export type AuthConfig = Selectable<AuthConfigTable>;
