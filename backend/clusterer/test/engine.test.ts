import { describe, expect, it } from 'vitest';
import type { KillmailEventRecord } from '@battlescope/database';
import { ClusteringEngine } from '@battlescope/battle-reports';

const createKillmail = (overrides: Partial<KillmailEventRecord>): KillmailEventRecord => ({
  killmailId: 1n,
  systemId: 30000142n,
  occurredAt: new Date('2024-05-01T12:00:00Z'),
  victimAllianceId: 99001234n,
  victimCorpId: 12345n,
  victimCharacterId: 555_666_777n,
  attackerAllianceIds: [99004567n],
  attackerCorpIds: [98765n],
  attackerCharacterIds: [222_333_444n],
  iskValue: 100_000_000n,
  zkbUrl: 'https://zkillboard.com/kill/1/',
  fetchedAt: new Date('2024-05-01T12:05:00Z'),
  processedAt: null,
  battleId: null,
  ...overrides,
});

describe('ClusteringEngine', () => {
  describe('basic clustering rules', () => {
    const engine = new ClusteringEngine({
      windowMinutes: 30,
      gapMaxMinutes: 15,
      minKills: 2,
    });

    it('clusters killmails in the same system within the time window', () => {
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:05:00Z'),
        }),
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-05-01T12:10:00Z'),
        }),
      ];

      const result = engine.cluster(killmails);

      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(3);
      expect(result.ignoredKillmailIds).toHaveLength(0);
    });

    it('does NOT cluster killmails in different systems', () => {
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          systemId: 30000142n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
        }),
        createKillmail({
          killmailId: 2n,
          systemId: 30000143n,
          occurredAt: new Date('2024-05-01T12:05:00Z'),
        }),
      ];

      const result = engine.cluster(killmails);

      expect(result.battles).toHaveLength(0);
      expect(result.ignoredKillmailIds).toHaveLength(2);
    });

    it('creates separate battles when time gap exceeds maximum AND no shared alliances', () => {
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
          victimAllianceId: 99001111n,
          attackerAllianceIds: [99002222n],
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:05:00Z'),
          victimAllianceId: 99002222n,
          attackerAllianceIds: [99001111n],
        }),
        // 20 minute gap - exceeds 15 minute max gap
        // Different alliances - no correlation
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-05-01T12:25:00Z'),
          victimAllianceId: 99003333n,
          attackerAllianceIds: [99004444n],
        }),
        createKillmail({
          killmailId: 4n,
          occurredAt: new Date('2024-05-01T12:30:00Z'),
          victimAllianceId: 99004444n,
          attackerAllianceIds: [99003333n],
        }),
      ];

      const result = engine.cluster(killmails);

      expect(result.battles).toHaveLength(2);
      expect(result.battles[0].killmailIds).toHaveLength(2);
      expect(result.battles[1].killmailIds).toHaveLength(2);
    });

    it('ignores single killmails below minimum threshold', () => {
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
        }),
      ];

      const result = engine.cluster(killmails);

      expect(result.battles).toHaveLength(0);
      expect(result.ignoredKillmailIds).toHaveLength(1);
      expect(result.ignoredKillmailIds[0]).toBe(1n);
    });
  });

  describe('alliance correlation', () => {
    const engine = new ClusteringEngine({
      windowMinutes: 30,
      gapMaxMinutes: 15,
      minKills: 2,
    });

    it('clusters killmails with shared alliances even with time gaps', () => {
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
          victimAllianceId: 99001111n,
          attackerAllianceIds: [99002222n],
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:20:00Z'), // 20 minute gap
          victimAllianceId: 99003333n,
          attackerAllianceIds: [99001111n], // Shared alliance with first kill
        }),
      ];

      const result = engine.cluster(killmails);

      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(2);
    });

    it('does NOT cluster killmails beyond the time window even with shared alliances', () => {
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
          victimAllianceId: 99001111n,
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:35:00Z'), // 35 minutes - exceeds 30 minute window
          attackerAllianceIds: [99001111n], // Shared alliance
        }),
      ];

      const result = engine.cluster(killmails);

      expect(result.battles).toHaveLength(0);
      expect(result.ignoredKillmailIds).toHaveLength(2);
    });
  });

  describe('realistic battle scenarios', () => {
    const engine = new ClusteringEngine({
      windowMinutes: 30,
      gapMaxMinutes: 15,
      minKills: 2,
    });

    it('clusters a large 10-kill battle correctly', () => {
      const baseTime = new Date('2024-05-01T12:00:00Z').getTime();
      const killmails: KillmailEventRecord[] = [];

      // Create 10 killmails over 25 minutes in the same system
      for (let i = 0; i < 10; i++) {
        killmails.push(
          createKillmail({
            killmailId: BigInt(i + 1),
            occurredAt: new Date(baseTime + i * 2.5 * 60 * 1000), // 2.5 minutes apart
            systemId: 30000142n,
            victimAllianceId: i % 2 === 0 ? 99001111n : 99002222n,
            attackerAllianceIds: i % 2 === 0 ? [99002222n] : [99001111n],
            zkbUrl: `https://zkillboard.com/kill/${i + 1}/`,
          }),
        );
      }

      const result = engine.cluster(killmails);

      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(10);
      expect(result.ignoredKillmailIds).toHaveLength(0);
    });

    it('handles multiple simultaneous battles in different systems', () => {
      const baseTime = new Date('2024-05-01T12:00:00Z').getTime();
      const killmails: KillmailEventRecord[] = [];

      // Battle 1 in system A (5 kills)
      for (let i = 0; i < 5; i++) {
        killmails.push(
          createKillmail({
            killmailId: BigInt(i + 1),
            occurredAt: new Date(baseTime + i * 3 * 60 * 1000),
            systemId: 30000142n,
            victimAllianceId: 99001111n,
            attackerAllianceIds: [99002222n],
            zkbUrl: `https://zkillboard.com/kill/${i + 1}/`,
          }),
        );
      }

      // Battle 2 in system B (3 kills)
      for (let i = 0; i < 3; i++) {
        killmails.push(
          createKillmail({
            killmailId: BigInt(i + 101),
            occurredAt: new Date(baseTime + i * 4 * 60 * 1000),
            systemId: 30000143n,
            victimAllianceId: 99003333n,
            attackerAllianceIds: [99004444n],
            zkbUrl: `https://zkillboard.com/kill/${i + 101}/`,
          }),
        );
      }

      const result = engine.cluster(killmails);

      expect(result.battles).toHaveLength(2);
      expect(result.battles[0].killmailIds).toHaveLength(5);
      expect(result.battles[1].killmailIds).toHaveLength(3);
    });

    it('handles the incremental arrival scenario that was causing the bug', () => {
      // Simulate what happens when killmails arrive in batches
      const engine = new ClusteringEngine({
        windowMinutes: 30,
        gapMaxMinutes: 15,
        minKills: 2,
      });

      // First batch arrives
      const batch1: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
          victimAllianceId: 99001111n,
          attackerAllianceIds: [99002222n],
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:03:00Z'),
          victimAllianceId: 99002222n,
          attackerAllianceIds: [99001111n],
        }),
      ];

      // More kills from the same battle arrive later
      const batch2: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-05-01T12:06:00Z'),
          victimAllianceId: 99001111n,
          attackerAllianceIds: [99002222n],
        }),
        createKillmail({
          killmailId: 4n,
          occurredAt: new Date('2024-05-01T12:09:00Z'),
          victimAllianceId: 99002222n,
          attackerAllianceIds: [99001111n],
        }),
      ];

      // With the delay, all killmails should be processed together
      const allKillmails = [...batch1, ...batch2];
      const result = engine.cluster(allKillmails);

      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(4);
      expect(result.ignoredKillmailIds).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    const engine = new ClusteringEngine({
      windowMinutes: 30,
      gapMaxMinutes: 15,
      minKills: 2,
    });

    it('handles empty input', () => {
      const result = engine.cluster([]);
      expect(result.battles).toHaveLength(0);
      expect(result.ignoredKillmailIds).toHaveLength(0);
    });

    it('handles killmails with no alliance IDs', () => {
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
          victimAllianceId: null,
          attackerAllianceIds: [],
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:05:00Z'),
          victimAllianceId: null,
          attackerAllianceIds: [],
        }),
      ];

      const result = engine.cluster(killmails);

      // Should still cluster based on time proximity
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(2);
    });

    it('handles killmails exactly at the time window boundary', () => {
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:10:00Z'),
        }),
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-05-01T12:30:00Z'), // Exactly 30 minutes from first
        }),
      ];

      const result = engine.cluster(killmails);

      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(3);
    });
  });

  describe('alliance chain scenarios', () => {
    const engine = new ClusteringEngine({
      windowMinutes: 30,
      gapMaxMinutes: 15,
      minKills: 2,
    });

    it('clusters through alliance chains (A-B, B-C creates A-B-C cluster)', () => {
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
          victimAllianceId: 99001111n, // A
          attackerAllianceIds: [99002222n], // B
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:20:00Z'), // 20 min gap (exceeds 15)
          victimAllianceId: 99002222n, // B
          attackerAllianceIds: [99003333n], // C
        }),
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-05-01T12:25:00Z'),
          victimAllianceId: 99003333n, // C
          attackerAllianceIds: [99001111n], // A
        }),
      ];

      const result = engine.cluster(killmails);

      // All three should cluster because B links the first and second kills
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(3);
    });

    it('handles multi-alliance attackers (multiple attackers on single victim)', () => {
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
          victimAllianceId: 99001111n,
          attackerAllianceIds: [99002222n, 99003333n, 99004444n], // 3 attacking alliances
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:20:00Z'), // 20 min gap
          victimAllianceId: 99005555n,
          attackerAllianceIds: [99003333n], // Only one of the previous attackers
        }),
      ];

      const result = engine.cluster(killmails);

      // Should cluster because 99003333n is shared
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(2);
    });

    it('separates unrelated kills with large time gap and no alliance overlap', () => {
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
          victimAllianceId: 99001111n,
          attackerAllianceIds: [99002222n],
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:05:00Z'),
          victimAllianceId: 99002222n,
          attackerAllianceIds: [99001111n],
        }),
        // 20 minute gap with no shared alliances
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-05-01T12:25:00Z'),
          victimAllianceId: 99003333n,
          attackerAllianceIds: [99004444n],
        }),
        createKillmail({
          killmailId: 4n,
          occurredAt: new Date('2024-05-01T12:28:00Z'),
          victimAllianceId: 99004444n,
          attackerAllianceIds: [99003333n],
        }),
      ];

      const result = engine.cluster(killmails);

      expect(result.battles).toHaveLength(2);
      expect(result.battles[0].killmailIds).toHaveLength(2);
      expect(result.battles[1].killmailIds).toHaveLength(2);
    });
  });

  describe('complex multi-faction battles', () => {
    const engine = new ClusteringEngine({
      windowMinutes: 30,
      gapMaxMinutes: 15,
      minKills: 3,
    });

    it('clusters 3-way fight with rotating attackers/victims', () => {
      const killmails: KillmailEventRecord[] = [
        // Alliance A attacks Alliance B
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
          victimAllianceId: 99002222n, // B
          attackerAllianceIds: [99001111n], // A
        }),
        // Alliance B attacks Alliance C (5 min later)
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:05:00Z'),
          victimAllianceId: 99003333n, // C
          attackerAllianceIds: [99002222n], // B
        }),
        // Alliance C attacks Alliance A (10 min later)
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-05-01T12:15:00Z'),
          victimAllianceId: 99001111n, // A
          attackerAllianceIds: [99003333n], // C
        }),
        // Alliance A and C both attack B (20 min later - exceeds gap)
        createKillmail({
          killmailId: 4n,
          occurredAt: new Date('2024-05-01T12:25:00Z'),
          victimAllianceId: 99002222n, // B
          attackerAllianceIds: [99001111n, 99003333n], // A and C
        }),
      ];

      const result = engine.cluster(killmails);

      // All should cluster together via alliance correlation
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(4);
    });

    it('handles free-for-all with 5 alliances', () => {
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
          victimAllianceId: 99001111n,
          attackerAllianceIds: [99002222n],
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:03:00Z'),
          victimAllianceId: 99003333n,
          attackerAllianceIds: [99002222n],
        }),
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-05-01T12:06:00Z'),
          victimAllianceId: 99002222n,
          attackerAllianceIds: [99004444n],
        }),
        createKillmail({
          killmailId: 4n,
          occurredAt: new Date('2024-05-01T12:09:00Z'),
          victimAllianceId: 99004444n,
          attackerAllianceIds: [99005555n],
        }),
        createKillmail({
          killmailId: 5n,
          occurredAt: new Date('2024-05-01T12:12:00Z'),
          victimAllianceId: 99005555n,
          attackerAllianceIds: [99001111n],
        }),
      ];

      const result = engine.cluster(killmails);

      // All should cluster together
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(5);
    });
  });

  describe('time window boundary tests', () => {
    const engine = new ClusteringEngine({
      windowMinutes: 30,
      gapMaxMinutes: 15,
      minKills: 2,
    });

    it('excludes killmails just beyond window even with alliance correlation', () => {
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
          victimAllianceId: 99001111n,
          attackerAllianceIds: [99002222n],
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:30:01Z'), // 30 min 1 sec - just outside window
          victimAllianceId: 99002222n,
          attackerAllianceIds: [99001111n], // Shared alliance
        }),
      ];

      const result = engine.cluster(killmails);

      // Should NOT cluster - window exceeded
      expect(result.battles).toHaveLength(0);
      expect(result.ignoredKillmailIds).toHaveLength(2);
    });

    it('includes killmail at exactly window boundary with alliance correlation', () => {
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
          victimAllianceId: 99001111n,
          attackerAllianceIds: [99002222n],
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:30:00Z'), // Exactly 30 minutes
          victimAllianceId: 99002222n,
          attackerAllianceIds: [99001111n],
        }),
      ];

      const result = engine.cluster(killmails);

      // Should cluster - exactly at boundary
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(2);
    });

    it('separates kills when gap exceeded and no alliance correlation', () => {
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
          victimAllianceId: 99001111n,
          attackerAllianceIds: [99002222n],
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:04:00Z'),
          victimAllianceId: 99002222n,
          attackerAllianceIds: [99001111n],
        }),
        // 16 minutes from last kill, no shared alliances, but within 30 min window
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-05-01T12:20:00Z'),
          victimAllianceId: 99003333n,
          attackerAllianceIds: [99004444n],
        }),
        createKillmail({
          killmailId: 4n,
          occurredAt: new Date('2024-05-01T12:23:00Z'),
          victimAllianceId: 99004444n,
          attackerAllianceIds: [99003333n],
        }),
      ];

      const result = engine.cluster(killmails);

      // Should create two battles - gap exceeded without correlation
      expect(result.battles).toHaveLength(2);
      expect(result.battles[0].killmailIds).toHaveLength(2);
      expect(result.battles[1].killmailIds).toHaveLength(2);
    });
  });

  describe('sparse killmail patterns', () => {
    const engine = new ClusteringEngine({
      windowMinutes: 30,
      gapMaxMinutes: 15,
      minKills: 3,
    });

    it('handles spread-out kills with consistent alliance involvement', () => {
      // Simulates a drawn-out battle with lulls in fighting
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
          victimAllianceId: 99001111n,
          attackerAllianceIds: [99002222n],
        }),
        // 14 minute gap - just within limit
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:14:00Z'),
          victimAllianceId: 99002222n,
          attackerAllianceIds: [99001111n],
        }),
        // 14 minute gap again
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-05-01T12:28:00Z'),
          victimAllianceId: 99001111n,
          attackerAllianceIds: [99002222n],
        }),
      ];

      const result = engine.cluster(killmails);

      // Should cluster - each kill within gap of previous
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(3);
    });

    it('handles rapid burst then long gap with alliance link', () => {
      const killmails: KillmailEventRecord[] = [
        // Rapid burst
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
          victimAllianceId: 99001111n,
          attackerAllianceIds: [99002222n],
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:01:00Z'),
          victimAllianceId: 99001111n,
          attackerAllianceIds: [99002222n],
        }),
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-05-01T12:02:00Z'),
          victimAllianceId: 99001111n,
          attackerAllianceIds: [99002222n],
        }),
        // 20 minute gap but same alliances
        createKillmail({
          killmailId: 4n,
          occurredAt: new Date('2024-05-01T12:22:00Z'),
          victimAllianceId: 99002222n,
          attackerAllianceIds: [99001111n],
        }),
      ];

      const result = engine.cluster(killmails);

      // Should cluster via alliance correlation
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(4);
    });
  });

  describe('out-of-order killmail arrival', () => {
    const engine = new ClusteringEngine({
      windowMinutes: 30,
      gapMaxMinutes: 15,
      minKills: 2,
    });

    it('handles killmails arriving out of chronological order', () => {
      // Killmails might arrive out of order from zKillboard
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-05-01T12:10:00Z'),
        }),
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-05-01T12:00:00Z'),
        }),
        createKillmail({
          killmailId: 4n,
          occurredAt: new Date('2024-05-01T12:15:00Z'),
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-05-01T12:05:00Z'),
        }),
      ];

      const result = engine.cluster(killmails);

      // Should still cluster correctly after sorting
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(4);
      // Should be in chronological order in the battle
      expect(result.battles[0].killmailIds[0]).toBe(1n);
      expect(result.battles[0].killmailIds[1]).toBe(2n);
      expect(result.battles[0].killmailIds[2]).toBe(3n);
      expect(result.battles[0].killmailIds[3]).toBe(4n);
    });
  });
});
