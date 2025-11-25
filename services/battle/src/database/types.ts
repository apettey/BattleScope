import { Kysely } from 'kysely';

export interface BattlesTable {
  id: string;
  system_id: number;
  system_name: string;
  region_name: string;
  security_type: string;
  start_time: Date;
  end_time: Date | null;
  total_kills: number;
  total_isk_destroyed: bigint;
  zkill_related_url: string | null;
  created_at: Date;
  updated_at: Date;
  last_killmail_at: Date;
}

export interface BattleKillmailsTable {
  battle_id: string;
  killmail_id: number;
  occurred_at: Date;
  ship_type_name: string | null;
  victim_name: string | null;
  victim_alliance_name: string | null;
  isk_value: bigint | null;
  side_id: number | null;
}

export interface BattleParticipantsTable {
  battle_id: string;
  character_id: number;
  character_name: string | null;
  alliance_id: number | null;
  alliance_name: string | null;
  corp_id: number | null;
  corp_name: string | null;
  ship_type_id: number | null;
  ship_type_name: string | null;
  side_id: number | null;
  is_victim: boolean;
}

export interface PilotShipHistoryTable {
  character_id: number;
  ship_type_id: number;
  ship_type_name: string;
  first_seen: Date;
  last_seen: Date;
  kill_count: number;
  loss_count: number;
}

export interface Database {
  battles: BattlesTable;
  battle_killmails: BattleKillmailsTable;
  battle_participants: BattleParticipantsTable;
  pilot_ship_history: PilotShipHistoryTable;
}

export type DB = Kysely<Database>;
