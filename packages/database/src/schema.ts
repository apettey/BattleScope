import type { ColumnType } from 'kysely';
import type { SpaceType } from '@battlescope/shared';

export interface BattlesTable {
  id: string;
  systemId: ColumnType<bigint, string | number | bigint, string | number | bigint>;
  spaceType: SpaceType;
  startTime: ColumnType<Date, Date, Date>;
  endTime: ColumnType<Date, Date, Date>;
  totalKills: ColumnType<bigint, string | number | bigint, string | number | bigint>;
  totalIskDestroyed: ColumnType<bigint, string | number | bigint, string | number | bigint>;
  zkillRelatedUrl: string;
  createdAt: ColumnType<Date, Date | undefined, never>;
}

export interface BattleKillmailsTable {
  battleId: string;
  killmailId: ColumnType<bigint, string | number | bigint, string | number | bigint>;
  zkbUrl: string;
  occurredAt: ColumnType<Date, Date, Date>;
  victimAllianceId: ColumnType<
    bigint | null,
    string | number | bigint | null,
    string | number | bigint | null
  >;
  attackerAllianceIds: ColumnType<
    bigint[],
    (string | number | bigint)[],
    (string | number | bigint)[]
  >;
  iskValue: ColumnType<
    bigint | null,
    string | number | bigint | null,
    string | number | bigint | null
  >;
  sideId: ColumnType<
    bigint | null,
    string | number | bigint | null,
    string | number | bigint | null
  >;
}

export interface BattleParticipantsTable {
  battleId: string;
  characterId: ColumnType<bigint, string | number | bigint, string | number | bigint>;
  allianceId: ColumnType<
    bigint | null,
    string | number | bigint | null,
    string | number | bigint | null
  >;
  corpId: ColumnType<
    bigint | null,
    string | number | bigint | null,
    string | number | bigint | null
  >;
  shipTypeId: ColumnType<
    bigint | null,
    string | number | bigint | null,
    string | number | bigint | null
  >;
  sideId: ColumnType<
    bigint | null,
    string | number | bigint | null,
    string | number | bigint | null
  >;
  isVictim: ColumnType<boolean, boolean, boolean>;
}

export interface KillmailEventsTable {
  killmailId: ColumnType<bigint, string | number | bigint, string | number | bigint>;
  systemId: ColumnType<bigint, string | number | bigint, string | number | bigint>;
  occurredAt: ColumnType<Date, Date, Date>;
  victimAllianceId: ColumnType<
    bigint | null,
    string | number | bigint | null,
    string | number | bigint | null
  >;
  victimCorpId: ColumnType<
    bigint | null,
    string | number | bigint | null,
    string | number | bigint | null
  >;
  victimCharacterId: ColumnType<
    bigint | null,
    string | number | bigint | null,
    string | number | bigint | null
  >;
  attackerAllianceIds: ColumnType<
    bigint[],
    (string | number | bigint)[],
    (string | number | bigint)[]
  >;
  attackerCorpIds: ColumnType<bigint[], (string | number | bigint)[], (string | number | bigint)[]>;
  attackerCharacterIds: ColumnType<
    bigint[],
    (string | number | bigint)[],
    (string | number | bigint)[]
  >;
  iskValue: ColumnType<
    bigint | null,
    string | number | bigint | null,
    string | number | bigint | null
  >;
  zkbUrl: string;
  fetchedAt: ColumnType<Date, Date | undefined, never>;
  processedAt: ColumnType<Date | null, Date | null, Date | null>;
  battleId: string | null;
}

export interface KillmailEnrichmentsTable {
  killmailId: ColumnType<bigint, string | number | bigint, string | number | bigint>;
  status: string;
  payload: ColumnType<
    Record<string, unknown> | null,
    Record<string, unknown> | null,
    Record<string, unknown> | null
  >;
  error: string | null;
  fetchedAt: ColumnType<Date | null, Date | null, Date | null>;
  updatedAt: ColumnType<Date, Date | undefined, Date | undefined>;
  createdAt: ColumnType<Date, Date | undefined, never>;
}

