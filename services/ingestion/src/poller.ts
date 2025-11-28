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
    this.logger.info({
      url: this.config.redisqUrl,
      pollInterval: this.config.pollIntervalMs,
      maxRetries: this.config.maxRetries,
      retryDelay: this.config.retryDelayMs,
    }, 'Starting ZKillboard RedisQ poller');

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

    // Generate a correlation ID for tracing this specific killmail through the system
    const correlationId = `km-${killmailId}-${Date.now()}`;

    this.logger.debug('Processing killmail', {
      killmailId,
      correlationId,
      systemId: killmail.solar_system_id,
      victimShipTypeId: killmail.victim.ship_type_id,
      attackerCount: killmail.attackers.length,
    });

    try {
      // Check if killmail already exists (deduplication)
      this.logger.trace('Checking for duplicate killmail', { killmailId, correlationId });
      const existing = await this.db
        .selectFrom('killmail_events')
        .select('killmail_id')
        .where('killmail_id', '=', killmailId)
        .executeTakeFirst();

      if (existing) {
        this.logger.debug('Killmail already exists, skipping', { killmailId, correlationId });
        return;
      }

      this.logger.trace('Extracting attacker alliance IDs', { killmailId, correlationId });
      // Extract attacker alliance IDs
      const attackerAllianceIds = Array.from(
        new Set(
          killmail.attackers
            .map((a) => a.alliance_id)
            .filter((id): id is number => id !== undefined)
        )
      );

      this.logger.trace('Creating killmail event record', {
        killmailId,
        correlationId,
        attackerAllianceCount: attackerAllianceIds.length,
      });

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
      this.logger.trace('Inserting killmail into database', { killmailId, correlationId });
      await this.db.insertInto('killmail_events').values(newKillmail).execute();

      this.logger.info('Killmail ingested', {
        killmailId,
        correlationId,
        systemId: killmail.solar_system_id,
        iskValue: zkb.totalValue,
      });

      // Publish event to Redpanda
      this.logger.trace('Publishing killmail event to Kafka', { killmailId, correlationId });
      await this.publishKillmailEvent(pkg);

      this.logger.debug('Killmail event published', { killmailId, correlationId });
    } catch (error) {
      // Enhanced error logging with full details
      const errorDetails: Record<string, any> = {
        killmailId,
        correlationId,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        systemId: killmail.solar_system_id,
        victimShipTypeId: killmail.victim.ship_type_id,
        attackerCount: killmail.attackers.length,
        iskValue: zkb.totalValue,
      };

      // Add stack trace if available
      if (error instanceof Error && error.stack) {
        errorDetails.stack = error.stack;
      }

      // Add database-specific error details if available
      if (error && typeof error === 'object' && 'code' in error) {
        errorDetails.dbErrorCode = (error as any).code;
        errorDetails.dbErrorDetail = (error as any).detail;
        errorDetails.dbErrorHint = (error as any).hint;
      }

      // Log the raw killmail data for debugging (only in case of error)
      errorDetails.rawKillmail = {
        killmail_id: killmail.killmail_id,
        killmail_time: killmail.killmail_time,
        solar_system_id: killmail.solar_system_id,
        victim: {
          character_id: killmail.victim.character_id,
          corporation_id: killmail.victim.corporation_id,
          alliance_id: killmail.victim.alliance_id,
          ship_type_id: killmail.victim.ship_type_id,
        },
        attackerCount: killmail.attackers.length,
      };

      this.logger.error(errorDetails, 'Failed to process killmail');

      // Re-throw certain critical errors that should stop the poller
      if (error instanceof Error && error.message.includes('Connection terminated')) {
        this.logger.fatal('Database connection lost, throwing error to trigger restart', {
          killmailId,
          correlationId,
        });
        throw error;
      }
    }
  }

  private async publishKillmailEvent(pkg: ZKillboardPackage): Promise<void> {
    const { killmail, zkb } = pkg.package;
    const killmailId = killmail.killmail_id;

    try {
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

      // Use killmailId as partition key for even distribution across partitions
      await this.eventBus.publish(Topics.KILLMAILS, event);

      this.logger.trace('Event published to Kafka successfully', {
        killmailId,
        topic: Topics.KILLMAILS,
      });
    } catch (error) {
      // Log Kafka publishing errors with full details
      this.logger.error('Failed to publish killmail event to Kafka', {
        killmailId,
        topic: Topics.KILLMAILS,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Re-throw to be caught by processKillmail
      throw error;
    }
  }

  private handleError(error: unknown): void {
    this.retryCount++;

    const errorMessage = error instanceof AxiosError
      ? `HTTP ${error.response?.status}: ${error.message}`
      : error instanceof Error
      ? error.message
      : String(error);

    const errorDetails = error instanceof AxiosError
      ? {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          url: error.config?.url,
        }
      : {};

    this.logger.error('Error polling ZKillboard', {
      error: errorMessage,
      retryCount: this.retryCount,
      maxRetries: this.config.maxRetries,
      ...errorDetails,
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
