import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Kysely } from 'kysely';
import type { Redis } from 'ioredis';
import type { Database } from '@battlescope/database';
import type { EsiClient } from '@battlescope/esi-client';
import type { EncryptionService } from '@battlescope/auth';
import { CharacterVerifierService } from '../src/service.js';
import type { Config } from '../src/config.js';

describe('CharacterVerifierService', () => {
  let service: CharacterVerifierService;
  let mockDb: Partial<Kysely<Database>>;
  let mockRedis: Partial<Redis>;
  let mockEsiClient: Partial<EsiClient>;
  let mockEncryptionService: Partial<EncryptionService>;
  let mockLogger: unknown;
  let mockConfig: Config;

  beforeEach(() => {
    mockDb = {
      selectFrom: vi.fn().mockReturnThis(),
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([]),
    } as any;

    mockRedis = {
      get: vi.fn(),
      del: vi.fn() as any,
      setex: vi.fn(),
    } as any;

    mockEsiClient = {
      getCharacterInfo: vi.fn(),
      getCorporationInfo: vi.fn(),
      getAllianceInfo: vi.fn(),
    };

    mockEncryptionService = {
      decryptFromBuffer: vi.fn(),
      encryptToBuffer: vi.fn(),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    mockConfig = {
      databaseUrl: 'postgresql://test',
      redisUrl: 'redis://test',
      encryptionKey: 'test-encryption-key-at-least-32-chars',
      batchSize: 50,
      delayBetweenBatches: 1000,
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
      mockLogger,
    );
  });

  describe('run', () => {
    it('should complete successfully when no characters need verification', async () => {
      const stats = await service.run();

      expect(stats.totalCharacters).toBe(0);
      expect(stats.verified).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.skipped).toBe(0);
      expect(stats.orgChanged).toBe(0);
      expect(stats.sessionsInvalidated).toBe(0);
    });

    it('should log starting message', async () => {
      await service.run();

      expect(mockLogger.info).toHaveBeenCalledWith('Starting character verification job');
    });

    it('should log completion message', async () => {
      await service.run();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 0,
        }),
        'Characters to verify',
      );
    });
  });
});
