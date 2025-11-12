import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Redis } from 'ioredis';
import { deriveSecurityType, SystemSecurityResolver } from '../src/system-security.js';

describe('deriveSecurityType', () => {
  describe('K-space systems with security status', () => {
    it('should return highsec for security status >= 0.5', () => {
      // Arrange
      const systemId = 30000142n; // Jita
      const securityStatus = 0.9;

      // Act
      const result = deriveSecurityType(systemId, securityStatus);

      // Assert
      expect(result).toBe('highsec');
    });

    it('should return highsec for security status exactly 0.5', () => {
      const systemId = 30000142n;
      const securityStatus = 0.5;
      expect(deriveSecurityType(systemId, securityStatus)).toBe('highsec');
    });

    it('should return lowsec for security status between 0.1 and 0.5', () => {
      // Arrange
      const systemId = 30001161n; // Amamake
      const securityStatus = 0.4;

      // Act
      const result = deriveSecurityType(systemId, securityStatus);

      // Assert
      expect(result).toBe('lowsec');
    });

    it('should return lowsec for security status exactly 0.1', () => {
      const systemId = 30001161n;
      const securityStatus = 0.1;
      expect(deriveSecurityType(systemId, securityStatus)).toBe('lowsec');
    });

    it('should return nullsec for security status < 0.1', () => {
      // Arrange
      const systemId = 30004759; // 1DQ1-A
      const securityStatus = 0.0;

      // Act
      const result = deriveSecurityType(systemId, securityStatus);

      // Assert
      expect(result).toBe('nullsec');
    });

    it('should return nullsec for negative security status', () => {
      const systemId = 30004759;
      const securityStatus = -0.5;
      expect(deriveSecurityType(systemId, securityStatus)).toBe('nullsec');
    });

    it('should return nullsec for security status exactly 0.09', () => {
      const systemId = 30004759;
      const securityStatus = 0.09;
      expect(deriveSecurityType(systemId, securityStatus)).toBe('nullsec');
    });
  });

  describe('K-space systems without security status', () => {
    it('should return nullsec as conservative default when security status is undefined', () => {
      // Arrange
      const systemId = 30000142;

      // Act
      const result = deriveSecurityType(systemId, undefined);

      // Assert
      expect(result).toBe('nullsec');
    });

    it('should return nullsec when security status is undefined (bigint)', () => {
      const systemId = 30000142n;
      expect(deriveSecurityType(systemId, undefined)).toBe('nullsec');
    });
  });

  describe('Wormhole systems', () => {
    it('should return wormhole for J-space systems regardless of security status', () => {
      // Arrange
      const systemId = 31000000n;
      const securityStatus = 0.5;

      // Act
      const result = deriveSecurityType(systemId, securityStatus);

      // Assert
      expect(result).toBe('wormhole');
    });

    it('should return wormhole for J-space without security status', () => {
      const systemId = 31000000n;
      expect(deriveSecurityType(systemId, undefined)).toBe('wormhole');
    });

    it('should return wormhole for mid-range J-space system', () => {
      const systemId = 31500000;
      expect(deriveSecurityType(systemId, 0.9)).toBe('wormhole');
    });
  });

  describe('Pochven systems', () => {
    it('should return pochven for Pochven systems regardless of security status', () => {
      // Arrange
      const systemId = 32000000n;
      const securityStatus = 0.5;

      // Act
      const result = deriveSecurityType(systemId, securityStatus);

      // Assert
      expect(result).toBe('pochven');
    });

    it('should return pochven for Pochven without security status', () => {
      const systemId = 32000000n;
      expect(deriveSecurityType(systemId, undefined)).toBe('pochven');
    });

    it('should return pochven for mid-range Pochven system', () => {
      const systemId = 32500000;
      expect(deriveSecurityType(systemId, 0.9)).toBe('pochven');
    });
  });

  describe('Edge cases', () => {
    it('should handle security status of 1.0', () => {
      expect(deriveSecurityType(30000142, 1.0)).toBe('highsec');
    });

    it('should handle security status of 0.0', () => {
      expect(deriveSecurityType(30000142, 0.0)).toBe('nullsec');
    });

    it('should handle very negative security status', () => {
      expect(deriveSecurityType(30000142, -10.0)).toBe('nullsec');
    });

    it('should handle very high security status (> 1.0)', () => {
      expect(deriveSecurityType(30000142, 2.0)).toBe('highsec');
    });

    it('should handle number system ID', () => {
      expect(deriveSecurityType(30000142, 0.9)).toBe('highsec');
    });

    it('should handle bigint system ID', () => {
      expect(deriveSecurityType(30000142n, 0.9)).toBe('highsec');
    });
  });
});

