import type { ColumnType } from 'kysely';

export type SpaceType = 'kspace' | 'jspace' | 'pochven';

export interface BattlesTable {
  id: string;
  systemId: number;
  spaceType: SpaceType;
  startTime: ColumnType<Date, Date, Date>;
  endTime: ColumnType<Date, Date, Date>;
  totalKills: number;
  totalIskDestroyed: ColumnType<bigint, string | number | bigint, string | number | bigint>;
  zkillRelatedUrl: string;
  createdAt: ColumnType<Date, Date | undefined, never>;
}

export interface BattleKillmailsTable {
  battleId: string;
  killmailId: number;
  zkbUrl: string;
  occurredAt: ColumnType<Date, Date, Date>;
  victimAllianceId: number | null;
  attackerAllianceIds: number[];
  iskValue: ColumnType<
    bigint | null,
    string | number | bigint | null,
    string | number | bigint | null
  >;
  sideId: number | null;
}

export interface BattleParticipantsTable {
  battleId: string;
  characterId: number;
  allianceId: number | null;
  corpId: number | null;
  shipTypeId: number | null;
  sideId: number | null;
  isVictim: ColumnType<boolean, boolean, boolean>;
}

export interface Database {
  battles: BattlesTable;
  battle_killmails: BattleKillmailsTable;
  battle_participants: BattleParticipantsTable;
}
