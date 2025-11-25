import axios, { AxiosError } from 'axios';
import type { Logger } from '@battlescope/logger';
import type { Kysely } from 'kysely';
import type { Database, NewKillmailEvent } from './database/schema';
import { EventBus, Topics } from '@battlescope/events';
import type { KillmailEvent } from '@battlescope/types';

interface ZKillboardPackage {
  package: {
    killID: number;
    killmail: {
      killmail_id: number;
      killmail_time: string;
      solar_system_id: number;
      victim: {
        alliance_id?: number;
        character_id?: number;
        corporation_id: number;
        damage_taken: number;
        ship_type_id: number;
      };
      attackers: Array<{
        alliance_id?: number;
        character_id?: number;
        corporation_id?: number;
        damage_done: number;
        final_blow: boolean;
        ship_type_id?: number;
        weapon_type_id?: number;
      }>;
    };
    zkb: {
      locationID: number;
      hash: string;
      fittedValue: number;
      droppedValue: number;
      destroyedValue: number;
      totalValue: number;
      points: number;
      npc: boolean;
      solo: boolean;
      awox: boolean;
    };
  };
}

export class ZKillboardPoller {
  private isRunning = false;
  private retryCount = 0;
  private pollInterval: NodeJS.Timeout | null = null;

  constructor(
    private db: Kysely<Database>,
    private eventBus: EventBus,
    private logger: Logger,
    private config: {
      redisqUrl: string;
      pollIntervalMs: number;
      maxRetries: number;
      retryDelayMs: number;
    }
  ) {}

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Poller is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting ZKillboard RedisQ poller', {
      url: this.config.redisqUrl,
      interval: this.config.pollIntervalMs,
    });

    await this.poll();
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
    this.logger.info('ZKillboard poller stopped');
  }

  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const response = await axios.get<ZKillboardPackage | { package: null }>(
        this.config.redisqUrl,
        {
          timeout: 30000, // 30 second timeout
          headers: {
            'User-Agent': 'BattleScope/3.0 (https://battlescope.eve; Contact: your@email.com)',
          },
        }
      );

      // Reset retry count on successful request
      this.retryCount = 0;

      // Check if we received a killmail
      if (response.data.package === null) {
        // Empty queue, continue polling
        this.schedulePoll(this.config.pollIntervalMs);
        return;
      }

      const killmailPackage = response.data as ZKillboardPackage;
      await this.processKillmail(killmailPackage);

      // Poll again immediately since there might be more killmails
      this.schedulePoll(0);
    } catch (error) {
      this.handleError(error);
    }
  }

  private async processKillmail(pkg: ZKillboardPackage): Promise<void> {
    const { killmail, zkb } = pkg.package;
    const killmailId = killmail.killmail_id;

    try {
      // Check if killmail already exists (deduplication)
      const existing = await this.db
        .selectFrom('killmail_events')
        .select('killmail_id')
        .where('killmail_id', '=', killmailId)
        .executeTakeFirst();

      if (existing) {
        this.logger.debug('Killmail already exists, skipping', { killmailId });
        return;
      }

      // Extract attacker alliance IDs
      const attackerAllianceIds = Array.from(
        new Set(
          killmail.attackers
            .map((a) => a.alliance_id)
            .filter((id): id is number => id !== undefined)
        )
      );

      // Create killmail event record
      const newKillmail: NewKillmailEvent = {
        killmail_id: killmailId,
        system_id: killmail.solar_system_id,
        occurred_at: new Date(killmail.killmail_time),
        victim_alliance_id: killmail.victim.alliance_id ?? null,
        attacker_alliance_ids: attackerAllianceIds.length > 0 ? attackerAllianceIds : null,
        isk_value: zkb.totalValue,
        zkb_url: `https://zkillboard.com/kill/${killmailId}/`,
        raw_data: JSON.stringify(pkg.package),
        processed_at: null,
        battle_id: null,
      };

      // Insert into database
      await this.db.insertInto('killmail_events').values(newKillmail).execute();

      this.logger.info('Killmail ingested', {
        killmailId,
        systemId: killmail.solar_system_id,
        iskValue: zkb.totalValue,
      });

      // Publish event to Redpanda
      await this.publishKillmailEvent(pkg);

      this.logger.debug('Killmail event published', { killmailId });
    } catch (error) {
      this.logger.error('Failed to process killmail', {
        killmailId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async publishKillmailEvent(pkg: ZKillboardPackage): Promise<void> {
    const { killmail, zkb } = pkg.package;

    const event: KillmailEvent = {
      type: 'killmail.received',
      timestamp: new Date(),
      data: {
        killmailId: killmail.killmail_id,
        killmailHash: zkb.hash,
        killmailTime: new Date(killmail.killmail_time),
        solarSystemId: killmail.solar_system_id,
        victim: {
          characterId: killmail.victim.character_id,
          corporationId: killmail.victim.corporation_id,
          allianceId: killmail.victim.alliance_id,
          shipTypeId: killmail.victim.ship_type_id,
          damageTaken: killmail.victim.damage_taken,
        },
        attackers: killmail.attackers.map((attacker) => ({
          characterId: attacker.character_id,
          corporationId: attacker.corporation_id,
          allianceId: attacker.alliance_id,
          shipTypeId: attacker.ship_type_id,
          weaponTypeId: attacker.weapon_type_id,
          damageDone: attacker.damage_done,
          finalBlow: attacker.final_blow,
        })),
        zkb: {
          totalValue: zkb.totalValue,
          points: zkb.points,
          npc: zkb.npc,
          solo: zkb.solo,
          awox: zkb.awox,
        },
      },
    };

    await this.eventBus.publish(Topics.KILLMAILS, event);
  }

  private handleError(error: unknown): void {
    this.retryCount++;

    const errorMessage = error instanceof AxiosError
      ? `HTTP ${error.response?.status}: ${error.message}`
      : error instanceof Error
      ? error.message
      : String(error);

    this.logger.error('Error polling ZKillboard', {
      error: errorMessage,
      retryCount: this.retryCount,
      maxRetries: this.config.maxRetries,
    });

    if (this.retryCount >= this.config.maxRetries) {
      // Use exponential backoff
      const backoffDelay = Math.min(
        this.config.retryDelayMs * Math.pow(2, this.retryCount - this.config.maxRetries),
        60000 // Max 60 seconds
      );
      this.logger.warn('Max retries reached, using exponential backoff', {
        delayMs: backoffDelay,
      });
      this.schedulePoll(backoffDelay);
    } else {
      // Regular retry delay
      this.schedulePoll(this.config.retryDelayMs);
    }
  }

  private schedulePoll(delayMs: number): void {
    if (!this.isRunning) return;

    this.pollInterval = setTimeout(() => {
      this.poll();
    }, delayMs);
  }
}
