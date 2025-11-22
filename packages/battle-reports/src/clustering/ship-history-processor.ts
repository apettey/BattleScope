import type {
  KillmailEnrichmentRecord,
  KillmailEventRecord,
  PilotShipHistoryInsert,
} from '@battlescope/database';

/**
 * Enriched killmail structure from zKillboard/ESI
 * This represents the structure of the payload stored in killmail_enrichments
 */
export interface EnrichedKillmailVictim {
  character_id?: number;
  corporation_id?: number;
  alliance_id?: number;
  ship_type_id: number;
}

export interface EnrichedKillmailAttacker {
  character_id?: number;
  corporation_id?: number;
  alliance_id?: number;
  ship_type_id?: number;
  final_blow?: boolean;
  damage_done?: number;
}

export interface EnrichedKillmailPayload {
  killmail_id: number;
  killmail_time: string;
  solar_system_id: number;
  victim: EnrichedKillmailVictim;
  attackers: EnrichedKillmailAttacker[];
  zkb?: {
    totalValue?: number;
    fittedValue?: number;
    droppedValue?: number;
    destroyedValue?: number;
  };
}

/**
 * Extracts ship history records from enriched killmail data.
 * This processor is responsible for parsing the enrichment payload
 * and creating the appropriate PilotShipHistoryInsert records.
 */
export class ShipHistoryProcessor {
  /**
   * Process a single killmail and its enrichment to extract ship history records.
   * Returns records for both the victim (if a player) and all player attackers.
   */
  processKillmail(
    killmail: KillmailEventRecord,
    enrichment: KillmailEnrichmentRecord | null,
  ): PilotShipHistoryInsert[] {
    if (!enrichment?.payload) {
      return [];
    }

    const payload = this.parseEnrichmentPayload(enrichment.payload);
    if (!payload) {
      return [];
    }

    const records: PilotShipHistoryInsert[] = [];
    const killmailValue = this.extractKillmailValue(payload);

    // Process victim (is_loss = true)
    const victimRecord = this.processVictim(killmail, payload, killmailValue);
    if (victimRecord) {
      records.push(victimRecord);
    }

    // Process attackers (is_loss = false)
    const attackerRecords = this.processAttackers(killmail, payload, killmailValue);
    records.push(...attackerRecords);

    return records;
  }

  /**
   * Process multiple killmails with their enrichments.
   * Returns a flat array of all ship history records.
   */
  processBatch(
    killmails: KillmailEventRecord[],
    enrichmentsByKillmailId: Map<bigint, KillmailEnrichmentRecord>,
  ): PilotShipHistoryInsert[] {
    const records: PilotShipHistoryInsert[] = [];

    for (const killmail of killmails) {
      const enrichment = enrichmentsByKillmailId.get(killmail.killmailId) ?? null;
      const killmailRecords = this.processKillmail(killmail, enrichment);
      records.push(...killmailRecords);
    }

    return records;
  }

  private parseEnrichmentPayload(payload: Record<string, unknown>): EnrichedKillmailPayload | null {
    // The payload might be nested (zkillboard format) or direct (ESI format)
    // Handle both cases
    if (!payload) {
      return null;
    }

    // Check if this is a zkillboard format with nested structure
    const killmailData = payload.killmail ?? payload;

    if (typeof killmailData !== 'object' || killmailData === null || !('victim' in killmailData)) {
      return null;
    }

    return {
      killmail_id: (killmailData as Record<string, unknown>).killmail_id as number,
      killmail_time: (killmailData as Record<string, unknown>).killmail_time as string,
      solar_system_id: (killmailData as Record<string, unknown>).solar_system_id as number,
      victim: (killmailData as Record<string, unknown>).victim as EnrichedKillmailVictim,
      attackers: ((killmailData as Record<string, unknown>).attackers ??
        []) as EnrichedKillmailAttacker[],
      zkb: (payload.zkb ??
        (killmailData as Record<string, unknown>).zkb) as EnrichedKillmailPayload['zkb'],
    };
  }

  private extractKillmailValue(payload: EnrichedKillmailPayload): bigint | null {
    const zkbValue = payload.zkb?.totalValue;
    if (typeof zkbValue === 'number' && zkbValue > 0) {
      return BigInt(Math.floor(zkbValue));
    }
    return null;
  }

  private extractShipValue(payload: EnrichedKillmailPayload): bigint | null {
    // For victims, the ship value is the fitted value from zkb
    const fittedValue = payload.zkb?.fittedValue;
    if (typeof fittedValue === 'number' && fittedValue > 0) {
      return BigInt(Math.floor(fittedValue));
    }
    // Fall back to total value if fitted value not available
    return this.extractKillmailValue(payload);
  }

  private processVictim(
    killmail: KillmailEventRecord,
    payload: EnrichedKillmailPayload,
    killmailValue: bigint | null,
  ): PilotShipHistoryInsert | null {
    const victim = payload.victim;

    // Skip if no character (NPC or structure)
    if (!victim.character_id) {
      return null;
    }

    // Skip if no ship type
    if (!victim.ship_type_id) {
      return null;
    }

    return {
      killmailId: killmail.killmailId,
      characterId: BigInt(victim.character_id),
      shipTypeId: BigInt(victim.ship_type_id),
      allianceId: victim.alliance_id ? BigInt(victim.alliance_id) : null,
      corpId: victim.corporation_id ? BigInt(victim.corporation_id) : null,
      systemId: killmail.systemId,
      isLoss: true,
      shipValue: this.extractShipValue(payload),
      killmailValue,
      occurredAt: killmail.occurredAt,
      zkbUrl: killmail.zkbUrl,
    };
  }

  private processAttackers(
    killmail: KillmailEventRecord,
    payload: EnrichedKillmailPayload,
    killmailValue: bigint | null,
  ): PilotShipHistoryInsert[] {
    const records: PilotShipHistoryInsert[] = [];
    const seenCharacters = new Set<number>();

    for (const attacker of payload.attackers) {
      // Skip NPCs (no character_id)
      if (!attacker.character_id) {
        continue;
      }

      // Skip if no ship type (e.g., structure gunners)
      if (!attacker.ship_type_id) {
        continue;
      }

      // Deduplicate by character (same character can appear multiple times)
      if (seenCharacters.has(attacker.character_id)) {
        continue;
      }
      seenCharacters.add(attacker.character_id);

      records.push({
        killmailId: killmail.killmailId,
        characterId: BigInt(attacker.character_id),
        shipTypeId: BigInt(attacker.ship_type_id),
        allianceId: attacker.alliance_id ? BigInt(attacker.alliance_id) : null,
        corpId: attacker.corporation_id ? BigInt(attacker.corporation_id) : null,
        systemId: killmail.systemId,
        isLoss: false,
        shipValue: null, // Attacker ship value not available from killmail
        killmailValue,
        occurredAt: killmail.occurredAt,
        zkbUrl: killmail.zkbUrl,
      });
    }

    return records;
  }
}
