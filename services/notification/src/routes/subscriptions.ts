import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SubscriptionsRepository } from '../database';
import { requireAuth, getUserId, AuthenticatedRequest } from '../lib/auth';

const CreateSubscriptionSchema = z.object({
  subscription_type: z.enum(['character', 'corporation', 'alliance', 'system', 'region']),
  filter_value: z.number().optional(),
  notification_channels: z
    .array(z.enum(['websocket', 'webhook', 'email']))
    .default(['websocket']),
  webhook_url: z.string().url().optional(),
});

const UpdateSubscriptionSchema = z.object({
  subscription_type: z.enum(['character', 'corporation', 'alliance', 'system', 'region']).optional(),
  filter_value: z.number().optional(),
  notification_channels: z
    .array(z.enum(['websocket', 'webhook', 'email']))
    .optional(),
  webhook_url: z.string().url().optional(),
  is_active: z.boolean().optional(),
});

export async function subscriptionsRoutes(
  app: FastifyInstance,
  options: { subscriptionsRepo: SubscriptionsRepository }
) {
  const { subscriptionsRepo } = options;

  // Get user's subscriptions
  app.get(
    '/api/subscriptions',
    {
      preHandler: requireAuth,
    },
    async (request: AuthenticatedRequest, reply) => {
      try {
        const userId = getUserId(request);

        const subscriptions = await subscriptionsRepo.findByUserId(userId);

        return reply.send({
          subscriptions,
        });
      } catch (error) {
        request.log.error({ error }, 'Error fetching subscriptions');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch subscriptions',
        });
      }
    }
  );

  // Create subscription
  app.post(
    '/api/subscriptions',
    {
      preHandler: requireAuth,
    },
    async (request: AuthenticatedRequest, reply) => {
      try {
        const userId = getUserId(request);
        const body = CreateSubscriptionSchema.parse(request.body);

        // Validate webhook URL if webhook channel is selected
        if (
          body.notification_channels.includes('webhook') &&
          !body.webhook_url
        ) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Webhook URL required when webhook channel is selected',
          });
        }

        const subscription = await subscriptionsRepo.create({
          user_id: userId,
          subscription_type: body.subscription_type,
          filter_value: body.filter_value || null,
          notification_channels: body.notification_channels,
          webhook_url: body.webhook_url || null,
          is_active: true,
        });

        return reply.status(201).send({
          message: 'Subscription created',
          subscription,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Invalid subscription data',
            details: error.errors,
          });
        }

        request.log.error({ error }, 'Error creating subscription');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to create subscription',
        });
      }
    }
  );

  // Update subscription
  app.put(
    '/api/subscriptions/:id',
    {
      preHandler: requireAuth,
    },
    async (request: AuthenticatedRequest, reply) => {
      try {
        const userId = getUserId(request);
        const { id } = request.params as { id: string };
        const body = UpdateSubscriptionSchema.parse(request.body);

        // Verify subscription belongs to user
        const existing = await subscriptionsRepo.findById(id);

        if (!existing) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Subscription not found',
          });
        }

        if (existing.user_id !== userId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Access denied',
          });
        }

        // Validate webhook URL if webhook channel is selected
        if (
          body.notification_channels?.includes('webhook') &&
          !body.webhook_url &&
          !existing.webhook_url
        ) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Webhook URL required when webhook channel is selected',
          });
        }

        const subscription = await subscriptionsRepo.update(id, body);

        return reply.send({
          message: 'Subscription updated',
          subscription,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Invalid subscription data',
            details: error.errors,
          });
        }

        request.log.error({ error }, 'Error updating subscription');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update subscription',
        });
      }
    }
  );

  // Delete subscription
  app.delete(
    '/api/subscriptions/:id',
    {
      preHandler: requireAuth,
    },
    async (request: AuthenticatedRequest, reply) => {
      try {
        const userId = getUserId(request);
        const { id } = request.params as { id: string };

        // Verify subscription belongs to user
        const existing = await subscriptionsRepo.findById(id);

        if (!existing) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Subscription not found',
          });
        }

        if (existing.user_id !== userId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Access denied',
          });
        }

        await subscriptionsRepo.delete(id);

        return reply.send({
          message: 'Subscription deleted',
        });
      } catch (error) {
        request.log.error({ error }, 'Error deleting subscription');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to delete subscription',
        });
      }
    }
  );
}
