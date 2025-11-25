/**
 * Backfill Script - Fetch historical killmails from ZKillboard
 *
 * This script fetches killmail IDs and hashes from ZKillboard's history API
 * and inserts them into the database for enrichment processing.
 *
 * Usage:
 *   BACKFILL_DAYS=7 pnpm backfill
 *   BACKFILL_START_DATE=2025-01-01 BACKFILL_END_DATE=2025-01-07 pnpm backfill
 */

import { createLogger } from '@battlescope/logger';
import { EventBus, Topics } from '@battlescope/events';
import type { KillmailEvent } from '@battlescope/types';
import { getDatabase, closeDatabase } from './database';
import { ZKillboardHistoryClient } from './lib/zkillboard-history';
import { getConfig } from './config';

const logger = createLogger({ serviceName: 'backfill' });

interface BackfillConfig {
  startDate: Date;
  endDate: Date;
  batchSize: number;
  publishEvents: boolean;
}

function getBackfillConfig(): BackfillConfig {
  const now = new Date();

  // Option 1: Use BACKFILL_DAYS (default: 7 days)
  const days = parseInt(process.env.BACKFILL_DAYS || '7', 10);
  const endDate = new Date(now);
  endDate.setHours(0, 0, 0, 0); // Start of today
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  // Option 2: Use explicit date range
  if (process.env.BACKFILL_START_DATE) {
    const start = new Date(process.env.BACKFILL_START_DATE);
    if (isNaN(start.getTime())) {
      throw new Error('Invalid BACKFILL_START_DATE format. Use YYYY-MM-DD');
    }
    startDate.setTime(start.getTime());
  }

  if (process.env.BACKFILL_END_DATE) {
    const end = new Date(process.env.BACKFILL_END_DATE);
    if (isNaN(end.getTime())) {
      throw new Error('Invalid BACKFILL_END_DATE format. Use YYYY-MM-DD');
    }
    endDate.setTime(end.getTime());
  }

  return {
    startDate,
    endDate,
    batchSize: parseInt(process.env.BACKFILL_BATCH_SIZE || '1000', 10),
    publishEvents: process.env.BACKFILL_PUBLISH_EVENTS !== 'false',
  };
}

async function main() {
  const config = getBackfillConfig();
  const appConfig = getConfig();

  logger.info('Starting backfill', {
    startDate: config.startDate.toISOString().split('T')[0],
    endDate: config.endDate.toISOString().split('T')[0],
    batchSize: config.batchSize,
    publishEvents: config.publishEvents,
  });

  // Initialize database
  const db = getDatabase(logger);
  logger.info('Database connected');

  // Initialize event bus (if publishing events)
  let eventBus: EventBus | null = null;
  if (config.publishEvents) {
    eventBus = new EventBus(appConfig.eventBus);
    logger.info('Event bus connected');
  }

  // Initialize history client
  const historyClient = new ZKillboardHistoryClient(logger, {
    userAgent: 'BattleScope/3.0 Backfill (https://battlescope.eve)',
    requestDelayMs: 1000, // 1 second between requests
  });

  try {
    let totalKillmails = 0;
    let totalInserted = 0;
    let totalSkipped = 0;

    // Fetch killmails for each date in range
    const currentDate = new Date(config.startDate);
    while (currentDate <= config.endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      logger.info('Processing date', { date: dateStr });

      try {
        // Fetch killmails for this date
        const killmails = await historyClient.fetchDate(currentDate);
        totalKillmails += killmails.length;

        if (killmails.length === 0) {
          logger.info('No killmails found for date', { date: dateStr });
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        // Process in batches
        for (let i = 0; i < killmails.length; i += config.batchSize) {
          const batch = killmails.slice(i, i + config.batchSize);
          const { inserted, skipped } = await processBatch(
            batch,
            db,
            eventBus,
            logger
          );

          totalInserted += inserted;
          totalSkipped += skipped;

          logger.info('Batch processed', {
            date: dateStr,
            batchNumber: Math.floor(i / config.batchSize) + 1,
            inserted,
            skipped,
          });
        }

        logger.info('Date completed', {
          date: dateStr,
          killmails: killmails.length,
        });
      } catch (error) {
        logger.error('Failed to process date', {
          date: dateStr,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with next date
      }

      // Move to next date
      currentDate.setDate(currentDate.getDate() + 1);
    }

    logger.info('Backfill completed', {
      totalKillmails,
      totalInserted,
      totalSkipped,
      successRate: `${((totalInserted / totalKillmails) * 100).toFixed(2)}%`,
    });
  } catch (error) {
    logger.error('Backfill failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  } finally {
    // Cleanup
    if (eventBus) {
      await eventBus.disconnect();
      logger.info('Event bus disconnected');
    }
    await closeDatabase(logger);
    logger.info('Database disconnected');
  }
}

async function processBatch(
  killmails: Array<[number, string]>,
  db: ReturnType<typeof getDatabase>,
  eventBus: EventBus | null,
  logger: ReturnType<typeof createLogger>
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const [killmailId, hash] of killmails) {
    try {
      // Insert with ON CONFLICT DO NOTHING for idempotency
      const result = await db
        .insertInto('killmail_events')
        .values({
          killmail_id: killmailId,
          // We don't have full killmail data from history API
          // Set minimal values and let enrichment fill the rest
          system_id: 0, // Will be updated by enrichment
          occurred_at: new Date(0), // Will be updated by enrichment
          victim_alliance_id: null,
          attacker_alliance_ids: null,
          isk_value: null,
          zkb_url: `https://zkillboard.com/kill/${killmailId}/`,
          raw_data: JSON.stringify({ killmail_id: killmailId, hash }),
          processed_at: null,
          battle_id: null,
        })
        .onConflict((oc) => oc.column('killmail_id').doNothing())
        .returning('killmail_id')
        .executeTakeFirst();

      if (result) {
        // New killmail inserted
        inserted++;

        // Publish event for enrichment
        if (eventBus) {
          const event: KillmailEvent = {
            type: 'killmail.received',
            timestamp: new Date(),
            data: {
              killmailId,
              killmailHash: hash,
              killmailTime: new Date(0), // Will be updated by enrichment
              solarSystemId: 0, // Will be updated by enrichment
              victim: {
                characterId: undefined,
                corporationId: 0,
                allianceId: undefined,
                shipTypeId: 0,
                damageTaken: 0,
              },
              attackers: [],
              zkb: {
                totalValue: 0,
                points: 0,
                npc: false,
                solo: false,
                awox: false,
              },
            },
          };

          await eventBus.publish(Topics.KILLMAILS, event);
        }
      } else {
        // Killmail already exists
        skipped++;
      }
    } catch (error) {
      logger.error('Failed to insert killmail', {
        killmailId,
        error: error instanceof Error ? error.message : String(error),
      });
      skipped++;
    }
  }

  return { inserted, skipped };
}

// Handle signals
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Run backfill
main();
