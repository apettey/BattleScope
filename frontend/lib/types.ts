// Authentication Types
export interface Character {
  id: string;
  character_id: number;
  character_name: string;
  corp_id: number;
  corp_name: string;
  alliance_id?: number;
  alliance_name?: string;
  portrait_url: string;
  is_primary: boolean;
  created_at: string;
}

export interface Account {
  id: string;
  primary_character_id?: string;
  created_at: string;
  last_login_at: string;
}

export interface User {
  account: Account;
  characters: Character[];
  primary_character?: Character;
  roles: string[];
  permissions: string[];
}

// Battle Types
export interface Battle {
  id: string;
  system_id: number;
  system_name: string;
  region_name: string;
  security_type: string;
  start_time: string;
  end_time?: string;
  total_kills: number;
  total_isk_destroyed: number;
  zkill_related_url?: string;
  created_at: string;
  updated_at: string;
}

export interface BattleParticipant {
  character_id: number;
  character_name: string;
  alliance_id?: number;
  alliance_name?: string;
  corp_id: number;
  corp_name: string;
  ship_type_id: number;
  ship_type_name: string;
  side_id?: number;
  is_victim: boolean;
}

// Killmail Types
export interface Killmail {
  killmail_id: number;
  system_id: number;
  system_name: string;
  region_name: string;
  occurred_at: string;
  victim_name: string;
  victim_alliance?: string;
  ship_type_name: string;
  isk_value: number;
  zkb_url: string;
}

// Search Types
export interface SearchResult {
  id: string;
  type: 'battle' | 'character' | 'corporation' | 'system';
  name: string;
  description: string;
  metadata?: Record<string, any>;
}

// Notification Types
export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  metadata?: Record<string, any>;
}

// Admin Types
export interface AdminAccount {
  id: string;
  primary_character_name?: string;
  character_count: number;
  created_at: string;
  last_login_at: string;
  is_active: boolean;
}

export interface Role {
  id: string;
  name: string;
  feature: string;
  permissions: string[];
}

// Stats Types
export interface DashboardStats {
  total_battles: number;
  total_killmails: number;
  active_users: number;
  recent_activity: number;
}
