import { describe, expect, it } from 'vitest';
import {
  ShipHistoryProcessor,
  type EnrichedKillmailPayload,
} from '../src/clustering/ship-history-processor.js';
import type { KillmailEventRecord, KillmailEnrichmentRecord } from '@battlescope/database';

describe('ShipHistoryProcessor', () => {
  const processor = new ShipHistoryProcessor();

  // Helper to create a killmail event record
  const createKillmail = (overrides: Partial<KillmailEventRecord> = {}): KillmailEventRecord => ({
    killmailId: 123456n,
    systemId: 30000142n,
    occurredAt: new Date('2024-01-01T12:00:00Z'),
    fetchedAt: new Date('2024-01-01T12:01:00Z'),
    processedAt: null,
    battleId: null,
    zkbUrl: 'https://zkillboard.com/kill/123456/',
    victimCharacterId: 90012345n,
    victimCorpId: 98000001n,
    victimAllianceId: 99001234n,
    attackerCharacterIds: [90022222n, 90033333n],
    attackerCorpIds: [98000002n, 98000003n],
    attackerAllianceIds: [99005678n, 99005678n],
    iskValue: 1000000000n,
    ...overrides,
  });

  // Helper to create enrichment record
  const createEnrichment = (
    killmailId: bigint,
    payload: EnrichedKillmailPayload | Record<string, unknown>,
  ): KillmailEnrichmentRecord => ({
    killmailId,
    status: 'succeeded',
    payload: payload as Record<string, unknown>,
    error: null,
    fetchedAt: new Date('2024-01-01T12:01:00Z'),
    updatedAt: new Date('2024-01-01T12:01:00Z'),
    createdAt: new Date('2024-01-01T12:01:00Z'),
  });

  // Helper to create enrichment payload
  const createPayload = (
    overrides: Partial<EnrichedKillmailPayload> = {},
  ): EnrichedKillmailPayload => ({
    killmail_id: 123456,
    killmail_time: '2024-01-01T12:00:00Z',
    solar_system_id: 30000142,
    victim: {
      character_id: 90012345,
      corporation_id: 98000001,
      alliance_id: 99001234,
      ship_type_id: 11567, // Loki
    },
    attackers: [
      {
        character_id: 90022222,
        corporation_id: 98000002,
        alliance_id: 99005678,
        ship_type_id: 11987, // Proteus
        final_blow: true,
        damage_done: 50000,
      },
      {
        character_id: 90033333,
        corporation_id: 98000003,
        alliance_id: 99005678,
        ship_type_id: 22456, // Sabre
        final_blow: false,
        damage_done: 10000,
      },
    ],
    zkb: {
      totalValue: 1500000000,
      fittedValue: 1200000000,
      droppedValue: 200000000,
      destroyedValue: 1100000000,
    },
    ...overrides,
  });

  describe('processKillmail', () => {
    it('should return empty array when no enrichment provided', () => {
      const killmail = createKillmail();
      const result = processor.processKillmail(killmail, null);
      expect(result).toHaveLength(0);
    });

    it('should return empty array when enrichment has no payload', () => {
      const killmail = createKillmail();
      const enrichment = createEnrichment(killmail.killmailId, {});
      enrichment.payload = null;

      const result = processor.processKillmail(killmail, enrichment);
      expect(result).toHaveLength(0);
    });

    it('should extract victim record correctly', () => {
      const killmail = createKillmail();
      const payload = createPayload();
      const enrichment = createEnrichment(killmail.killmailId, payload);

      const result = processor.processKillmail(killmail, enrichment);

      const victimRecord = result.find((r) => r.isLoss === true);
      expect(victimRecord).toBeDefined();
      expect(victimRecord!.characterId).toBe(90012345n);
      expect(victimRecord!.shipTypeId).toBe(11567n);
      expect(victimRecord!.allianceId).toBe(99001234n);
      expect(victimRecord!.corpId).toBe(98000001n);
      expect(victimRecord!.systemId).toBe(30000142n);
      expect(victimRecord!.isLoss).toBe(true);
      expect(victimRecord!.shipValue).toBe(1200000000n); // fittedValue
      expect(victimRecord!.killmailValue).toBe(1500000000n);
      expect(victimRecord!.zkbUrl).toBe('https://zkillboard.com/kill/123456/');
    });

    it('should extract attacker records correctly', () => {
      const killmail = createKillmail();
      const payload = createPayload();
      const enrichment = createEnrichment(killmail.killmailId, payload);

      const result = processor.processKillmail(killmail, enrichment);

      const attackerRecords = result.filter((r) => r.isLoss === false);
      expect(attackerRecords).toHaveLength(2);

      // Check first attacker
      const attacker1 = attackerRecords.find((r) => r.characterId === 90022222n);
      expect(attacker1).toBeDefined();
      expect(attacker1!.shipTypeId).toBe(11987n);
      expect(attacker1!.isLoss).toBe(false);
      expect(attacker1!.shipValue).toBeNull(); // Attacker ship value not available

      // Check second attacker
      const attacker2 = attackerRecords.find((r) => r.characterId === 90033333n);
      expect(attacker2).toBeDefined();
      expect(attacker2!.shipTypeId).toBe(22456n);
    });

    it('should skip NPC victims (no character_id)', () => {
      const killmail = createKillmail({ victimCharacterId: null });
      const payload = createPayload({
        victim: {
          corporation_id: 1000125, // NPC corp
          ship_type_id: 123,
        },
      });
      const enrichment = createEnrichment(killmail.killmailId, payload);

      const result = processor.processKillmail(killmail, enrichment);

      const victimRecord = result.find((r) => r.isLoss === true);
      expect(victimRecord).toBeUndefined();
    });

    it('should skip NPC attackers', () => {
      const killmail = createKillmail();
      const payload = createPayload({
        attackers: [
          {
            // NPC attacker - no character_id
            corporation_id: 1000125,
            ship_type_id: 123,
            damage_done: 100,
          },
          {
            character_id: 90022222,
            corporation_id: 98000002,
            ship_type_id: 11987,
          },
        ],
      });
      const enrichment = createEnrichment(killmail.killmailId, payload);

      const result = processor.processKillmail(killmail, enrichment);

      const attackerRecords = result.filter((r) => r.isLoss === false);
      expect(attackerRecords).toHaveLength(1);
      expect(attackerRecords[0].characterId).toBe(90022222n);
    });

    it('should skip attackers without ship type (structure gunners)', () => {
      const killmail = createKillmail();
      const payload = createPayload({
        attackers: [
          {
            character_id: 90022222,
            corporation_id: 98000002,
            // No ship_type_id - structure gunner
          },
          {
            character_id: 90033333,
            corporation_id: 98000003,
            ship_type_id: 22456,
          },
        ],
      });
      const enrichment = createEnrichment(killmail.killmailId, payload);

      const result = processor.processKillmail(killmail, enrichment);

      const attackerRecords = result.filter((r) => r.isLoss === false);
      expect(attackerRecords).toHaveLength(1);
      expect(attackerRecords[0].characterId).toBe(90033333n);
    });

    it('should deduplicate attackers by character_id', () => {
      const killmail = createKillmail();
      const payload = createPayload({
        attackers: [
          {
            character_id: 90022222,
            ship_type_id: 11987,
          },
          {
            character_id: 90022222, // Same character
            ship_type_id: 11987,
          },
          {
            character_id: 90033333,
            ship_type_id: 22456,
          },
        ],
      });
      const enrichment = createEnrichment(killmail.killmailId, payload);

      const result = processor.processKillmail(killmail, enrichment);

      const attackerRecords = result.filter((r) => r.isLoss === false);
      expect(attackerRecords).toHaveLength(2);
    });

    it('should handle zkillboard format with nested killmail object', () => {
      const killmail = createKillmail();
      // zkillboard format has killmail nested
      const zkbPayload = {
        killmail: {
          killmail_id: 123456,
          killmail_time: '2024-01-01T12:00:00Z',
          solar_system_id: 30000142,
          victim: {
            character_id: 90012345,
            ship_type_id: 11567,
          },
          attackers: [],
        },
        zkb: {
          totalValue: 1000000000,
          fittedValue: 800000000,
        },
      };
      const enrichment = createEnrichment(killmail.killmailId, zkbPayload);

      const result = processor.processKillmail(killmail, enrichment);

      expect(result).toHaveLength(1);
      expect(result[0].isLoss).toBe(true);
      expect(result[0].shipTypeId).toBe(11567n);
      expect(result[0].killmailValue).toBe(1000000000n);
    });

    it('should use totalValue when fittedValue not available', () => {
      const killmail = createKillmail();
      const payload = createPayload({
        zkb: {
          totalValue: 500000000,
          // No fittedValue
        },
      });
      const enrichment = createEnrichment(killmail.killmailId, payload);

      const result = processor.processKillmail(killmail, enrichment);

      const victimRecord = result.find((r) => r.isLoss === true);
      expect(victimRecord!.shipValue).toBe(500000000n);
    });

    it('should handle missing alliance and corp IDs', () => {
      const killmail = createKillmail({
        victimAllianceId: null,
        victimCorpId: null,
      });
      const payload = createPayload({
        victim: {
          character_id: 90012345,
          ship_type_id: 11567,
          // No alliance or corp
        },
        attackers: [
          {
            character_id: 90022222,
            ship_type_id: 11987,
            // No alliance or corp
          },
        ],
      });
      const enrichment = createEnrichment(killmail.killmailId, payload);

      const result = processor.processKillmail(killmail, enrichment);

      expect(result).toHaveLength(2);
      expect(result[0].allianceId).toBeNull();
      expect(result[0].corpId).toBeNull();
      expect(result[1].allianceId).toBeNull();
      expect(result[1].corpId).toBeNull();
    });
  });

  describe('processBatch', () => {
    it('should process multiple killmails', () => {
      const killmail1 = createKillmail({ killmailId: 1n });
      const killmail2 = createKillmail({ killmailId: 2n });

      const payload1 = createPayload();
      const payload2 = createPayload({
        victim: { character_id: 99999999, ship_type_id: 12345 },
        attackers: [{ character_id: 88888888, ship_type_id: 54321 }],
      });

      const enrichmentMap = new Map([
        [1n, createEnrichment(1n, payload1)],
        [2n, createEnrichment(2n, payload2)],
      ]);

      const result = processor.processBatch([killmail1, killmail2], enrichmentMap);

      // killmail1: 1 victim + 2 attackers = 3
      // killmail2: 1 victim + 1 attacker = 2
      expect(result).toHaveLength(5);
    });

    it('should skip killmails without enrichment', () => {
      const killmail1 = createKillmail({ killmailId: 1n });
      const killmail2 = createKillmail({ killmailId: 2n });

      const payload1 = createPayload();
      const enrichmentMap = new Map([
        [1n, createEnrichment(1n, payload1)],
        // No enrichment for killmail2
      ]);

      const result = processor.processBatch([killmail1, killmail2], enrichmentMap);

      // Only killmail1 should be processed
      expect(result.length).toBeLessThan(6); // Less than if both were processed
      expect(result.every((r) => r.killmailId === 1n)).toBe(true);
    });

    it('should return empty array for empty input', () => {
      const result = processor.processBatch([], new Map());
      expect(result).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle payload with invalid structure', () => {
      const killmail = createKillmail();
      const enrichment = createEnrichment(killmail.killmailId, {
        some: 'random',
        data: 123,
      });

      const result = processor.processKillmail(killmail, enrichment);
      expect(result).toHaveLength(0);
    });

    it('should handle victim with no ship_type_id', () => {
      const killmail = createKillmail();
      const payload = createPayload({
        victim: {
          character_id: 90012345,
          // No ship_type_id - shouldn't happen but handle gracefully
        } as EnrichedKillmailPayload['victim'],
      });
      const enrichment = createEnrichment(killmail.killmailId, payload);

      const result = processor.processKillmail(killmail, enrichment);

      const victimRecord = result.find((r) => r.isLoss === true);
      expect(victimRecord).toBeUndefined();
    });

    it('should handle zero ISK values', () => {
      const killmail = createKillmail({ iskValue: 0n });
      const payload = createPayload({
        zkb: {
          totalValue: 0,
          fittedValue: 0,
        },
      });
      const enrichment = createEnrichment(killmail.killmailId, payload);

      const result = processor.processKillmail(killmail, enrichment);

      expect(result.length).toBeGreaterThan(0);
      const victimRecord = result.find((r) => r.isLoss === true);
      expect(victimRecord!.shipValue).toBeNull(); // 0 treated as null
      expect(victimRecord!.killmailValue).toBeNull();
    });

    it('should handle empty attackers array', () => {
      const killmail = createKillmail();
      const payload = createPayload({
        attackers: [],
      });
      const enrichment = createEnrichment(killmail.killmailId, payload);

      const result = processor.processKillmail(killmail, enrichment);

      expect(result).toHaveLength(1);
      expect(result[0].isLoss).toBe(true);
    });
  });
});
