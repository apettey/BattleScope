export interface CharacterVerificationResult {
  characterId: string;
  accountId: string;
  success: boolean;
  corpChanged: boolean;
  allianceChanged: boolean;
  newCorpId?: bigint;
  newCorpName?: string;
  newAllianceId?: bigint | null;
  newAllianceName?: string | null;
  isAllowed: boolean;
  error?: string;
  skipReason?: 'token_revoked' | 'esi_error' | 'rate_limited';
}

export interface VerificationStats {
  totalCharacters: number;
  verified: number;
  failed: number;
  skipped: number;
  orgChanged: number;
  sessionsInvalidated: number;
  duration: number;
}

export interface CharacterToVerify {
  id: string;
  accountId: string;
  eveCharacterId: bigint;
  eveCharacterName: string;
  currentCorpId: bigint;
  currentCorpName: string;
  currentAllianceId: bigint | null;
  currentAllianceName: string | null;
  esiAccessToken: Buffer | null;
  esiRefreshToken: Buffer | null;
  esiTokenExpiresAt: Date | null;
  lastVerifiedAt: Date | null;
}
