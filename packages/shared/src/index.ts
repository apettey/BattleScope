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

export type SpaceType = 'kspace' | 'jspace' | 'pochven';

export const deriveSpaceType = (systemId: bigint | number): SpaceType => {
  const value = typeof systemId === 'bigint' ? Number(systemId) : systemId;

  if (value >= 32_000_000 && value < 33_000_000) {
    return 'pochven';
  }

  if (value >= 31_000_000 && value < 32_000_000) {
    return 'jspace';
  }

  return 'kspace';
};

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
