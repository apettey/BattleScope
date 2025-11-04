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
  ignoreUnlisted: ColumnType<boolean, boolean | undefined, boolean>;
  updatedBy: string | null;
  createdAt: ColumnType<Date, Date | undefined, never>;
  updatedAt: ColumnType<Date, Date | undefined, Date | undefined>;
}

export interface Database {
  battles: BattlesTable;
  battle_killmails: BattleKillmailsTable;
  battle_participants: BattleParticipantsTable;
  killmail_events: KillmailEventsTable;
  killmail_enrichments: KillmailEnrichmentsTable;
  rulesets: RulesetsTable;
}
