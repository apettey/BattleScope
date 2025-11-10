export const projectName = 'BattleScope';
export const ENRICHMENT_QUEUE_NAME = 'killmail-enrichment';
export interface EnrichmentJobPayload {
  killmailId: string;
}

export const assertEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] ?? defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable "${key}"`);
  }
  return value;
};

export { deriveSpaceType } from './space-type.js';

// Security type for EVE Online space categorization
export type SecurityType = 'highsec' | 'lowsec' | 'nullsec' | 'wormhole' | 'pochven';

const pad = (value: number) => value.toString().padStart(2, '0');

export const buildZKillRelatedUrl = (systemId: bigint | number, startTime: Date): string => {
  const year = startTime.getUTCFullYear();
  const month = pad(startTime.getUTCMonth() + 1);
  const day = pad(startTime.getUTCDate());
  const hours = pad(startTime.getUTCHours());
  const minutes = pad(startTime.getUTCMinutes());

  return `https://zkillboard.com/related/${systemId.toString()}/${year}${month}${day}${hours}${minutes}/`;
};

export interface KillmailReference {
  killmailId: bigint;
  systemId: bigint;
  occurredAt: Date;
  victimAllianceId: bigint | null;
  victimCorpId: bigint | null;
  victimCharacterId: bigint | null;
  attackerAllianceIds: bigint[];
  attackerCorpIds: bigint[];
  attackerCharacterIds: bigint[];
  iskValue: bigint | null;
  zkbUrl: string;
}

export interface RulesetSnapshot {
  id: string;
  minPilots: number;
  trackedAllianceIds: string[];
  trackedCorpIds: string[];
  ignoreUnlisted: boolean;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RulesetUpdatePayload {
  minPilots: number;
  trackedAllianceIds: string[];
  trackedCorpIds: string[];
  ignoreUnlisted: boolean;
  updatedBy: string | null;
}

export interface KillmailFeedItemDto {
  killmailId: string;
  systemId: string;
  occurredAt: string;
  securityType: SecurityType;
  victimAllianceId: string | null;
  victimCorpId: string | null;
  victimCharacterId: string | null;
  attackerAllianceIds: string[];
  attackerCorpIds: string[];
  attackerCharacterIds: string[];
  iskValue: string | null;
  zkbUrl: string;
  battleId: string | null;
  participantCount: number;
}

export interface DashboardSummaryDto {
  totalBattles: number;
  totalKillmails: number;
  uniqueAlliances: number;
  uniqueCorporations: number;
  topAlliances: Array<{ allianceId: string; battleCount: number }>;
  topCorporations: Array<{ corpId: string; battleCount: number }>;
  generatedAt: string;
}

export { startTelemetry, stopTelemetry } from './otel/index.js';
export { SystemSecurityResolver, deriveSecurityType, type SystemInfo } from './system-security.js';
export { createLoggerConfig } from './logger.js';
