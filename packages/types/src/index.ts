// Common types shared across all services

// Character types
export interface Character {
  id: string;
  eveCharacterId: number;
  eveCharacterName: string;
  corpId: number;
  corpName: string;
  allianceId?: number;
  allianceName?: string;
  portraitUrl?: string;
}

// Killmail types
export interface Killmail {
  killmailId: number;
  killmailHash: string;
  killmailTime: Date;
  solarSystemId: number;
  victim: KillmailVictim;
  attackers: KillmailAttacker[];
  zkb?: {
    totalValue: number;
    points: number;
    npc: boolean;
    solo: boolean;
    awox: boolean;
  };
}

export interface KillmailVictim {
  characterId?: number;
  characterName?: string;
  corporationId: number;
  corporationName?: string;
  allianceId?: number;
  allianceName?: string;
  shipTypeId: number;
  shipTypeName?: string;
  damageTaken: number;
  position?: {
    x: number;
    y: number;
    z: number;
  };
}

export interface KillmailAttacker {
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

// Battle types
export interface Battle {
  id: string;
  systemId: number;
  systemName: string;
  regionId: number;
  regionName: string;
  startTime: Date;
  endTime: Date;
  totalKills: number;
  totalValue: number;
  participants: number;
  alliances: string[];
  corporations: string[];
}

// ESI types
export interface EsiToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
}

// Event types (for Redpanda)
export interface KillmailEvent {
  type: 'killmail.received';
  data: Killmail;
  timestamp: Date;
}

export interface KillmailEnrichedEvent {
  type: 'killmail.enriched';
  data: Killmail;
  timestamp: Date;
}

export interface BattleDetectedEvent {
  type: 'battle.detected';
  data: {
    battleId: string;
    systemId: number;
    startTime: Date;
  };
  timestamp: Date;
}

export interface BattleUpdatedEvent {
  type: 'battle.updated';
  data: Battle;
  timestamp: Date;
}

export interface NotificationEvent {
  type: 'notification.created';
  data: {
    userId: string;
    title: string;
    message: string;
    category: string;
    relatedId?: string;
  };
  timestamp: Date;
}

export type Event =
  | KillmailEvent
  | KillmailEnrichedEvent
  | BattleDetectedEvent
  | BattleUpdatedEvent
  | NotificationEvent;

// Search types
export interface SearchResult {
  type: 'character' | 'corporation' | 'alliance' | 'system' | 'battle' | 'killmail';
  id: string | number;
  name: string;
  metadata?: Record<string, any>;
}
