import type {
  KillmailEnrichmentRepository,
  KillmailRepository,
  PilotShipHistoryRepository,
} from '@battlescope/database';
import { pino } from 'pino';
import { ShipHistoryProcessor } from './ship-history-processor.js';

export interface ResetOptions {
  mode: 'full' | 'incremental';
  fromDate?: Date;
  batchSize?: number;
}

export interface ResetProgress {
  processed: number;
  total: number;
  percentage: number;
}

export interface ResetResult {
  success: boolean;
  processed: number;
  recordsCreated: number;
  durationMs: number;
  error?: string;
}

/**
 * Service for resetting/rebuilding the pilot_ship_history table
 * from existing enrichment data.
 */
export class ShipHistoryResetService {
  private readonly logger = pino({
    name: 'ship-history-reset-service',
    level: process.env.LOG_LEVEL ?? 'info',
  });
  private readonly processor = new ShipHistoryProcessor();

  constructor(
    private readonly enrichmentRepository: KillmailEnrichmentRepository,
    private readonly killmailRepository: KillmailRepository,
    private readonly shipHistoryRepository: PilotShipHistoryRepository,
  ) {}

  /**
   * Execute a reset job to rebuild ship history from enrichment data.
   * @param options Reset options
   * @param onProgress Optional callback for progress updates
   */
  async execute(
    options: ResetOptions,
    onProgress?: (progress: ResetProgress) => void,
  ): Promise<ResetResult> {
    const startTime = Date.now();
    const batchSize = options.batchSize ?? 1000;
    let processed = 0;
    let recordsCreated = 0;

    try {
      // Get total count for progress tracking
      const total = await this.enrichmentRepository.countSucceeded(options.fromDate);
      this.logger.info(
        { mode: options.mode, total, fromDate: options.fromDate?.toISOString() },
        'Starting ship history reset',
      );

      if (total === 0) {
        return {
          success: true,
          processed: 0,
          recordsCreated: 0,
          durationMs: Date.now() - startTime,
        };
      }

      // For full reset, truncate the table first
      if (options.mode === 'full') {
        await this.shipHistoryRepository.truncate();
        this.logger.info('Truncated pilot_ship_history table');
      } else if (options.mode === 'incremental' && options.fromDate) {
        // For incremental, delete records after fromDate
        const deleted = await this.shipHistoryRepository.deleteAfterDate(options.fromDate);
        this.logger.info({ deleted }, 'Deleted existing records after fromDate');
      }

      // Process enrichments in batches
      let cursor: bigint | null = null;
      let hasMore = true;

      while (hasMore) {
        const enrichments = await this.enrichmentRepository.listSucceededPaginated(
          cursor,
          batchSize,
          options.fromDate,
        );

        if (enrichments.length === 0) {
          hasMore = false;
          continue;
        }

        // Get killmail events for these enrichments
        const killmailIds = enrichments.map((e) => e.killmailId);
        const killmails = await this.killmailRepository.findByIds(killmailIds);

        // Create enrichment map for batch processing
        const enrichmentMap = new Map(enrichments.map((e) => [e.killmailId, e]));

        // Process and insert ship history records
        const shipHistoryRecords = this.processor.processBatch(killmails, enrichmentMap);

        if (shipHistoryRecords.length > 0) {
          await this.shipHistoryRepository.insertBatch(shipHistoryRecords);
          recordsCreated += shipHistoryRecords.length;
        }

        processed += enrichments.length;
        cursor = enrichments[enrichments.length - 1].killmailId;

        // Report progress
        const progress: ResetProgress = {
          processed,
          total,
          percentage: Math.round((processed / total) * 100),
        };

        if (onProgress) {
          onProgress(progress);
        }

        this.logger.debug(
          { processed, total, recordsCreated, percentage: progress.percentage },
          'Reset progress',
        );
      }

      const durationMs = Date.now() - startTime;
      this.logger.info(
        { processed, recordsCreated, durationMs },
        'Ship history reset completed successfully',
      );

      return {
        success: true,
        processed,
        recordsCreated,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error({ error, processed, recordsCreated }, 'Ship history reset failed');

      return {
        success: false,
        processed,
        recordsCreated,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get current ship history statistics
   */
  async getStats(): Promise<{ recordCount: number }> {
    const recordCount = await this.shipHistoryRepository.countRecords();
    return { recordCount };
  }
}
