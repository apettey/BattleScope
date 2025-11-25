/**
 * Admin routes - proxy to authentication service
 */

import { FastifyInstance } from 'fastify';
import { proxyRequest } from '../lib/proxy';
import { config } from '../config';

export async function adminRoutes(fastify: FastifyInstance) {
  const authServiceUrl = config.services.auth;

  // Get all accounts
  fastify.get('/api/admin/accounts', async (request, reply) => {
    return proxyRequest(request, reply, authServiceUrl, {
      path: '/api/admin/accounts',
    });
  });

  // Update account
  fastify.put<{
    Params: { id: string };
  }>('/api/admin/accounts/:id', async (request, reply) => {
    return proxyRequest(request, reply, authServiceUrl, {
      path: `/api/admin/accounts/${request.params.id}`,
      method: 'PUT',
    });
  });

  // Get all roles
  fastify.get('/api/admin/roles', async (request, reply) => {
    return proxyRequest(request, reply, authServiceUrl, {
      path: '/api/admin/roles',
    });
  });

  // Grant role to account
  fastify.post('/api/admin/roles/grant', async (request, reply) => {
    return proxyRequest(request, reply, authServiceUrl, {
      path: '/api/admin/roles/grant',
      method: 'POST',
    });
  });

  // Get system configuration
  fastify.get('/api/admin/config', async (request, reply) => {
    return proxyRequest(request, reply, authServiceUrl, {
      path: '/api/admin/config',
    });
  });

  // Update system configuration
  fastify.put('/api/admin/config', async (request, reply) => {
    return proxyRequest(request, reply, authServiceUrl, {
      path: '/api/admin/config',
      method: 'PUT',
    });
  });

  // Get audit logs
  fastify.get('/api/admin/audit', async (request, reply) => {
    return proxyRequest(request, reply, authServiceUrl, {
      path: '/api/admin/audit',
    });
  });
}
