/**
 * Battle routes - proxy to battle service
 */

import { FastifyInstance } from 'fastify';
import { proxyRequest } from '../lib/proxy';
import { config } from '../config';

export async function battleRoutes(fastify: FastifyInstance) {
  const battleServiceUrl = config.services.battle;

  // Get all battles with pagination and filters
  fastify.get('/api/battles', async (request, reply) => {
    return proxyRequest(request, reply, battleServiceUrl, {
      path: '/api/battles',
      cache: true, // Enable caching for battle list
      cacheTTL: 60, // Cache for 1 minute
    });
  });

  // Get specific battle details
  fastify.get<{
    Params: { id: string };
  }>('/api/battles/:id', async (request, reply) => {
    return proxyRequest(request, reply, battleServiceUrl, {
      path: `/api/battles/${request.params.id}`,
      cache: true,
      cacheTTL: 120, // Cache for 2 minutes
    });
  });

  // Get battle participants
  fastify.get<{
    Params: { id: string };
  }>('/api/battles/:id/participants', async (request, reply) => {
    return proxyRequest(request, reply, battleServiceUrl, {
      path: `/api/battles/${request.params.id}/participants`,
      cache: true,
      cacheTTL: 120,
    });
  });

  // Get battle timeline
  fastify.get<{
    Params: { id: string };
  }>('/api/battles/:id/timeline', async (request, reply) => {
    return proxyRequest(request, reply, battleServiceUrl, {
      path: `/api/battles/${request.params.id}/timeline`,
      cache: true,
      cacheTTL: 120,
    });
  });
}
