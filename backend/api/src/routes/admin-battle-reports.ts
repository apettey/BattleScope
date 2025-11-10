import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createAuthMiddleware, createRequireRoleMiddleware } from '@battlescope/auth';
import type {
  FeatureRepository,
  RulesetRepository,
  KillmailRepository,
  BattleRepository,
} from '@battlescope/database';
import type { SessionService } from '@battlescope/auth';

const IngestionConfigSchema = z.object({
  pollIntervalMs: z.number().int().min(1000).max(60000).optional(),
  redisqQueueId: z.string().optional(),
});

const ClusteringConfigSchema = z.object({
  windowMinutes: z.number().int().min(5).max(180).optional(),
  gapMaxMinutes: z.number().int().min(1).max(60).optional(),
  minKills: z.number().int().min(1).max(100).optional(),
  processingDelayMinutes: z.number().int().min(0).max(1440).optional(),
  batchSize: z.number().int().min(100).max(10000).optional(),
  intervalMs: z.number().int().min(1000).max(300000).optional(),
});

const RulesetUpdateSchema = z.object({
  minPilots: z.number().int().min(0).max(1000).optional(),
  trackedAllianceIds: z.array(z.string()).optional(),
  trackedCorpIds: z.array(z.string()).optional(),
  trackedSystemIds: z.array(z.string()).optional(),
  trackedSecurityTypes: z
    .array(z.enum(['highsec', 'lowsec', 'nullsec', 'wormhole', 'pochven']))
    .optional(),
  ignoreUnlisted: z.boolean().optional(),
});

const ReClusterRequestSchema = z.object({
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  deleteExisting: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  customConfig: ClusteringConfigSchema.optional(),
});

/**
 * Register admin routes for Battle Reports configuration
 */
