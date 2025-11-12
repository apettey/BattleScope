import { describe, expect, it } from 'vitest';
import { deriveSpaceType } from '../src/space-type.js';

describe('deriveSpaceType', () => {
  describe('K-space systems (regular space)', () => {
    it('should return kspace for low system IDs', () => {
      // Arrange
      const systemId = 30000142; // Jita

      // Act
      const result = deriveSpaceType(systemId);

      // Assert
      expect(result).toBe('kspace');
    });

    it('should return kspace for highsec systems', () => {
      const systemId = 30002187; // Amarr
      expect(deriveSpaceType(systemId)).toBe('kspace');
    });

    it('should return kspace for lowsec systems', () => {
      const systemId = 30001161; // Amamake (lowsec)
      expect(deriveSpaceType(systemId)).toBe('kspace');
    });

    it('should return kspace for nullsec systems', () => {
      const systemId = 30004759; // 1DQ1-A
      expect(deriveSpaceType(systemId)).toBe('kspace');
    });

    it('should handle bigint input for kspace', () => {
      const systemId = 30000142n;
      expect(deriveSpaceType(systemId)).toBe('kspace');
    });

    it('should return kspace for system ID 1', () => {
      expect(deriveSpaceType(1)).toBe('kspace');
    });

    it('should return kspace for system IDs just below jspace range', () => {
      const systemId = 30999999;
      expect(deriveSpaceType(systemId)).toBe('kspace');
    });
  });

  describe('J-space systems (wormhole space)', () => {
    it('should return jspace for wormhole systems', () => {
      // Arrange
      const systemId = 31000000; // Start of wormhole range

      // Act
      const result = deriveSpaceType(systemId);

      // Assert
      expect(result).toBe('jspace');
    });

    it('should return jspace for mid-range wormhole system', () => {
      const systemId = 31500000;
      expect(deriveSpaceType(systemId)).toBe('jspace');
    });

    it('should return jspace for end of wormhole range', () => {
      const systemId = 31999999;
      expect(deriveSpaceType(systemId)).toBe('jspace');
    });

    it('should handle bigint input for jspace', () => {
      const systemId = 31000005n;
      expect(deriveSpaceType(systemId)).toBe('jspace');
    });
  });

  describe('Pochven systems (triglavian space)', () => {
    it('should return pochven for triglavian systems', () => {
      // Arrange
      const systemId = 32000000; // Start of Pochven range

      // Act
      const result = deriveSpaceType(systemId);

      // Assert
      expect(result).toBe('pochven');
    });

    it('should return pochven for mid-range Pochven system', () => {
      const systemId = 32500000;
      expect(deriveSpaceType(systemId)).toBe('pochven');
    });

    it('should return pochven for end of Pochven range', () => {
      const systemId = 32999999;
      expect(deriveSpaceType(systemId)).toBe('pochven');
    });

    it('should handle bigint input for pochven', () => {
      const systemId = 32000001n;
      expect(deriveSpaceType(systemId)).toBe('pochven');
    });
  });

  describe('Edge cases', () => {
    it('should return kspace for system IDs above Pochven range', () => {
      const systemId = 33000000;
      expect(deriveSpaceType(systemId)).toBe('kspace');
    });

    it('should handle zero system ID', () => {
      expect(deriveSpaceType(0)).toBe('kspace');
    });

    it('should handle negative system ID (returns kspace)', () => {
      expect(deriveSpaceType(-1)).toBe('kspace');
    });

    it('should handle very large system ID', () => {
      const systemId = 99999999;
      expect(deriveSpaceType(systemId)).toBe('kspace');
    });

    it('should handle very large bigint', () => {
      const systemId = 99999999999n;
      expect(deriveSpaceType(systemId)).toBe('kspace');
    });
  });

  describe('Boundary testing', () => {
    it('should return jspace at exact lower boundary (31000000)', () => {
      expect(deriveSpaceType(31000000)).toBe('jspace');
    });

    it('should return kspace just before jspace boundary (30999999)', () => {
      expect(deriveSpaceType(30999999)).toBe('kspace');
    });

    it('should return pochven at exact lower boundary (32000000)', () => {
      expect(deriveSpaceType(32000000)).toBe('pochven');
    });

    it('should return jspace just before pochven boundary (31999999)', () => {
      expect(deriveSpaceType(31999999)).toBe('jspace');
    });

    it('should return kspace at exact upper boundary of pochven (33000000)', () => {
      expect(deriveSpaceType(33000000)).toBe('kspace');
    });

    it('should return pochven just before upper boundary (32999999)', () => {
      expect(deriveSpaceType(32999999)).toBe('pochven');
    });
  });
});
