import type { KillmailRepository, KillmailEventInsert } from '@battlescope/database';
import type { KillmailReference } from '@battlescope/shared';
import { trace } from '@opentelemetry/api';
import { pino } from 'pino';
import type { KillmailSource } from './source.js';

export type IngestionResult = 'stored' | 'duplicate' | 'empty';

const tracer = trace.getTracer('battlescope.ingest.service');

export interface KillmailEnrichmentProducer {
  enqueue(killmailId: number): Promise<void>;
}

export class IngestionService {
  private readonly logger = pino({
    name: 'ingest-service',
    level: process.env.LOG_LEVEL ?? 'info',
  });

  constructor(
    private readonly repository: KillmailRepository,
    private readonly source: KillmailSource,
    private readonly enrichmentProducer?: KillmailEnrichmentProducer,
  ) {}

  private toEvent(reference: KillmailReference): KillmailEventInsert {
    return {
      killmailId: reference.killmailId,
      systemId: reference.systemId,
      occurredAt: reference.occurredAt,
      victimAllianceId: reference.victimAllianceId,
      victimCorpId: reference.victimCorpId,
      victimCharacterId: reference.victimCharacterId,
      attackerAllianceIds: reference.attackerAllianceIds,
      attackerCorpIds: reference.attackerCorpIds,
      attackerCharacterIds: reference.attackerCharacterIds,
      iskValue: reference.iskValue,
      zkbUrl: reference.zkbUrl,
      fetchedAt: new Date(),
    } satisfies KillmailEventInsert;
  }

  async processNext(): Promise<IngestionResult> {
    return tracer.startActiveSpan('ingest.process', async (span) => {
      try {
        const reference = await this.source.pull();
        if (!reference) {
          span.addEvent('no-killmail');
          return 'empty';
        }

        span.setAttribute('killmail.id', reference.killmailId);
        span.setAttribute('killmail.system', reference.systemId);

        const stored = await this.repository.insert(this.toEvent(reference));
        if (stored) {
          this.logger.info({ killmailId: reference.killmailId }, 'Stored killmail reference');
          span.addEvent('stored');
          if (this.enrichmentProducer) {
            try {
              await this.enrichmentProducer.enqueue(reference.killmailId);
              span.addEvent('enrichment.enqueued');
            } catch (error) {
              this.logger.warn(
                { err: error, killmailId: reference.killmailId },
                'Failed to enqueue enrichment job',
              );
              span.addEvent('enrichment.enqueue.failed');
            }
          }
          return 'stored';
        }

        span.addEvent('duplicate');
        return 'duplicate';
      } catch (error) {
        this.logger.error({ err: error }, 'Failed to process killmail');
        span.recordException(error as Error);
        span.setStatus({ code: 2, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async runForever(intervalMs: number, signal?: AbortSignal): Promise<void> {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    while (!signal?.aborted) {
      try {
        await this.processNext();
      } catch (error) {
        this.logger.error({ err: error }, 'Error during ingestion loop');
      }
      await sleep(intervalMs);
    }

    this.logger.info('Ingestion loop stopped');
  }
}
