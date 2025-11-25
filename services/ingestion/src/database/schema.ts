import { Generated, Insertable, Selectable, Updateable } from 'kysely';

// Database table schema
export interface KillmailEventsTable {
  killmail_id: number;
  system_id: number;
  occurred_at: Date;
  fetched_at: Generated<Date>;
  victim_alliance_id: number | null;
  attacker_alliance_ids: number[] | null;
  isk_value: number | null;
  zkb_url: string;
  raw_data: unknown; // JSONB
  processed_at: Date | null;
  battle_id: string | null;
}

// Database interface
export interface Database {
  killmail_events: KillmailEventsTable;
}

// Helper types for CRUD operations
export type KillmailEvent = Selectable<KillmailEventsTable>;
export type NewKillmailEvent = Insertable<KillmailEventsTable>;
export type KillmailEventUpdate = Updateable<KillmailEventsTable>;
