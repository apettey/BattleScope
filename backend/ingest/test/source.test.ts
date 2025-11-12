import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ZKillboardRedisQSource, MockKillmailSource } from '../src/source.js';
import type { KillmailReference } from '@battlescope/shared';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('ZKillboardRedisQSource', () => {
  let source: ZKillboardRedisQSource;
  const redisqUrl = 'https://redisq.zkillboard.com/listen.php';

  beforeEach(() => {
    source = new ZKillboardRedisQSource(redisqUrl);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create source with URL only', () => {
      expect(source).toBeInstanceOf(ZKillboardRedisQSource);
    });

    it('should create source with URL and queueID', () => {
      const sourceWithQueue = new ZKillboardRedisQSource(redisqUrl, 'my-queue');
      expect(sourceWithQueue).toBeInstanceOf(ZKillboardRedisQSource);
    });

    it('should create source with custom user agent', () => {
      const customAgent = 'CustomClient/1.0';
      const sourceWithAgent = new ZKillboardRedisQSource(redisqUrl, undefined, customAgent);
      expect(sourceWithAgent).toBeInstanceOf(ZKillboardRedisQSource);
    });
  });

  describe('pull', () => {
    it('should successfully fetch and parse killmail', async () => {
      // Arrange
      const mockKillmail = {
        package: {
          killID: 123456,
          killmail: {
            killmail_id: 123456,
            solar_system_id: 30000142,
            killmail_time: '2024-01-01T12:00:00Z',
            victim: {
              alliance_id: 111,
              corporation_id: 222,
              character_id: 333,
            },
            attackers: [
              {
                alliance_id: 444,
                corporation_id: 555,
                character_id: 666,
              },
              {
                alliance_id: 777,
                corporation_id: 888,
                character_id: 999,
              },
            ],
          },
          zkb: {
            totalValue: 1000000000,
            url: 'https://zkillboard.com/kill/123456/',
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockKillmail,
      });

      // Act
      const result = await source.pull();

      // Assert
      expect(result).toBeTruthy();
      expect(result!.killmailId).toBe(123456n);
      expect(result!.systemId).toBe(30000142n);
      expect(result!.occurredAt).toEqual(new Date('2024-01-01T12:00:00Z'));
      expect(result!.victimAllianceId).toBe(111n);
      expect(result!.victimCorpId).toBe(222n);
      expect(result!.victimCharacterId).toBe(333n);
      expect(result!.attackerAllianceIds).toContain(444n);
      expect(result!.attackerAllianceIds).toContain(777n);
      expect(result!.iskValue).toBe(1000000000n);
      expect(result!.zkbUrl).toBe('https://zkillboard.com/kill/123456/');
    });

    it('should return null for empty package', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ package: null }),
      });

      // Act
      const result = await source.pull();

      // Assert
      expect(result).toBeNull();
    });

    it('should include queueID in request when provided', async () => {
      // Arrange
      const queueId = 'test-queue';
      source = new ZKillboardRedisQSource(redisqUrl, queueId);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ package: null }),
      });

      // Act
      await source.pull();

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          href: expect.stringContaining('queueID=test-queue'),
        }),
        expect.any(Object),
      );
    });

    it('should set correct User-Agent header', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ package: null }),
      });

      // Act
      await source.pull();

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'BattleScope-Ingest/1.0 (+https://battlescope.app)',
          }),
        }),
      );
    });

    it('should use custom User-Agent when provided', async () => {
      // Arrange
      const customAgent = 'CustomClient/2.0';
      source = new ZKillboardRedisQSource(redisqUrl, undefined, customAgent);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ package: null }),
      });

      // Act
      await source.pull();

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': customAgent,
          }),
        }),
      );
    });

    it('should throw error when response is not OK', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      // Act & Assert
      await expect(source.pull()).rejects.toThrow('RedisQ request failed with status 500');
    });

    it('should handle null victim alliance ID', async () => {
      // Arrange
      const mockKillmail = {
        package: {
          killID: 123456,
          killmail: {
            killmail_id: 123456,
            solar_system_id: 30000142,
            killmail_time: '2024-01-01T12:00:00Z',
            victim: {
              alliance_id: null,
              corporation_id: 222,
              character_id: 333,
            },
            attackers: [],
          },
          zkb: {},
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockKillmail,
      });

      // Act
      const result = await source.pull();

      // Assert
      expect(result!.victimAllianceId).toBeNull();
    });

    it('should handle missing zkb URL by generating default', async () => {
      // Arrange
      const mockKillmail = {
        package: {
          killID: 123456,
          killmail: {
            killmail_id: 123456,
            solar_system_id: 30000142,
            killmail_time: '2024-01-01T12:00:00Z',
            victim: {},
            attackers: [],
          },
          zkb: {}, // No url provided
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockKillmail,
      });

      // Act
      const result = await source.pull();

      // Assert
      expect(result!.zkbUrl).toBe('https://zkillboard.com/kill/123456/');
    });

    it('should handle missing ISK value', async () => {
      // Arrange
      const mockKillmail = {
        package: {
          killID: 123456,
          killmail: {
            killmail_id: 123456,
            solar_system_id: 30000142,
            killmail_time: '2024-01-01T12:00:00Z',
            victim: {},
            attackers: [],
          },
          zkb: {
            totalValue: null,
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockKillmail,
      });

      // Act
      const result = await source.pull();

      // Assert
      expect(result!.iskValue).toBeNull();
    });

    it('should round ISK value to nearest integer', async () => {
      // Arrange
      const mockKillmail = {
        package: {
          killID: 123456,
          killmail: {
            killmail_id: 123456,
            solar_system_id: 30000142,
            killmail_time: '2024-01-01T12:00:00Z',
            victim: {},
            attackers: [],
          },
          zkb: {
            totalValue: 1234567.89,
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockKillmail,
      });

      // Act
      const result = await source.pull();

      // Assert
      expect(result!.iskValue).toBe(1234568n); // Rounded
    });

    it('should deduplicate attacker alliance IDs', async () => {
      // Arrange
      const mockKillmail = {
        package: {
          killID: 123456,
          killmail: {
            killmail_id: 123456,
            solar_system_id: 30000142,
            killmail_time: '2024-01-01T12:00:00Z',
            victim: {},
            attackers: [
              { alliance_id: 111 },
              { alliance_id: 222 },
              { alliance_id: 111 }, // Duplicate
              { alliance_id: 333 },
              { alliance_id: 222 }, // Duplicate
            ],
          },
          zkb: {},
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockKillmail,
      });

      // Act
      const result = await source.pull();

      // Assert
      expect(result!.attackerAllianceIds).toHaveLength(3); // Only unique IDs
      expect(result!.attackerAllianceIds).toContain(111n);
      expect(result!.attackerAllianceIds).toContain(222n);
      expect(result!.attackerAllianceIds).toContain(333n);
    });

    it('should filter out null and undefined attacker IDs', async () => {
      // Arrange
      const mockKillmail = {
        package: {
          killID: 123456,
          killmail: {
            killmail_id: 123456,
            solar_system_id: 30000142,
            killmail_time: '2024-01-01T12:00:00Z',
            victim: {},
            attackers: [
              { alliance_id: 111 },
              { alliance_id: null },
              { alliance_id: undefined },
              { alliance_id: 222 },
            ],
          },
          zkb: {},
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockKillmail,
      });

      // Act
      const result = await source.pull();

      // Assert
      expect(result!.attackerAllianceIds).toHaveLength(2);
      expect(result!.attackerAllianceIds).toContain(111n);
      expect(result!.attackerAllianceIds).toContain(222n);
    });

    it('should handle empty attackers array', async () => {
      // Arrange
      const mockKillmail = {
        package: {
          killID: 123456,
          killmail: {
            killmail_id: 123456,
            solar_system_id: 30000142,
            killmail_time: '2024-01-01T12:00:00Z',
            victim: {},
            attackers: [],
          },
          zkb: {},
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockKillmail,
      });

      // Act
      const result = await source.pull();

      // Assert
      expect(result!.attackerAllianceIds).toEqual([]);
      expect(result!.attackerCorpIds).toEqual([]);
      expect(result!.attackerCharacterIds).toEqual([]);
    });

    it('should throw error for invalid timestamp', async () => {
      // Arrange
      const mockKillmail = {
        package: {
          killID: 123456,
          killmail: {
            killmail_id: 123456,
            solar_system_id: 30000142,
            killmail_time: 'invalid-date',
            victim: {},
            attackers: [],
          },
          zkb: {},
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockKillmail,
      });

      // Act & Assert
      await expect(source.pull()).rejects.toThrow('Invalid killmail timestamp');
    });

    it('should throw error for missing killmail data', async () => {
      // Arrange
      const mockResponse = {
        package: {
          killID: 123456,
          killmail: null,
          zkb: {},
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      // Act & Assert
      await expect(source.pull()).rejects.toThrow('Missing killmail data');
    });

    it('should use killID fallback when killmail_id is missing', async () => {
      // Arrange
      const mockKillmail = {
        package: {
          killID: 999999,
          killmail: {
            // killmail_id is missing
            solar_system_id: 30000142,
            killmail_time: '2024-01-01T12:00:00Z',
            victim: {},
            attackers: [],
          },
          zkb: {},
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockKillmail,
      });

      // Act
      const result = await source.pull();

      // Assert
      expect(result!.killmailId).toBe(999999n);
    });

    it('should handle network errors', async () => {
      // Arrange
      mockFetch.mockRejectedValue(new Error('Network error'));

      // Act & Assert
      await expect(source.pull()).rejects.toThrow('Network error');
    });

    it('should handle JSON parse errors', async () => {
      // Arrange
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      // Act & Assert
      await expect(source.pull()).rejects.toThrow('Invalid JSON');
    });
  });
});

