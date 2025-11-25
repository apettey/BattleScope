/**
 * Notification routes - proxy to notification service
 */

import { FastifyInstance } from 'fastify';
import { proxyRequest } from '../lib/proxy';
import { config } from '../config';

export async function notificationRoutes(fastify: FastifyInstance) {
  const notificationServiceUrl = config.services.notification;

  // Get user notifications
  fastify.get('/api/notifications', async (request, reply) => {
    return proxyRequest(request, reply, notificationServiceUrl, {
      path: '/api/notifications',
      cache: false, // Don't cache notifications (real-time data)
    });
  });

  // Mark notification as read
  fastify.post<{
    Params: { id: string };
  }>('/api/notifications/:id/read', async (request, reply) => {
    return proxyRequest(request, reply, notificationServiceUrl, {
      path: `/api/notifications/${request.params.id}/read`,
      method: 'POST',
    });
  });

  // Mark all notifications as read
  fastify.post('/api/notifications/read-all', async (request, reply) => {
    return proxyRequest(request, reply, notificationServiceUrl, {
      path: '/api/notifications/read-all',
      method: 'POST',
    });
  });

  // Delete notification
  fastify.delete<{
    Params: { id: string };
  }>('/api/notifications/:id', async (request, reply) => {
    return proxyRequest(request, reply, notificationServiceUrl, {
      path: `/api/notifications/${request.params.id}`,
      method: 'DELETE',
    });
  });
}
