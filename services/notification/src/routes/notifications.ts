import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NotificationsRepository } from '../database';
import { requireAuth, getUserId, AuthenticatedRequest } from '../lib/auth';

const NotificationsListQuerySchema = z.object({
  limit: z.string().optional().default('50'),
  offset: z.string().optional().default('0'),
});

export async function notificationsRoutes(
  app: FastifyInstance,
  options: { notificationsRepo: NotificationsRepository }
) {
  const { notificationsRepo } = options;

  // Get user's notifications (paginated)
  app.get(
    '/api/notifications',
    {
      preHandler: requireAuth,
    },
    async (request: AuthenticatedRequest, reply) => {
      try {
        const userId = getUserId(request);
        const query = NotificationsListQuerySchema.parse(request.query);

        const limit = parseInt(query.limit, 10);
        const offset = parseInt(query.offset, 10);

        const [notifications, total, unreadCount] = await Promise.all([
          notificationsRepo.findByUserId(userId, limit, offset),
          notificationsRepo.countByUserId(userId),
          notificationsRepo.countUnreadByUserId(userId),
        ]);

        return reply.send({
          notifications,
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + notifications.length < total,
          },
          unreadCount,
        });
      } catch (error) {
        request.log.error({ error }, 'Error fetching notifications');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to fetch notifications',
        });
      }
    }
  );

  // Mark notification as read
  app.post(
    '/api/notifications/:id/read',
    {
      preHandler: requireAuth,
    },
    async (request: AuthenticatedRequest, reply) => {
      try {
        const userId = getUserId(request);
        const { id } = request.params as { id: string };

        // Verify notification belongs to user
        const notification = await notificationsRepo.findById(id);

        if (!notification) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Notification not found',
          });
        }

        if (notification.user_id !== userId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Access denied',
          });
        }

        if (notification.read_at) {
          return reply.send({
            message: 'Already marked as read',
            notification,
          });
        }

        const updated = await notificationsRepo.markAsRead(id);

        return reply.send({
          message: 'Notification marked as read',
          notification: updated,
        });
      } catch (error) {
        request.log.error({ error }, 'Error marking notification as read');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to mark notification as read',
        });
      }
    }
  );

  // Mark all notifications as read
  app.post(
    '/api/notifications/read-all',
    {
      preHandler: requireAuth,
    },
    async (request: AuthenticatedRequest, reply) => {
      try {
        const userId = getUserId(request);

        const count = await notificationsRepo.markAllAsRead(userId);

        return reply.send({
          message: 'All notifications marked as read',
          count,
        });
      } catch (error) {
        request.log.error({ error }, 'Error marking all notifications as read');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to mark all notifications as read',
        });
      }
    }
  );

  // Delete notification (soft delete)
  app.delete(
    '/api/notifications/:id',
    {
      preHandler: requireAuth,
    },
    async (request: AuthenticatedRequest, reply) => {
      try {
        const userId = getUserId(request);
        const { id } = request.params as { id: string };

        // Verify notification belongs to user
        const notification = await notificationsRepo.findById(id);

        if (!notification) {
          return reply.status(404).send({
            error: 'Not Found',
            message: 'Notification not found',
          });
        }

        if (notification.user_id !== userId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Access denied',
          });
        }

        await notificationsRepo.softDelete(id);

        return reply.send({
          message: 'Notification deleted',
        });
      } catch (error) {
        request.log.error({ error }, 'Error deleting notification');
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to delete notification',
        });
      }
    }
  );
}
