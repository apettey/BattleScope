export const projectName = 'BattleScope';

export const assertEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] ?? defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable "${key}"`);
  }
  return value;
};

export type SpaceType = 'kspace' | 'jspace' | 'pochven';

export const deriveSpaceType = (systemId: number): SpaceType => {
  if (systemId >= 32000000 && systemId < 33000000) {
    return 'pochven';
  }

  if (systemId >= 31000000 && systemId < 32000000) {
    return 'jspace';
  }

  return 'kspace';
};

const pad = (value: number) => value.toString().padStart(2, '0');

export const buildZKillRelatedUrl = (systemId: number, startTime: Date): string => {
  const year = startTime.getUTCFullYear();
  const month = pad(startTime.getUTCMonth() + 1);
  const day = pad(startTime.getUTCDate());
  const hours = pad(startTime.getUTCHours());
  const minutes = pad(startTime.getUTCMinutes());

  return `https://zkillboard.com/related/${systemId}/${year}${month}${day}${hours}${minutes}/`;
};

export interface KillmailReference {
  killmailId: number;
  systemId: number;
  occurredAt: Date;
  victimAllianceId: number | null;
  victimCorpId: number | null;
  victimCharacterId: bigint | null;
  attackerAllianceIds: number[];
  attackerCorpIds: number[];
  attackerCharacterIds: bigint[];
  iskValue: bigint | null;
  zkbUrl: string;
}
