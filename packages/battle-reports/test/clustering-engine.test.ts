import { describe, expect, it, beforeEach } from 'vitest';
import {
  ClusteringEngine,
  type ClusteringParameters,
} from '../src/clustering/engine.js';
import type { KillmailEventRecord } from '@battlescope/database';

describe('ClusteringEngine', () => {
  let engine: ClusteringEngine;
  const defaultParams: ClusteringParameters = {
    windowMinutes: 120, // 2 hours
    gapMaxMinutes: 10, // 10 minutes
    minKills: 3, // Minimum 3 kills per battle
  };

  beforeEach(() => {
    engine = new ClusteringEngine(defaultParams);
  });

  // Helper to create killmail events
  const createKillmail = (overrides: Partial<KillmailEventRecord> = {}): KillmailEventRecord => ({
    killmailId: BigInt(Math.floor(Math.random() * 1000000)),
    systemId: 30000142n, // Jita by default
    occurredAt: new Date('2024-01-01T12:00:00Z'),
    zkbUrl: 'https://zkillboard.com/kill/123456/',
    victimCharacterId: 12345n,
    victimCorpId: 67890n,
    victimAllianceId: 11111n,
    attackerCharacterIds: [22222n, 33333n],
    attackerCorpIds: [44444n, 55555n],
    attackerAllianceIds: [66666n, 77777n],
    iskValue: 1000000000n,
    ...overrides,
  });

  describe('constructor', () => {
    it('should create engine with valid parameters', () => {
      expect(engine).toBeInstanceOf(ClusteringEngine);
    });

    it('should accept different clustering parameters', () => {
      const customParams: ClusteringParameters = {
        windowMinutes: 60,
        gapMaxMinutes: 5,
        minKills: 5,
      };
      const customEngine = new ClusteringEngine(customParams);
      expect(customEngine).toBeInstanceOf(ClusteringEngine);
    });
  });

  describe('cluster - empty input', () => {
    it('should return empty result for empty killmail array', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(0);
      expect(result.ignoredKillmailIds).toHaveLength(0);
    });
  });

  describe('cluster - single system, single cluster', () => {
    it('should create battle from killmails within time window', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        createKillmail({ killmailId: 1n, occurredAt: new Date('2024-01-01T12:00:00Z') }),
        createKillmail({ killmailId: 2n, occurredAt: new Date('2024-01-01T12:05:00Z') }),
        createKillmail({ killmailId: 3n, occurredAt: new Date('2024-01-01T12:08:00Z') }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(3);
      expect(result.ignoredKillmailIds).toHaveLength(0);
    });

    it('should set correct battle start and end times', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        createKillmail({ killmailId: 1n, occurredAt: new Date('2024-01-01T12:00:00Z') }),
        createKillmail({ killmailId: 2n, occurredAt: new Date('2024-01-01T12:30:00Z') }),
        createKillmail({ killmailId: 3n, occurredAt: new Date('2024-01-01T12:45:00Z') }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].battle.startTime).toEqual(new Date('2024-01-01T12:00:00Z'));
      expect(result.battles[0].battle.endTime).toEqual(new Date('2024-01-01T12:45:00Z'));
    });

    it('should calculate total ISK destroyed correctly', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        createKillmail({ killmailId: 1n, iskValue: 1000000n }),
        createKillmail({ killmailId: 2n, iskValue: 2000000n }),
        createKillmail({ killmailId: 3n, iskValue: 3000000n }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].battle.totalIskDestroyed).toBe(6000000n);
    });

    it('should set correct kill count', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        createKillmail({ killmailId: 1n }),
        createKillmail({ killmailId: 2n }),
        createKillmail({ killmailId: 3n }),
        createKillmail({ killmailId: 4n }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].battle.totalKills).toBe(4n);
    });

    it('should generate valid battle UUID', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        createKillmail({ killmailId: 1n }),
        createKillmail({ killmailId: 2n }),
        createKillmail({ killmailId: 3n }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].battle.id).toBeTruthy();
      expect(typeof result.battles[0].battle.id).toBe('string');
      // UUID format check
      expect(result.battles[0].battle.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe('cluster - minimum kills threshold', () => {
    it('should ignore cluster with fewer than minKills', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        createKillmail({ killmailId: 1n, occurredAt: new Date('2024-01-01T12:00:00Z') }),
        createKillmail({ killmailId: 2n, occurredAt: new Date('2024-01-01T12:05:00Z') }),
        // Only 2 kills, below minKills threshold of 3
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(0);
      expect(result.ignoredKillmailIds).toHaveLength(2);
      expect(result.ignoredKillmailIds).toContain(1n);
      expect(result.ignoredKillmailIds).toContain(2n);
    });

    it('should create battle when exactly at minKills threshold', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        createKillmail({ killmailId: 1n }),
        createKillmail({ killmailId: 2n }),
        createKillmail({ killmailId: 3n }), // Exactly 3 (minKills)
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      expect(result.ignoredKillmailIds).toHaveLength(0);
    });

    it('should handle different minKills values', () => {
      // Arrange
      const strictEngine = new ClusteringEngine({
        ...defaultParams,
        minKills: 5,
      });
      const killmails: KillmailEventRecord[] = [
        createKillmail({ killmailId: 1n }),
        createKillmail({ killmailId: 2n }),
        createKillmail({ killmailId: 3n }),
        createKillmail({ killmailId: 4n }),
        // Only 4 kills, below minKills=5
      ];

      // Act
      const result = strictEngine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(0);
      expect(result.ignoredKillmailIds).toHaveLength(4);
    });
  });

  describe('cluster - gap-based clustering', () => {
    it('should split into multiple clusters when gap exceeds gapMaxMinutes', () => {
      // Arrange - use different alliances to prevent correlation
      const killmails: KillmailEventRecord[] = [
        // First cluster
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-01-01T12:00:00Z'),
          victimAllianceId: 111n,
          attackerAllianceIds: [222n],
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-01-01T12:05:00Z'),
          victimAllianceId: 111n,
          attackerAllianceIds: [222n],
        }),
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-01-01T12:08:00Z'),
          victimAllianceId: 111n,
          attackerAllianceIds: [222n],
        }),
        // Gap of 12 minutes (exceeds gapMaxMinutes=10), different alliances
        // Second cluster
        createKillmail({
          killmailId: 4n,
          occurredAt: new Date('2024-01-01T12:20:00Z'),
          victimAllianceId: 333n,
          attackerAllianceIds: [444n],
        }),
        createKillmail({
          killmailId: 5n,
          occurredAt: new Date('2024-01-01T12:25:00Z'),
          victimAllianceId: 333n,
          attackerAllianceIds: [444n],
        }),
        createKillmail({
          killmailId: 6n,
          occurredAt: new Date('2024-01-01T12:28:00Z'),
          victimAllianceId: 333n,
          attackerAllianceIds: [444n],
        }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(2);
      expect(result.battles[0].killmailIds).toHaveLength(3);
      expect(result.battles[1].killmailIds).toHaveLength(3);
    });

    it('should continue cluster when gap is exactly at gapMaxMinutes', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        createKillmail({ killmailId: 1n, occurredAt: new Date('2024-01-01T12:00:00Z') }),
        // Gap of exactly 10 minutes
        createKillmail({ killmailId: 2n, occurredAt: new Date('2024-01-01T12:10:00Z') }),
        createKillmail({ killmailId: 3n, occurredAt: new Date('2024-01-01T12:15:00Z') }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(3);
    });

    it('should split cluster when gap is one second over gapMaxMinutes', () => {
      // Arrange - use different alliances to prevent correlation
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-01-01T12:00:00Z'),
          victimAllianceId: 111n,
          attackerAllianceIds: [222n],
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-01-01T12:05:00Z'),
          victimAllianceId: 111n,
          attackerAllianceIds: [222n],
        }),
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-01-01T12:08:00Z'),
          victimAllianceId: 111n,
          attackerAllianceIds: [222n],
        }),
        // Gap of 10 minutes and 1 second, different alliances
        createKillmail({
          killmailId: 4n,
          occurredAt: new Date('2024-01-01T12:18:01Z'),
          victimAllianceId: 333n,
          attackerAllianceIds: [444n],
        }),
        createKillmail({
          killmailId: 5n,
          occurredAt: new Date('2024-01-01T12:20:00Z'),
          victimAllianceId: 333n,
          attackerAllianceIds: [444n],
        }),
        createKillmail({
          killmailId: 6n,
          occurredAt: new Date('2024-01-01T12:22:00Z'),
          victimAllianceId: 333n,
          attackerAllianceIds: [444n],
        }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(2);
    });
  });

  describe('cluster - alliance correlation', () => {
    it('should continue cluster across gap when alliances are correlated', () => {
      // Arrange
      const sharedAllianceId = 99999n;
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-01-01T12:00:00Z'),
          victimAllianceId: sharedAllianceId,
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-01-01T12:05:00Z'),
          attackerAllianceIds: [sharedAllianceId],
        }),
        // Gap of 15 minutes (exceeds gapMaxMinutes), but alliance correlation should bridge it
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-01-01T12:20:00Z'),
          victimAllianceId: sharedAllianceId,
        }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(3);
    });

    it('should not correlate alliances across different systems', () => {
      // Arrange
      const sharedAllianceId = 99999n;
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          systemId: 30000142n, // System 1
          victimAllianceId: sharedAllianceId,
        }),
        createKillmail({
          killmailId: 2n,
          systemId: 30000142n, // System 1
          attackerAllianceIds: [sharedAllianceId],
        }),
        createKillmail({
          killmailId: 3n,
          systemId: 30000142n, // System 1
          victimAllianceId: sharedAllianceId,
        }),
        createKillmail({
          killmailId: 4n,
          systemId: 30001161n, // System 2 (different system)
          victimAllianceId: sharedAllianceId,
        }),
        createKillmail({
          killmailId: 5n,
          systemId: 30001161n, // System 2
          attackerAllianceIds: [sharedAllianceId],
        }),
        createKillmail({
          killmailId: 6n,
          systemId: 30001161n, // System 2
          victimAllianceId: sharedAllianceId,
        }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(2); // One battle per system
      expect(result.battles[0].battle.systemId).toBe(30000142n);
      expect(result.battles[1].battle.systemId).toBe(30001161n);
    });

    it('should track multiple alliances in cluster', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          victimAllianceId: 11111n,
          attackerAllianceIds: [22222n],
        }),
        createKillmail({
          killmailId: 2n,
          victimAllianceId: 22222n,
          attackerAllianceIds: [33333n],
        }),
        createKillmail({
          killmailId: 3n,
          victimAllianceId: 33333n,
          attackerAllianceIds: [11111n],
        }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toHaveLength(3);
    });
  });

  describe('cluster - window-based clustering', () => {
    it('should split cluster when total window exceeds windowMinutes', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        // First cluster
        createKillmail({ killmailId: 1n, occurredAt: new Date('2024-01-01T12:00:00Z') }),
        createKillmail({ killmailId: 2n, occurredAt: new Date('2024-01-01T12:05:00Z') }),
        createKillmail({ killmailId: 3n, occurredAt: new Date('2024-01-01T13:00:00Z') }), // 60 min from start
        createKillmail({ killmailId: 4n, occurredAt: new Date('2024-01-01T14:00:00Z') }), // 120 min from start
        // This one exceeds 120 min window
        createKillmail({ killmailId: 5n, occurredAt: new Date('2024-01-01T14:01:00Z') }), // 121 min from start
        createKillmail({ killmailId: 6n, occurredAt: new Date('2024-01-01T14:05:00Z') }),
        createKillmail({ killmailId: 7n, occurredAt: new Date('2024-01-01T14:10:00Z') }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(2);
      expect(result.battles[0].killmailIds).toHaveLength(4); // First 4
      expect(result.battles[1].killmailIds).toHaveLength(3); // Last 3
    });

    it('should respect window constraint even with alliance correlation', () => {
      // Arrange
      const sharedAlliance = 99999n;
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-01-01T12:00:00Z'),
          victimAllianceId: sharedAlliance,
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-01-01T13:00:00Z'),
          victimAllianceId: sharedAlliance,
        }),
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-01-01T14:00:00Z'),
          victimAllianceId: sharedAlliance,
        }),
        // 121 minutes from first kill (exceeds 120 minute window)
        createKillmail({
          killmailId: 4n,
          occurredAt: new Date('2024-01-01T14:01:00Z'),
          victimAllianceId: sharedAlliance,
        }),
        createKillmail({
          killmailId: 5n,
          occurredAt: new Date('2024-01-01T14:05:00Z'),
          victimAllianceId: sharedAlliance,
        }),
        createKillmail({
          killmailId: 6n,
          occurredAt: new Date('2024-01-01T14:10:00Z'),
          victimAllianceId: sharedAlliance,
        }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(2);
      expect(result.battles[0].killmailIds).toHaveLength(3); // First 3
      expect(result.battles[1].killmailIds).toHaveLength(3); // Last 3
    });
  });

  describe('cluster - multiple systems', () => {
    it('should create separate battles for different systems', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        // System 1
        createKillmail({ killmailId: 1n, systemId: 30000142n }),
        createKillmail({ killmailId: 2n, systemId: 30000142n }),
        createKillmail({ killmailId: 3n, systemId: 30000142n }),
        // System 2
        createKillmail({ killmailId: 4n, systemId: 30001161n }),
        createKillmail({ killmailId: 5n, systemId: 30001161n }),
        createKillmail({ killmailId: 6n, systemId: 30001161n }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(2);
      expect(result.battles[0].battle.systemId).toBe(30000142n);
      expect(result.battles[1].battle.systemId).toBe(30001161n);
    });

    it('should handle many systems simultaneously', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [];
      const systemIds = [30000142n, 30001161n, 30002187n, 30004759n, 31000005n];

      for (const systemId of systemIds) {
        for (let i = 0; i < 3; i++) {
          killmails.push(
            createKillmail({
              killmailId: BigInt(killmails.length + 1),
              systemId,
              occurredAt: new Date(`2024-01-01T12:0${i}:00Z`),
            }),
          );
        }
      }

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(5);
      for (const battlePlan of result.battles) {
        expect(battlePlan.killmailIds).toHaveLength(3);
      }
    });
  });

  describe('cluster - participants extraction', () => {
    it('should extract participants from killmails', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          victimCharacterId: 111n,
          victimCorpId: 222n,
          victimAllianceId: 333n,
          attackerCharacterIds: [444n, 555n],
          attackerCorpIds: [666n, 777n],
          attackerAllianceIds: [888n, 999n],
        }),
        createKillmail({
          killmailId: 2n,
          victimCharacterId: 222n,
          attackerCharacterIds: [333n],
        }),
        createKillmail({
          killmailId: 3n,
          victimCharacterId: 333n,
          attackerCharacterIds: [111n],
        }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].participantInserts.length).toBeGreaterThan(0);
    });

    it('should deduplicate participants by character', () => {
      // Arrange
      const repeatCharacter = 999n;
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          victimCharacterId: repeatCharacter,
        }),
        createKillmail({
          killmailId: 2n,
          attackerCharacterIds: [repeatCharacter],
        }),
        createKillmail({
          killmailId: 3n,
          attackerCharacterIds: [repeatCharacter, 111n],
        }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      const participants = result.battles[0].participantInserts;

      // Count occurrences of repeatCharacter
      const repeatCount = participants.filter((p) => p.characterId === repeatCharacter).length;
      // Should appear at most 2 times: once as victim, once as attacker
      expect(repeatCount).toBeLessThanOrEqual(2);
    });

    it('should set correct battleId for all participants', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        createKillmail({ killmailId: 1n }),
        createKillmail({ killmailId: 2n }),
        createKillmail({ killmailId: 3n }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      const battleId = result.battles[0].battle.id;
      const participants = result.battles[0].participantInserts;

      for (const participant of participants) {
        expect(participant.battleId).toBe(battleId);
      }
    });
  });

  describe('cluster - killmail inserts', () => {
    it('should create killmail inserts with correct battle ID', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        createKillmail({ killmailId: 1n }),
        createKillmail({ killmailId: 2n }),
        createKillmail({ killmailId: 3n }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      const battleId = result.battles[0].battle.id;
      const inserts = result.battles[0].killmailInserts;

      expect(inserts).toHaveLength(3);
      for (const insert of inserts) {
        expect(insert.battleId).toBe(battleId);
        expect(insert.killmailId).toBeTruthy();
        expect(insert.zkbUrl).toBeTruthy();
      }
    });

    it('should preserve killmail data in inserts', () => {
      // Arrange
      const testKillmail = createKillmail({
        killmailId: 12345n,
        zkbUrl: 'https://zkillboard.com/kill/12345/',
        occurredAt: new Date('2024-01-01T12:00:00Z'),
        victimAllianceId: 111n,
        attackerAllianceIds: [222n, 333n],
        iskValue: 5000000000n,
      });

      // Act
      const result = engine.cluster([
        testKillmail,
        createKillmail({ killmailId: 2n }),
        createKillmail({ killmailId: 3n }),
      ]);

      // Assert
      expect(result.battles).toHaveLength(1);
      const insert = result.battles[0].killmailInserts.find((k) => k.killmailId === 12345n);

      expect(insert).toBeTruthy();
      expect(insert!.zkbUrl).toBe('https://zkillboard.com/kill/12345/');
      expect(insert!.occurredAt).toEqual(new Date('2024-01-01T12:00:00Z'));
      expect(insert!.victimAllianceId).toBe(111n);
      expect(insert!.iskValue).toBe(5000000000n);
    });
  });

  describe('cluster - complex scenarios', () => {
    it('should handle interleaved killmails from multiple systems', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          systemId: 30000142n,
          occurredAt: new Date('2024-01-01T12:00:00Z'),
        }),
        createKillmail({
          killmailId: 2n,
          systemId: 30001161n,
          occurredAt: new Date('2024-01-01T12:01:00Z'),
        }),
        createKillmail({
          killmailId: 3n,
          systemId: 30000142n,
          occurredAt: new Date('2024-01-01T12:02:00Z'),
        }),
        createKillmail({
          killmailId: 4n,
          systemId: 30001161n,
          occurredAt: new Date('2024-01-01T12:03:00Z'),
        }),
        createKillmail({
          killmailId: 5n,
          systemId: 30000142n,
          occurredAt: new Date('2024-01-01T12:04:00Z'),
        }),
        createKillmail({
          killmailId: 6n,
          systemId: 30001161n,
          occurredAt: new Date('2024-01-01T12:05:00Z'),
        }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(2);
      const system1 = result.battles.find((b) => b.battle.systemId === 30000142n);
      const system2 = result.battles.find((b) => b.battle.systemId === 30001161n);

      expect(system1?.killmailIds).toHaveLength(3);
      expect(system2?.killmailIds).toHaveLength(3);
    });

    it('should sort killmails by time within each cluster', () => {
      // Arrange - Add killmails out of order
      const killmails: KillmailEventRecord[] = [
        createKillmail({ killmailId: 3n, occurredAt: new Date('2024-01-01T12:10:00Z') }),
        createKillmail({ killmailId: 1n, occurredAt: new Date('2024-01-01T12:00:00Z') }),
        createKillmail({ killmailId: 2n, occurredAt: new Date('2024-01-01T12:05:00Z') }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      const killmailInserts = result.battles[0].killmailInserts;

      // Should be sorted by occurredAt
      expect(killmailInserts[0].killmailId).toBe(1n);
      expect(killmailInserts[1].killmailId).toBe(2n);
      expect(killmailInserts[2].killmailId).toBe(3n);
    });

    it('should handle mixture of clustered and ignored killmails', () => {
      // Arrange - use different alliances to ensure clean split
      const killmails: KillmailEventRecord[] = [
        // Valid cluster (3 kills)
        createKillmail({
          killmailId: 1n,
          occurredAt: new Date('2024-01-01T12:00:00Z'),
          victimAllianceId: 111n,
          attackerAllianceIds: [222n],
        }),
        createKillmail({
          killmailId: 2n,
          occurredAt: new Date('2024-01-01T12:05:00Z'),
          victimAllianceId: 111n,
          attackerAllianceIds: [222n],
        }),
        createKillmail({
          killmailId: 3n,
          occurredAt: new Date('2024-01-01T12:10:00Z'),
          victimAllianceId: 111n,
          attackerAllianceIds: [222n],
        }),
        // Gap + invalid cluster (only 2 kills, different alliances)
        createKillmail({
          killmailId: 4n,
          occurredAt: new Date('2024-01-01T13:00:00Z'),
          victimAllianceId: 333n,
          attackerAllianceIds: [444n],
        }),
        createKillmail({
          killmailId: 5n,
          occurredAt: new Date('2024-01-01T13:05:00Z'),
          victimAllianceId: 333n,
          attackerAllianceIds: [444n],
        }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].killmailIds).toEqual([1n, 2n, 3n]);
      expect(result.ignoredKillmailIds).toEqual([4n, 5n]);
    });
  });

  describe('cluster - edge cases', () => {
    it('should handle killmails with null alliance IDs', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        createKillmail({
          killmailId: 1n,
          victimAllianceId: null,
          attackerAllianceIds: null,
        }),
        createKillmail({
          killmailId: 2n,
          victimAllianceId: null,
          attackerAllianceIds: null,
        }),
        createKillmail({
          killmailId: 3n,
          victimAllianceId: null,
          attackerAllianceIds: null,
        }),
      ];

      // Act & Assert
      expect(() => engine.cluster(killmails)).not.toThrow();
      const result = engine.cluster(killmails);
      expect(result.battles).toHaveLength(1);
    });

    it('should handle killmails with zero ISK value', () => {
      // Arrange
      const killmails: KillmailEventRecord[] = [
        createKillmail({ killmailId: 1n, iskValue: 0n }),
        createKillmail({ killmailId: 2n, iskValue: 0n }),
        createKillmail({ killmailId: 3n, iskValue: 0n }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].battle.totalIskDestroyed).toBe(0n);
    });

    it('should handle killmails occurring at exactly the same time', () => {
      // Arrange
      const sameTime = new Date('2024-01-01T12:00:00Z');
      const killmails: KillmailEventRecord[] = [
        createKillmail({ killmailId: 1n, occurredAt: sameTime }),
        createKillmail({ killmailId: 2n, occurredAt: sameTime }),
        createKillmail({ killmailId: 3n, occurredAt: sameTime }),
      ];

      // Act
      const result = engine.cluster(killmails);

      // Assert
      expect(result.battles).toHaveLength(1);
      expect(result.battles[0].battle.startTime).toEqual(sameTime);
      expect(result.battles[0].battle.endTime).toEqual(sameTime);
    });
  });
});