export interface RulesetsTable {
  id: string;
  minPilots: ColumnType<number, number | undefined, number>;
  trackedAllianceIds: ColumnType<
    bigint[],
    (string | number | bigint)[],
    (string | number | bigint)[]
  >;
  trackedCorpIds: ColumnType<bigint[], (string | number | bigint)[], (string | number | bigint)[]>;
  trackedSystemIds: ColumnType<
    bigint[],
    (string | number | bigint)[],
    (string | number | bigint)[]
  >;
  trackedSecurityTypes: ColumnType<string[], string[] | undefined, string[]>;
  ignoreUnlisted: ColumnType<boolean, boolean | undefined, boolean>;
  updatedBy: string | null;
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface AccountsTable {
  id: ColumnType<string, string | undefined, never>;
  email: string | null;
  displayName: string;
  primaryCharacterId: string | null;
  isBlocked: ColumnType<boolean, boolean | undefined, boolean>;
  isDeleted: ColumnType<boolean, boolean | undefined, boolean>;
  isSuperAdmin: ColumnType<boolean, boolean | undefined, boolean>;
  lastLoginAt: Date | null;
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
}

export interface CharactersTable {
  id: ColumnType<string, string | undefined, never>;
  accountId: string;
  eveCharacterId: ColumnType<bigint, string | number | bigint, string | number | bigint>;
  eveCharacterName: string;
  corpId: ColumnType<bigint, string | number | bigint, string | number | bigint>;
  corpName: string;
  allianceId: ColumnType<bigint | null, string | number | bigint | null, string | number | bigint | null>;
  allianceName: string | null;
  portraitUrl: string | null;
  esiAccessToken: Buffer | null;
  esiRefreshToken: Buffer | null;
  esiTokenExpiresAt: Date | null;
  scopes: ColumnType<string[], string[] | undefined, string[]>;
  lastVerifiedAt: ColumnType<Date | null, Date | null | undefined, Date | null>;
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
}

export interface FeaturesTable {
  id: ColumnType<string, string | undefined, never>;
  key: string;
  name: string;
  description: string;
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
}

export interface RolesTable {
  id: ColumnType<string, string | undefined, never>;
  key: string;
  name: string;
  rank: number;
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
}

export interface AccountFeatureRolesTable {
  id: ColumnType<string, string | undefined, never>;
  accountId: string;
  featureId: string;
  roleId: string;
  grantedBy: string | null;
  createdAt: ColumnType<Date, Date | undefined, never>;
}

export interface FeatureSettingsTable {
  id: ColumnType<string, string | undefined, never>;
  featureId: string;
  key: string;
  value: ColumnType<Record<string, unknown>, Record<string, unknown>, Record<string, unknown>>;
  updatedBy: string | null;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
  createdAt: ColumnType<Date, Date | undefined, never>;
}

export interface AuthConfigTable {
  id: ColumnType<boolean, boolean | undefined, never>;
  requireMembership: ColumnType<boolean, boolean | undefined, boolean>;
  allowedCorpIds: ColumnType<bigint[], (string | number | bigint)[], (string | number | bigint)[]>;
  allowedAllianceIds: ColumnType<bigint[], (string | number | bigint)[], (string | number | bigint)[]>;
  deniedCorpIds: ColumnType<bigint[], (string | number | bigint)[], (string | number | bigint)[]>;
  deniedAllianceIds: ColumnType<bigint[], (string | number | bigint)[], (string | number | bigint)[]>;
  updatedAt: ColumnType<Date, Date | undefined, Date>;
}

export interface AuditLogsTable {
  id: ColumnType<string, string | undefined, never>;
  actorAccountId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: ColumnType<Record<string, unknown>, Record<string, unknown> | undefined, Record<string, unknown>>;
  createdAt: ColumnType<Date, Date | undefined, never>;
}

export interface Database {
  battles: BattlesTable;
  battle_killmails: BattleKillmailsTable;
  battle_participants: BattleParticipantsTable;
  killmail_events: KillmailEventsTable;
  killmail_enrichments: KillmailEnrichmentsTable;
  rulesets: RulesetsTable;
  accounts: AccountsTable;
  characters: CharactersTable;
  features: FeaturesTable;
  roles: RolesTable;
  account_feature_roles: AccountFeatureRolesTable;
  feature_settings: FeatureSettingsTable;
  auth_config: AuthConfigTable;
  audit_logs: AuditLogsTable;
}