describe('SystemSecurityResolver', () => {
  let mockEsiClient: { getSystemInfo: ReturnType<typeof vi.fn> };
  let mockRedis: Partial<Redis>;
  let resolver: SystemSecurityResolver;

  beforeEach(() => {
    mockEsiClient = {
      getSystemInfo: vi.fn(),
    };

    mockRedis = {
      get: vi.fn(),
      setex: vi.fn(),
      del: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getSecurityType', () => {
    it('should return wormhole without ESI lookup for J-space systems', async () => {
      // Arrange
      resolver = new SystemSecurityResolver(mockEsiClient, mockRedis as Redis);
      const systemId = 31000000n;

      // Act
      const result = await resolver.getSecurityType(systemId);

      // Assert
      expect(result).toBe('wormhole');
      expect(mockEsiClient.getSystemInfo).not.toHaveBeenCalled();
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('should return pochven without ESI lookup for Pochven systems', async () => {
      // Arrange
      resolver = new SystemSecurityResolver(mockEsiClient, mockRedis as Redis);
      const systemId = 32000000n;

      // Act
      const result = await resolver.getSecurityType(systemId);

      // Assert
      expect(result).toBe('pochven');
      expect(mockEsiClient.getSystemInfo).not.toHaveBeenCalled();
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('should use cached security type when available', async () => {
      // Arrange
      resolver = new SystemSecurityResolver(mockEsiClient, mockRedis as Redis);
      const systemId = 30000142n;
      vi.mocked(mockRedis.get!).mockResolvedValue('highsec');

      // Act
      const result = await resolver.getSecurityType(systemId);

      // Assert
      expect(result).toBe('highsec');
      expect(mockRedis.get).toHaveBeenCalledWith('battlescope:system:security:30000142');
      expect(mockEsiClient.getSystemInfo).not.toHaveBeenCalled();
    });

    it('should fetch from ESI and cache when not in cache', async () => {
      // Arrange
      resolver = new SystemSecurityResolver(mockEsiClient, mockRedis as Redis);
      const systemId = 30000142n;
      vi.mocked(mockRedis.get!).mockResolvedValue(null);
      mockEsiClient.getSystemInfo.mockResolvedValue({ security_status: 0.9 });

      // Act
      const result = await resolver.getSecurityType(systemId);

      // Assert
      expect(result).toBe('highsec');
      expect(mockRedis.get).toHaveBeenCalledWith('battlescope:system:security:30000142');
      expect(mockEsiClient.getSystemInfo).toHaveBeenCalledWith(30000142);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'battlescope:system:security:30000142',
        86400, // 24 hours in seconds
        'highsec',
      );
    });

    it('should work without Redis', async () => {
      // Arrange
      resolver = new SystemSecurityResolver(mockEsiClient);
      const systemId = 30000142n;
      mockEsiClient.getSystemInfo.mockResolvedValue({ security_status: 0.9 });

      // Act
      const result = await resolver.getSecurityType(systemId);

      // Assert
      expect(result).toBe('highsec');
      expect(mockEsiClient.getSystemInfo).toHaveBeenCalledWith(30000142);
    });

    it('should handle Redis cache read failures gracefully', async () => {
      // Arrange
      resolver = new SystemSecurityResolver(mockEsiClient, mockRedis as Redis);
      const systemId = 30000142n;
      vi.mocked(mockRedis.get!).mockRejectedValue(new Error('Redis connection failed'));
      mockEsiClient.getSystemInfo.mockResolvedValue({ security_status: 0.9 });

      // Act
      const result = await resolver.getSecurityType(systemId);

      // Assert
      expect(result).toBe('highsec');
      expect(mockEsiClient.getSystemInfo).toHaveBeenCalled();
    });

    it('should handle Redis cache write failures gracefully', async () => {
      // Arrange
      resolver = new SystemSecurityResolver(mockEsiClient, mockRedis as Redis);
      const systemId = 30000142n;
      vi.mocked(mockRedis.get!).mockResolvedValue(null);
      vi.mocked(mockRedis.setex!).mockRejectedValue(new Error('Redis write failed'));
      mockEsiClient.getSystemInfo.mockResolvedValue({ security_status: 0.9 });

      // Act
      const result = await resolver.getSecurityType(systemId);

      // Assert
      expect(result).toBe('highsec');
      expect(mockEsiClient.getSystemInfo).toHaveBeenCalled();
    });

    it('should return nullsec as fallback when ESI call fails for k-space', async () => {
      // Arrange
      resolver = new SystemSecurityResolver(mockEsiClient, mockRedis as Redis);
      const systemId = 30000142n;
      vi.mocked(mockRedis.get!).mockResolvedValue(null);
      mockEsiClient.getSystemInfo.mockRejectedValue(new Error('ESI error'));

      // Act
      const result = await resolver.getSecurityType(systemId);

      // Assert
      expect(result).toBe('nullsec');
    });

    it('should derive different security types correctly from ESI', async () => {
      // Arrange
      resolver = new SystemSecurityResolver(mockEsiClient, mockRedis as Redis);
      vi.mocked(mockRedis.get!).mockResolvedValue(null);

      // Test lowsec
      mockEsiClient.getSystemInfo.mockResolvedValue({ security_status: 0.4 });
      expect(await resolver.getSecurityType(30001161n)).toBe('lowsec');

      // Test nullsec
      mockEsiClient.getSystemInfo.mockResolvedValue({ security_status: 0.0 });
      expect(await resolver.getSecurityType(30004759n)).toBe('nullsec');
    });
  });

  describe('getSecurityTypes (batch operation)', () => {
    it('should fetch security types for multiple systems in parallel', async () => {
      // Arrange
      resolver = new SystemSecurityResolver(mockEsiClient, mockRedis as Redis);
      const systemIds = [30000142n, 30001161n, 30004759n];
      vi.mocked(mockRedis.get!).mockResolvedValue(null);
      mockEsiClient.getSystemInfo
        .mockResolvedValueOnce({ security_status: 0.9 }) // Highsec
        .mockResolvedValueOnce({ security_status: 0.4 }) // Lowsec
        .mockResolvedValueOnce({ security_status: 0.0 }); // Nullsec

      // Act
      const results = await resolver.getSecurityTypes(systemIds);

      // Assert
      expect(results.size).toBe(3);
      expect(results.get(30000142n)).toBe('highsec');
      expect(results.get(30001161n)).toBe('lowsec');
      expect(results.get(30004759n)).toBe('nullsec');
      expect(mockEsiClient.getSystemInfo).toHaveBeenCalledTimes(3);
    });

    it('should handle empty system list', async () => {
      // Arrange
      resolver = new SystemSecurityResolver(mockEsiClient, mockRedis as Redis);

      // Act
      const results = await resolver.getSecurityTypes([]);

      // Assert
      expect(results.size).toBe(0);
      expect(mockEsiClient.getSystemInfo).not.toHaveBeenCalled();
    });

    it('should skip systems with failed lookups', async () => {
      // Arrange
      resolver = new SystemSecurityResolver(mockEsiClient, mockRedis as Redis);
      const systemIds = [30000142n, 30001161n];
      vi.mocked(mockRedis.get!).mockResolvedValue(null);
      mockEsiClient.getSystemInfo
        .mockResolvedValueOnce({ security_status: 0.9 })
        .mockRejectedValueOnce(new Error('ESI error'));

      // Act
      const results = await resolver.getSecurityTypes(systemIds);

      // Assert
      // Note: ESI failure for k-space returns nullsec as fallback, so both systems are included
      expect(results.size).toBe(2);
      expect(results.get(30000142n)).toBe('highsec');
      expect(results.get(30001161n)).toBe('nullsec'); // Fallback for failed ESI
    });

    it('should include wormhole and pochven systems without ESI calls', async () => {
      // Arrange
      resolver = new SystemSecurityResolver(mockEsiClient, mockRedis as Redis);
      const systemIds = [31000000n, 32000000n, 30000142n];
      vi.mocked(mockRedis.get!).mockResolvedValue(null);
      mockEsiClient.getSystemInfo.mockResolvedValue({ security_status: 0.9 });

      // Act
      const results = await resolver.getSecurityTypes(systemIds);

      // Assert
      expect(results.size).toBe(3);
      expect(results.get(31000000n)).toBe('wormhole');
      expect(results.get(32000000n)).toBe('pochven');
      expect(results.get(30000142n)).toBe('highsec');
      expect(mockEsiClient.getSystemInfo).toHaveBeenCalledTimes(1); // Only for k-space
    });
  });

  describe('invalidateCache', () => {
    it('should delete cache entry for system', async () => {
      // Arrange
      resolver = new SystemSecurityResolver(mockEsiClient, mockRedis as Redis);
      const systemId = 30000142n;

      // Act
      await resolver.invalidateCache(systemId);

      // Assert
      expect(mockRedis.del).toHaveBeenCalledWith('battlescope:system:security:30000142');
    });

    it('should handle cache deletion errors gracefully', async () => {
      // Arrange
      resolver = new SystemSecurityResolver(mockEsiClient, mockRedis as Redis);
      const systemId = 30000142n;
      vi.mocked(mockRedis.del!).mockRejectedValue(new Error('Redis error'));

      // Act & Assert
      await expect(resolver.invalidateCache(systemId)).resolves.not.toThrow();
    });

    it('should not fail when Redis is not available', async () => {
      // Arrange
      resolver = new SystemSecurityResolver(mockEsiClient);
      const systemId = 30000142n;

      // Act & Assert
      await expect(resolver.invalidateCache(systemId)).resolves.not.toThrow();
    });
  });
});
