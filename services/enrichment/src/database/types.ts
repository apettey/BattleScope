import type { ColumnType } from 'kysely';

export interface Database {
  enriched_killmails: EnrichedKillmailsTable;
  esi_cache: EsiCacheTable;
  enrichment_stats: EnrichmentStatsTable;
}

export interface EnrichedKillmailsTable {
  killmail_id: number;
  ship_type_id: number;
  ship_type_name: string;
  ship_group_name: string;
  system_id: number;
  system_name: string;
  region_id: number;
  region_name: string;
  security_status: number;
  victim_character_id: number | null;
  victim_character_name: string | null;
  victim_corp_id: number | null;
  victim_corp_name: string | null;
  victim_alliance_id: number | null;
  victim_alliance_name: string | null;
  attacker_data: ColumnType<AttackerData[], string, string>;
  raw_killmail_data: ColumnType<any, string, string>;
  enriched_at: ColumnType<Date, string | Date, string | Date>;
  version: number;
}

export interface AttackerData {
  characterId?: number;
  characterName?: string;
  corporationId?: number;
  corporationName?: string;
  allianceId?: number;
  allianceName?: string;
  shipTypeId?: number;
  shipTypeName?: string;
  weaponTypeId?: number;
  weaponTypeName?: string;
  damageDone: number;
  finalBlow: boolean;
}

export interface EsiCacheTable {
  cache_key: string;
  cache_value: ColumnType<any, string, string>;
  cached_at: ColumnType<Date, string | Date, string | Date>;
  expires_at: ColumnType<Date, string | Date, string | Date>;
}

export interface EnrichmentStatsTable {
  id: ColumnType<number, never, never>;
  date: ColumnType<Date, string | Date, string | Date>;
  killmails_processed: number;
  esi_api_calls: number;
  esi_cache_hits: number;
  esi_cache_misses: number;
  errors_count: number;
  avg_processing_time_ms: number;
  created_at: ColumnType<Date, string | Date | undefined, string | Date>;
  updated_at: ColumnType<Date, string | Date | undefined, string | Date>;
}
