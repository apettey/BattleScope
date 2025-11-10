import { describe, it, expect } from 'vitest';
import { calculateEntityActivityScore } from '../src/schemas.js';

describe('calculateEntityActivityScore', () => {
  it('should return maximum score for recently active entity with high battle count', () => {
    const battleCount = 100;
    const lastSeenAt = new Date(); // Just now
    const score = calculateEntityActivityScore(battleCount, lastSeenAt);

    // Score should be close to battleCount * 100 (full decay factor)
    expect(score).toBeGreaterThan(9000); // Almost 10000
    expect(score).toBeLessThanOrEqual(10000);
  });

  it('should apply decay for entities not seen recently', () => {
    const battleCount = 100;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const score = calculateEntityActivityScore(battleCount, thirtyDaysAgo);

    // Score should be reduced due to decay (30 days / 90 days = 0.33 decay)
    // decayFactor = 1 - (30/90) = 0.67
    // score = 100 * 0.67 * 100 = 6700
    expect(score).toBeGreaterThan(6000);
    expect(score).toBeLessThan(7000);
  });

  it('should apply minimum decay factor of 0.1 for very old entities', () => {
    const battleCount = 100;
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    const score = calculateEntityActivityScore(battleCount, oneYearAgo);

    // Minimum decay factor is 0.1, so score = 100 * 0.1 * 100 = 1000
    expect(score).toBe(1000);
  });

  it('should handle zero battle count', () => {
    const battleCount = 0;
    const lastSeenAt = new Date();

    const score = calculateEntityActivityScore(battleCount, lastSeenAt);

    expect(score).toBe(0);
  });

  it('should handle low battle count', () => {
    const battleCount = 5;
    const lastSeenAt = new Date();

    const score = calculateEntityActivityScore(battleCount, lastSeenAt);

    // score = 5 * ~1.0 * 100 = ~500
    expect(score).toBeGreaterThan(400);
    expect(score).toBeLessThanOrEqual(500);
  });

  it('should scale linearly with battle count for same recency', () => {
    const lastSeenAt = new Date();

    const score10 = calculateEntityActivityScore(10, lastSeenAt);
    const score20 = calculateEntityActivityScore(20, lastSeenAt);

    // Double battle count should roughly double the score
    expect(score20).toBeGreaterThan(score10 * 1.9);
    expect(score20).toBeLessThan(score10 * 2.1);
  });

  it('should prioritize recent activity over old high activity', () => {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Recent entity with low battle count
    const scoreRecentLow = calculateEntityActivityScore(10, now);

    // Old entity with high battle count (at 90 days, decay = 0.1)
    const scoreOldHigh = calculateEntityActivityScore(50, ninetyDaysAgo);

    // Recent low activity should score higher than old high activity
    // scoreRecentLow = 10 * 1.0 * 100 = 1000
    // scoreOldHigh = 50 * 0.1 * 100 = 500
    expect(scoreRecentLow).toBeGreaterThan(scoreOldHigh);
  });

  it('should return integer scores', () => {
    const battleCount = 37;
    const lastSeenAt = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000); // 45 days ago

    const score = calculateEntityActivityScore(battleCount, lastSeenAt);

    // Should be an integer
    expect(Number.isInteger(score)).toBe(true);
  });

  it('should handle edge case: exactly 90 days old', () => {
    const battleCount = 100;
    const now = new Date();
    const exactlyNinetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const score = calculateEntityActivityScore(battleCount, exactlyNinetyDaysAgo);

    // At 90 days, decay should be exactly 0.1 (minimum)
    // score = 100 * 0.1 * 100 = 1000
    expect(score).toBe(1000);
  });
});
