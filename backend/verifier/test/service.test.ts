import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Kysely } from 'kysely';
import type { Redis } from 'ioredis';
import type { Database } from '@battlescope/database';
import { EsiHttpError, type EsiClient } from '@battlescope/esi-client';
import type { EncryptionService } from '@battlescope/auth';
import type { Logger } from 'pino';
import { CharacterVerifierService } from '../src/service.js';
import type { Config } from '../src/config.js';
import type { CharacterToVerify } from '../src/types.js';

// Mock repositories
vi.mock('@battlescope/database', async () => {
  const actual = await vi.importActual('@battlescope/database');
  return {
    ...actual,
    CharacterRepository: vi.fn(),
    AuthConfigRepository: vi.fn(),
    AuditLogRepository: vi.fn(),
  };
});

// Import mocked classes
import {
  CharacterRepository,
  AuthConfigRepository,
  AuditLogRepository,
} from '@battlescope/database';

describe('CharacterVerifierService', () => {
  let service: CharacterVerifierService;
  let mockDb: Partial<Kysely<Database>>;
  let mockRedis: Partial<Redis>;
  let mockEsiClient: Partial<EsiClient>;
  let mockEncryptionService: Partial<EncryptionService>;
  let mockLogger: Partial<Logger>;
  let mockCharacterRepo: {
    update: ReturnType<typeof vi.fn>;
  };
  let mockAuthConfigRepo: {
    isCharacterAllowed: ReturnType<typeof vi.fn>;
  };
  let mockAuditLogRepo: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockConfig: Config;

  const createCharacterToVerify = (overrides?: Partial<CharacterToVerify>): CharacterToVerify => ({
    id: 'char-123',
    accountId: 'acc-456',
    eveCharacterId: 12345678n,
    eveCharacterName: 'Test Character',
    currentCorpId: 98765432n,
    currentCorpName: 'Test Corp',
    currentAllianceId: 11223344n,
    currentAllianceName: 'Test Alliance',
    esiAccessToken: Buffer.from('encrypted-access-token'),
    esiRefreshToken: Buffer.from('encrypted-refresh-token'),
    esiTokenExpiresAt: new Date(Date.now() + 3600000),
    lastVerifiedAt: new Date(Date.now() - 7200000), // 2 hours ago
    ...overrides,
  });

  beforeEach(() => {
    // Setup mock database
    mockDb = {
      selectFrom: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
      destroy: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Setup mock Redis
    mockRedis = {
      get: vi.fn(),
      del: vi.fn() as any,
      setex: vi.fn(),
      quit: vi.fn().mockResolvedValue('OK'),
    } as any;

    // Setup mock ESI client
    mockEsiClient = {
      getCharacterInfo: vi.fn(),
      getCorporationInfo: vi.fn(),
      getAllianceInfo: vi.fn(),
    };

    // Setup mock encryption service
    mockEncryptionService = {
      decryptFromBuffer: vi.fn().mockReturnValue('decrypted-token'),
      encryptToBuffer: vi.fn(),
    };

    // Setup mock logger
    mockLogger = {
      info: vi.fn() as any,
      warn: vi.fn() as any,
      error: vi.fn() as any,
      debug: vi.fn() as any,
    };

    // Setup mock repositories
    mockCharacterRepo = {
      update: vi.fn().mockResolvedValue(undefined),
    };

    mockAuthConfigRepo = {
      isCharacterAllowed: vi.fn().mockResolvedValue(true),
    };

    mockAuditLogRepo = {
      create: vi.fn().mockResolvedValue(undefined),
    };

    // Ensure logger is available
    if (!mockLogger.child) {
      mockLogger.child = vi.fn().mockReturnValue(mockLogger);
    }

    // Re-setup mocked repository constructors for each test
    vi.mocked(CharacterRepository).mockClear();
    vi.mocked(AuthConfigRepository).mockClear();
    vi.mocked(AuditLogRepository).mockClear();

    vi.mocked(CharacterRepository).mockImplementation(() => mockCharacterRepo as any);
    vi.mocked(AuthConfigRepository).mockImplementation(() => mockAuthConfigRepo as any);
    vi.mocked(AuditLogRepository).mockImplementation(() => mockAuditLogRepo as any);

    // Setup config
    mockConfig = {
      databaseUrl: 'postgresql://test',
      redisUrl: 'redis://test',
      encryptionKey: 'test-encryption-key-at-least-32-chars',
      batchSize: 50,
      delayBetweenBatches: 100, // Reduced for testing
      maxCharactersPerRun: 1000,
      verificationThresholdMinutes: 55,
      nodeEnv: 'test',
    };

    service = new CharacterVerifierService(
      mockDb as Kysely<Database>,
      mockRedis as Redis,
      mockEsiClient as EsiClient,
      mockEncryptionService as EncryptionService,
      mockConfig,
      mockLogger as Logger,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('run', () => {
    it('should complete successfully when no characters need verification', async () => {
      // Arrange
      vi.mocked(mockDb.execute!).mockResolvedValue([]);

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.totalCharacters).toBe(0);
      expect(stats.verified).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.skipped).toBe(0);
      expect(stats.orgChanged).toBe(0);
      expect(stats.sessionsInvalidated).toBe(0);
      expect(stats.duration).toBeGreaterThanOrEqual(0);
    });

    it('should log starting message', async () => {
      // Act
      await service.run();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith('Starting character verification job');
    });

    it('should log completion message', async () => {
      // Act
      await service.run();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 0,
        }),
        'Characters to verify',
      );
    });

    it('should verify character successfully when org has not changed', async () => {
      // Arrange
      const character = createCharacterToVerify();
      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      vi.mocked(mockEsiClient.getCharacterInfo!).mockResolvedValue({
        corporation_id: Number(character.currentCorpId),
        alliance_id: Number(character.currentAllianceId),
        name: character.eveCharacterName,
      } as any);

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.totalCharacters).toBe(1);
      expect(stats.verified).toBe(1);
      expect(stats.failed).toBe(0);
      expect(stats.orgChanged).toBe(0);
      expect(mockCharacterRepo.update).toHaveBeenCalledWith(character.id, {
        lastVerifiedAt: expect.any(Date),
      });
    });

    it('should handle verification failure gracefully', async () => {
      // Arrange
      const character = createCharacterToVerify();
      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      vi.mocked(mockEsiClient.getCharacterInfo!).mockRejectedValue(new Error('ESI unavailable'));

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.totalCharacters).toBe(1);
      expect(stats.verified).toBe(0);
      expect(stats.failed).toBe(1);
      expect(stats.skipped).toBe(0);
    });

    it('should detect corporation changes', async () => {
      // Arrange
      const character = createCharacterToVerify();
      const newCorpId = 11111111;
      const newCorpName = 'New Corp';

      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      vi.mocked(mockEsiClient.getCharacterInfo!).mockResolvedValue({
        corporation_id: newCorpId,
        alliance_id: Number(character.currentAllianceId),
        name: character.eveCharacterName,
      } as any);

      vi.mocked(mockEsiClient.getCorporationInfo!).mockResolvedValue({
        name: newCorpName,
      } as any);

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.verified).toBe(1);
      expect(stats.orgChanged).toBe(1);
      expect(mockCharacterRepo.update).toHaveBeenCalledWith(
        character.id,
        expect.objectContaining({
          corpId: BigInt(newCorpId),
          corpName: newCorpName,
          lastVerifiedAt: expect.any(Date),
        }),
      );
    });

    it('should detect alliance changes', async () => {
      // Arrange
      const character = createCharacterToVerify();
      const newAllianceId = 22222222;
      const newAllianceName = 'New Alliance';

      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      vi.mocked(mockEsiClient.getCharacterInfo!).mockResolvedValue({
        corporation_id: Number(character.currentCorpId),
        alliance_id: newAllianceId,
        name: character.eveCharacterName,
      } as any);

      vi.mocked(mockEsiClient.getAllianceInfo!).mockResolvedValue({
        name: newAllianceName,
      } as any);

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.verified).toBe(1);
      expect(stats.orgChanged).toBe(1);
      expect(mockCharacterRepo.update).toHaveBeenCalledWith(
        character.id,
        expect.objectContaining({
          allianceId: BigInt(newAllianceId),
          allianceName: newAllianceName,
          lastVerifiedAt: expect.any(Date),
        }),
      );
    });

    it('should detect both corp and alliance changes', async () => {
      // Arrange
      const character = createCharacterToVerify();
      const newCorpId = 11111111;
      const newAllianceId = 22222222;

      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      vi.mocked(mockEsiClient.getCharacterInfo!).mockResolvedValue({
        corporation_id: newCorpId,
        alliance_id: newAllianceId,
        name: character.eveCharacterName,
      } as any);

      vi.mocked(mockEsiClient.getCorporationInfo!).mockResolvedValue({
        name: 'New Corp',
      } as any);

      vi.mocked(mockEsiClient.getAllianceInfo!).mockResolvedValue({
        name: 'New Alliance',
      } as any);

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.verified).toBe(1);
      expect(stats.orgChanged).toBe(1);
    });

    it('should invalidate session when character moves to disallowed organization', async () => {
      // Arrange
      const character = createCharacterToVerify();
      const newCorpId = 11111111;

      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      vi.mocked(mockEsiClient.getCharacterInfo!).mockResolvedValue({
        corporation_id: newCorpId,
        alliance_id: null,
        name: character.eveCharacterName,
      } as any);

      vi.mocked(mockEsiClient.getCorporationInfo!).mockResolvedValue({
        name: 'Disallowed Corp',
      } as any);

      mockAuthConfigRepo.isCharacterAllowed.mockResolvedValue(false);
      vi.mocked(mockRedis.get!).mockResolvedValue('session-token-abc');

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.sessionsInvalidated).toBe(1);
      expect(mockRedis.del).toHaveBeenCalledWith('battlescope:session:session-token-abc');
      expect(mockRedis.del).toHaveBeenCalledWith(
        `battlescope:account-session:${character.accountId}`,
      );
      expect(mockAuditLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'session.invalidated',
          targetType: 'account',
          targetId: character.accountId,
        }),
      );
    });

    it('should handle missing ESI tokens by skipping verification', async () => {
      // Arrange
      const character = createCharacterToVerify({
        esiAccessToken: null,
        esiRefreshToken: null,
      });

      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: null,
          esiRefreshToken: null,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.totalCharacters).toBe(1);
      expect(stats.skipped).toBe(1);
      expect(stats.verified).toBe(0);
      expect(mockEsiClient.getCharacterInfo).not.toHaveBeenCalled();
    });

    it('should handle ESI 401 errors (token revoked)', async () => {
      // Arrange
      const character = createCharacterToVerify();

      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      vi.mocked(mockEsiClient.getCharacterInfo!).mockRejectedValue(
        new EsiHttpError('Unauthorized', 401, 'GET', '/characters/123'),
      );

      mockAuthConfigRepo.isCharacterAllowed.mockResolvedValue(true);

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.totalCharacters).toBe(1);
      expect(stats.skipped).toBe(1);
      expect(stats.verified).toBe(0);
      expect(stats.failed).toBe(0);
    });

    it('should handle ESI 403 errors (forbidden)', async () => {
      // Arrange
      const character = createCharacterToVerify();

      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      vi.mocked(mockEsiClient.getCharacterInfo!).mockRejectedValue(
        new EsiHttpError('Forbidden', 403, 'GET', '/characters/123'),
      );

      mockAuthConfigRepo.isCharacterAllowed.mockResolvedValue(true);

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.totalCharacters).toBe(1);
      expect(stats.skipped).toBe(1);
      expect(stats.verified).toBe(0);
      expect(stats.failed).toBe(0);
    });

    it('should handle ESI 429 errors with exponential backoff', async () => {
      // Arrange
      const character = createCharacterToVerify();

      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      // First call rate limited, second succeeds
      vi.mocked(mockEsiClient.getCharacterInfo!)
        .mockRejectedValueOnce(new EsiHttpError('Too Many Requests', 429, 'GET', '/characters/123'))
        .mockResolvedValueOnce({
          corporation_id: Number(character.currentCorpId),
          alliance_id: Number(character.currentAllianceId),
          name: character.eveCharacterName,
        } as any);

      mockAuthConfigRepo.isCharacterAllowed.mockResolvedValue(true);

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.totalCharacters).toBe(1);
      expect(stats.verified).toBe(1);
      expect(stats.failed).toBe(0);
      expect(stats.skipped).toBe(0);
      expect(mockEsiClient.getCharacterInfo).toHaveBeenCalledTimes(2);
    });

    it('should process multiple characters in batches', async () => {
      // Arrange
      mockConfig.batchSize = 2;
      service = new CharacterVerifierService(
        mockDb as Kysely<Database>,
        mockRedis as Redis,
        mockEsiClient as EsiClient,
        mockEncryptionService as EncryptionService,
        mockConfig,
        mockLogger as Logger,
      );

      const characters = [
        createCharacterToVerify({ id: 'char-1', eveCharacterId: 1n }),
        createCharacterToVerify({ id: 'char-2', eveCharacterId: 2n }),
        createCharacterToVerify({ id: 'char-3', eveCharacterId: 3n }),
      ];

      vi.mocked(mockDb.execute!).mockResolvedValue(
        characters.map((c) => ({
          id: c.id,
          accountId: c.accountId,
          eveCharacterId: c.eveCharacterId,
          eveCharacterName: c.eveCharacterName,
          corpId: c.currentCorpId,
          corpName: c.currentCorpName,
          allianceId: c.currentAllianceId,
          allianceName: c.currentAllianceName,
          esiAccessToken: c.esiAccessToken,
          esiRefreshToken: c.esiRefreshToken,
          esiTokenExpiresAt: c.esiTokenExpiresAt,
          lastVerifiedAt: c.lastVerifiedAt,
        })),
      );

      vi.mocked(mockEsiClient.getCharacterInfo!).mockResolvedValue({
        corporation_id: 12345,
        alliance_id: 67890,
        name: 'Test Character',
      } as any);

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.totalCharacters).toBe(3);
      expect(stats.verified).toBe(3);
      // Should have been called once per character
      expect(mockEsiClient.getCharacterInfo).toHaveBeenCalledTimes(3);
    });

    it('should handle decryption errors gracefully', async () => {
      // Arrange
      const character = createCharacterToVerify();

      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      vi.mocked(mockEncryptionService.decryptFromBuffer!).mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.skipped).toBe(1);
      expect(mockEsiClient.getCharacterInfo).not.toHaveBeenCalled();
    });

    it('should handle corporation info fetch failure gracefully', async () => {
      // Arrange
      const character = createCharacterToVerify();
      const newCorpId = 11111111;

      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      vi.mocked(mockEsiClient.getCharacterInfo!).mockResolvedValue({
        corporation_id: newCorpId,
        alliance_id: Number(character.currentAllianceId),
        name: character.eveCharacterName,
      } as any);

      vi.mocked(mockEsiClient.getCorporationInfo!).mockRejectedValue(new Error('ESI error'));

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.verified).toBe(1);
      expect(stats.orgChanged).toBe(1);
      // Should still update with existing corp name
      expect(mockCharacterRepo.update).toHaveBeenCalled();
    });

    it('should handle alliance info fetch failure gracefully', async () => {
      // Arrange
      const character = createCharacterToVerify();
      const newAllianceId = 22222222;

      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      vi.mocked(mockEsiClient.getCharacterInfo!).mockResolvedValue({
        corporation_id: Number(character.currentCorpId),
        alliance_id: newAllianceId,
        name: character.eveCharacterName,
      } as any);

      vi.mocked(mockEsiClient.getAllianceInfo!).mockRejectedValue(new Error('ESI error'));

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.verified).toBe(1);
      expect(stats.orgChanged).toBe(1);
      expect(mockCharacterRepo.update).toHaveBeenCalled();
    });

    it('should handle session invalidation Redis errors gracefully', async () => {
      // Arrange
      const character = createCharacterToVerify();
      const newCorpId = 11111111;

      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      vi.mocked(mockEsiClient.getCharacterInfo!).mockResolvedValue({
        corporation_id: newCorpId,
        alliance_id: null,
        name: character.eveCharacterName,
      } as any);

      vi.mocked(mockEsiClient.getCorporationInfo!).mockResolvedValue({
        name: 'Disallowed Corp',
      } as any);

      mockAuthConfigRepo.isCharacterAllowed.mockResolvedValue(false);
      vi.mocked(mockRedis.get!).mockRejectedValue(new Error('Redis error'));

      // Act & Assert - should not throw
      await expect(service.run()).resolves.not.toThrow();
    });

    it('should handle audit log creation failure gracefully', async () => {
      // Arrange
      const character = createCharacterToVerify();
      const newCorpId = 11111111;

      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      vi.mocked(mockEsiClient.getCharacterInfo!).mockResolvedValue({
        corporation_id: newCorpId,
        alliance_id: null,
        name: character.eveCharacterName,
      } as any);

      vi.mocked(mockEsiClient.getCorporationInfo!).mockResolvedValue({
        name: 'Disallowed Corp',
      } as any);

      mockAuthConfigRepo.isCharacterAllowed.mockResolvedValue(false);
      vi.mocked(mockRedis.get!).mockResolvedValue('session-token');
      mockAuditLogRepo.create.mockRejectedValue(new Error('Database error'));

      // Act & Assert - should not throw
      await expect(service.run()).resolves.not.toThrow();
    });

    it('should skip session invalidation when no session exists', async () => {
      // Arrange
      const character = createCharacterToVerify();
      const newCorpId = 11111111;

      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      vi.mocked(mockEsiClient.getCharacterInfo!).mockResolvedValue({
        corporation_id: newCorpId,
        alliance_id: null,
        name: character.eveCharacterName,
      } as any);

      vi.mocked(mockEsiClient.getCorporationInfo!).mockResolvedValue({
        name: 'Disallowed Corp',
      } as any);

      mockAuthConfigRepo.isCharacterAllowed.mockResolvedValue(false);
      vi.mocked(mockRedis.get!).mockResolvedValue(null);

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.sessionsInvalidated).toBe(1);
      expect(mockRedis.del).not.toHaveBeenCalled();
      expect(mockAuditLogRepo.create).toHaveBeenCalled();
    });

    it('should handle character leaving alliance (null alliance)', async () => {
      // Arrange
      const character = createCharacterToVerify();

      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: character.currentAllianceId,
          allianceName: character.currentAllianceName,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      vi.mocked(mockEsiClient.getCharacterInfo!).mockResolvedValue({
        corporation_id: Number(character.currentCorpId),
        alliance_id: undefined, // Left alliance
        name: character.eveCharacterName,
      } as any);

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.verified).toBe(1);
      expect(stats.orgChanged).toBe(1);
      expect(mockCharacterRepo.update).toHaveBeenCalledWith(
        character.id,
        expect.objectContaining({
          allianceId: null,
          allianceName: null,
        }),
      );
    });

    it('should handle character with no previous alliance joining an alliance', async () => {
      // Arrange
      const character = createCharacterToVerify({
        currentAllianceId: null,
        currentAllianceName: null,
      });
      const newAllianceId = 12345678;
      const newAllianceName = 'New Alliance';

      vi.mocked(mockDb.execute!).mockResolvedValue([
        {
          id: character.id,
          accountId: character.accountId,
          eveCharacterId: character.eveCharacterId,
          eveCharacterName: character.eveCharacterName,
          corpId: character.currentCorpId,
          corpName: character.currentCorpName,
          allianceId: null,
          allianceName: null,
          esiAccessToken: character.esiAccessToken,
          esiRefreshToken: character.esiRefreshToken,
          esiTokenExpiresAt: character.esiTokenExpiresAt,
          lastVerifiedAt: character.lastVerifiedAt,
        },
      ]);

      vi.mocked(mockEsiClient.getCharacterInfo!).mockResolvedValue({
        corporation_id: Number(character.currentCorpId),
        alliance_id: newAllianceId,
        name: character.eveCharacterName,
      } as any);

      vi.mocked(mockEsiClient.getAllianceInfo!).mockResolvedValue({
        name: newAllianceName,
      } as any);

      // Act
      const stats = await service.run();

      // Assert
      expect(stats.verified).toBe(1);
      expect(stats.orgChanged).toBe(1);
      expect(mockCharacterRepo.update).toHaveBeenCalledWith(
        character.id,
        expect.objectContaining({
          allianceId: BigInt(newAllianceId),
          allianceName: newAllianceName,
        }),
      );
    });
  });
});