describe('MockKillmailSource', () => {
  describe('pull', () => {
    it('should return killmails in sequence', async () => {
      // Arrange
      const events: KillmailReference[] = [
        {
          killmailId: 1n,
          systemId: 30000142n,
          occurredAt: new Date('2024-01-01T12:00:00Z'),
          victimAllianceId: null,
          victimCorpId: null,
          victimCharacterId: null,
          attackerAllianceIds: [],
          attackerCorpIds: [],
          attackerCharacterIds: [],
          iskValue: null,
          zkbUrl: 'https://zkillboard.com/kill/1/',
        },
        {
          killmailId: 2n,
          systemId: 30000142n,
          occurredAt: new Date('2024-01-01T12:05:00Z'),
          victimAllianceId: null,
          victimCorpId: null,
          victimCharacterId: null,
          attackerAllianceIds: [],
          attackerCorpIds: [],
          attackerCharacterIds: [],
          iskValue: null,
          zkbUrl: 'https://zkillboard.com/kill/2/',
        },
      ];
      const source = new MockKillmailSource(events);

      // Act
      const first = await source.pull();
      const second = await source.pull();

      // Assert
      expect(first!.killmailId).toBe(1n);
      expect(second!.killmailId).toBe(2n);
    });

    it('should return null when all events are exhausted', async () => {
      // Arrange
      const events: KillmailReference[] = [
        {
          killmailId: 1n,
          systemId: 30000142n,
          occurredAt: new Date(),
          victimAllianceId: null,
          victimCorpId: null,
          victimCharacterId: null,
          attackerAllianceIds: [],
          attackerCorpIds: [],
          attackerCharacterIds: [],
          iskValue: null,
          zkbUrl: 'https://zkillboard.com/kill/1/',
        },
      ];
      const source = new MockKillmailSource(events);

      // Act
      await source.pull(); // Get the first one
      const result = await source.pull(); // Should be null

      // Assert
      expect(result).toBeNull();
    });

    it('should return null immediately for empty events array', async () => {
      // Arrange
      const source = new MockKillmailSource([]);

      // Act
      const result = await source.pull();

      // Assert
      expect(result).toBeNull();
    });

    it('should handle multiple pulls correctly', async () => {
      // Arrange
      const events: KillmailReference[] = Array.from({ length: 5 }, (_, i) => ({
        killmailId: BigInt(i + 1),
        systemId: 30000142n,
        occurredAt: new Date(),
        victimAllianceId: null,
        victimCorpId: null,
        victimCharacterId: null,
        attackerAllianceIds: [],
        attackerCorpIds: [],
        attackerCharacterIds: [],
        iskValue: null,
        zkbUrl: `https://zkillboard.com/kill/${i + 1}/`,
      }));
      const source = new MockKillmailSource(events);

      // Act & Assert
      for (let i = 0; i < 5; i++) {
        const result = await source.pull();
        expect(result!.killmailId).toBe(BigInt(i + 1));
      }

      // Should be null after all events
      const final = await source.pull();
      expect(final).toBeNull();
    });
  });
});