export function registerAdminBattleReportsRoutes(
  app: FastifyInstance,
  sessionService: SessionService,
  featureRepository: FeatureRepository,
  rulesetRepository: RulesetRepository,
  killmailRepository: KillmailRepository,
  battleRepository: BattleRepository,
): void {
  const appWithTypes = app.withTypeProvider<ZodTypeProvider>();
  const authMiddleware = createAuthMiddleware(sessionService);
  const requireAdmin = createRequireRoleMiddleware('admin');

  // Get ingestion configuration
  appWithTypes.get(
    '/admin/config/ingest',
    {
      schema: {
        tags: ['Admin', 'Battle Reports'],
        summary: 'Get ingestion configuration',
        security: [{ sessionCookie: [] }],
        response: {
          200: z.object({
            ruleset: z.object({
              id: z.string().uuid(),
              minPilots: z.number(),
              trackedAllianceIds: z.array(z.string()),
              trackedCorpIds: z.array(z.string()),
              trackedSystemIds: z.array(z.string()),
              trackedSecurityTypes: z.array(z.string()),
              ignoreUnlisted: z.boolean(),
              updatedAt: z.string(),
            }),
            service: IngestionConfigSchema,
          }),
        },
      },
      preHandler: [authMiddleware, requireAdmin],
    },
    async (_request, reply) => {
      // Get current ruleset
      const ruleset = await rulesetRepository.getActiveRuleset();

      // Get ingestion service config from feature settings
      const settings = await featureRepository.getFeatureSetting('battle-reports', 'ingestion');
      const serviceConfig = (settings?.value as Record<string, unknown>) || {};

      return reply.send({
        ruleset: {
          id: ruleset.id,
          minPilots: ruleset.minPilots,
          trackedAllianceIds: ruleset.trackedAllianceIds.map(String),
          trackedCorpIds: ruleset.trackedCorpIds.map(String),
          trackedSystemIds: ruleset.trackedSystemIds.map(String),
          trackedSecurityTypes: ruleset.trackedSecurityTypes,
          ignoreUnlisted: ruleset.ignoreUnlisted,
          updatedAt: ruleset.updatedAt.toISOString(),
        },
        service: serviceConfig,
      });
    },
  );

  // Update ingestion configuration
  appWithTypes.put(
    '/admin/config/ingest',
    {
      schema: {
        tags: ['Admin', 'Battle Reports'],
        summary: 'Update ingestion configuration',
        security: [{ sessionCookie: [] }],
        body: z.object({
          ruleset: RulesetUpdateSchema.optional(),
          service: IngestionConfigSchema.optional(),
        }),
        response: {
          200: z.object({ success: z.boolean() }),
        },
      },
      preHandler: [authMiddleware, requireAdmin],
    },
    async (request, reply) => {
      const { ruleset: rulesetUpdate, service: serviceUpdate } = request.body;
      const accountId = request.account?.id ?? null;

      // Update ruleset if provided
      if (rulesetUpdate) {
        const current = await rulesetRepository.getActiveRuleset();
        await rulesetRepository.updateActiveRuleset({
          minPilots: rulesetUpdate.minPilots ?? current.minPilots,
          trackedAllianceIds:
            rulesetUpdate.trackedAllianceIds?.map(BigInt) ?? current.trackedAllianceIds,
          trackedCorpIds: rulesetUpdate.trackedCorpIds?.map(BigInt) ?? current.trackedCorpIds,
          trackedSystemIds: rulesetUpdate.trackedSystemIds?.map(BigInt) ?? current.trackedSystemIds,
          trackedSecurityTypes: rulesetUpdate.trackedSecurityTypes ?? current.trackedSecurityTypes,
          ignoreUnlisted: rulesetUpdate.ignoreUnlisted ?? current.ignoreUnlisted,
          updatedBy: accountId,
        });
      }

      // Update service config if provided
      if (serviceUpdate) {
        await featureRepository.setFeatureSetting(
          'battle-reports',
          'ingestion',
          serviceUpdate,
          accountId,
        );
      }

      return reply.send({ success: true });
    },
  );

  // Get clustering configuration
  appWithTypes.get(
    '/admin/config/clusterer',
    {
      schema: {
        tags: ['Admin', 'Battle Reports'],
        summary: 'Get clustering configuration',
        security: [{ sessionCookie: [] }],
        response: {
          200: ClusteringConfigSchema,
        },
      },
      preHandler: [authMiddleware, requireAdmin],
    },
    async (_request, reply) => {
      const settings = await featureRepository.getFeatureSetting('battle-reports', 'clustering');
      const config = (settings?.value as Record<string, unknown>) || {};
      return reply.send(config);
    },
  );

  // Update clustering configuration
  appWithTypes.put(
    '/admin/config/clusterer',
    {
      schema: {
        tags: ['Admin', 'Battle Reports'],
        summary: 'Update clustering configuration',
        security: [{ sessionCookie: [] }],
        body: ClusteringConfigSchema,
        response: {
          200: z.object({ success: z.boolean() }),
        },
      },
      preHandler: [authMiddleware, requireAdmin],
    },
    async (request, reply) => {
      const accountId = request.account?.id ?? null;
      await featureRepository.setFeatureSetting(
        'battle-reports',
        'clustering',
        request.body,
        accountId,
      );
      return reply.send({ success: true });
    },
  );

  // Get ingestion statistics
  appWithTypes.get(
    '/admin/stats/ingest',
    {
      schema: {
        tags: ['Admin', 'Battle Reports'],
        summary: 'Get ingestion statistics',
        security: [{ sessionCookie: [] }],
        response: {
          200: z.object({
            received24h: z.number(),
            accepted24h: z.number(),
            rejected24h: z.number(),
            acceptanceRate: z.number(),
            unprocessedCount: z.number(),
          }),
        },
      },
      preHandler: [authMiddleware, requireAdmin],
    },
    async (_request, reply) => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Get killmail counts
      const received24h = await killmailRepository.countSince(oneDayAgo);
      const unprocessedCount = await killmailRepository.countUnprocessed();

      // For now, we'll estimate acceptance rate as 100% since rejected killmails aren't stored
      // In the future, we could add a rejections counter via metrics
      const accepted24h = received24h;
      const rejected24h = 0;
      const acceptanceRate = received24h > 0 ? 100 : 0;

      return reply.send({
        received24h,
        accepted24h,
        rejected24h,
        acceptanceRate,
        unprocessedCount,
      });
    },
  );

  // Get clustering statistics
  appWithTypes.get(
    '/admin/stats/clusterer',
    {
      schema: {
        tags: ['Admin', 'Battle Reports'],
        summary: 'Get clustering statistics',
        security: [{ sessionCookie: [] }],
        response: {
          200: z.object({
            battlesCreated24h: z.number(),
            unprocessedKillmails: z.number(),
            averageLagMinutes: z.number(),
            lastProcessedAt: z.string().nullable(),
          }),
        },
      },
      preHandler: [authMiddleware, requireAdmin],
    },
    async (_request, reply) => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const battlesCreated24h = await battleRepository.countCreatedSince(oneDayAgo);
      const unprocessedKillmails = await killmailRepository.countUnprocessed();

      // Get average lag (time between killmail occurrence and processing)
      const recentKillmails = await killmailRepository.getRecentProcessed(100);
      let averageLagMinutes = 0;
      if (recentKillmails.length > 0) {
        const totalLag = recentKillmails.reduce((sum, km) => {
          if (km.processedAt) {
            return sum + (km.processedAt.getTime() - km.occurredAt.getTime());
          }
          return sum;
        }, 0);
        averageLagMinutes = totalLag / recentKillmails.length / 1000 / 60;
      }

      const lastProcessed = recentKillmails[0];
      const lastProcessedAt = lastProcessed?.processedAt?.toISOString() || null;

      return reply.send({
        battlesCreated24h,
        unprocessedKillmails,
        averageLagMinutes: Math.round(averageLagMinutes),
        lastProcessedAt,
      });
    },
  );

  // Trigger reclustering
  appWithTypes.post(
    '/admin/battles/recluster',
    {
      schema: {
        tags: ['Admin', 'Battle Reports'],
        summary: 'Trigger battle reclustering',
        security: [{ sessionCookie: [] }],
        body: ReClusterRequestSchema,
        response: {
          200: z.object({
            success: z.boolean(),
            message: z.string(),
            affectedKillmails: z.number(),
            affectedBattles: z.number().optional(),
          }),
        },
      },
      preHandler: [authMiddleware, requireAdmin],
    },
    async (request, reply) => {
      const { startTime, endTime, deleteExisting, dryRun } = request.body;

      // Validate time range
      if (endTime <= startTime) {
        return reply.status(400).send({
          success: false,
          message: 'End time must be after start time',
          affectedKillmails: 0,
        });
      }

      // Get affected counts
      const affectedKillmails = await killmailRepository.countInTimeRange(startTime, endTime);
      const affectedBattles = deleteExisting
        ? await battleRepository.countInTimeRange(startTime, endTime)
        : 0;

      if (dryRun) {
        return reply.send({
          success: true,
          message: 'Dry run completed',
          affectedKillmails,
          affectedBattles,
        });
      }

      // Delete existing battles if requested
      if (deleteExisting && affectedBattles > 0) {
        await battleRepository.deleteInTimeRange(startTime, endTime);
      }

      // Reset processed_at on killmails to trigger reclustering
      await killmailRepository.resetProcessedInTimeRange(startTime, endTime);

      return reply.send({
        success: true,
        message: `Reclustering triggered for ${affectedKillmails} killmails`,
        affectedKillmails,
        affectedBattles,
      });
    },
  );
}
