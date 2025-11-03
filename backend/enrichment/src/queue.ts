import { Queue } from 'bullmq';
import IORedis from 'ioredis';
export { ENRICHMENT_QUEUE_NAME } from '@battlescope/shared';
import { ENRICHMENT_QUEUE_NAME, type EnrichmentJobPayload } from '@battlescope/shared';

export type EnrichmentJobData = EnrichmentJobPayload;

export interface EnrichmentQueueOptions {
  redisUrl: string;
  connectionName?: string;
  removeOnComplete?: number | boolean;
  removeOnFail?: number | boolean;
}

export const createEnrichmentQueue = ({
  redisUrl,
  connectionName = 'enrichment-producer',
  removeOnComplete = 1_000,
  removeOnFail = 1_000,
}: EnrichmentQueueOptions): Queue<EnrichmentJobData> =>
  new Queue<EnrichmentJobData>(ENRICHMENT_QUEUE_NAME, {
    connection: new IORedis(redisUrl, { connectionName }),
    defaultJobOptions: {
      removeOnComplete,
      removeOnFail,
    },
  });

export const enqueueKillmailEnrichment = async (
  queue: Queue<EnrichmentJobData>,
  killmailId: number,
): Promise<void> => {
  await queue.add('enrich-killmail', { killmailId });
};
