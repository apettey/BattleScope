/**
 * Intel routes - proxy to ingestion service
 */

import { FastifyInstance } from 'fastify';
import { proxyRequest } from '../lib/proxy';
import { config } from '../config';

export async function intelRoutes(fastify: FastifyInstance) {
  const ingestionServiceUrl = config.services.ingestion;

  // Get live killmails (recent intel)
  fastify.get('/api/intel/live', async (request, reply) => {
    return proxyRequest(request, reply, ingestionServiceUrl, {
      path: '/api/intel/live',
      cache: true,
      cacheTTL: 30, // Cache for 30 seconds (more frequent updates)
    });
  });

  // Get killmail details
  fastify.get<{
    Params: { id: string };
  }>('/api/intel/killmails/:id', async (request, reply) => {
    return proxyRequest(request, reply, ingestionServiceUrl, {
      path: `/api/intel/killmails/${request.params.id}`,
      cache: true,
      cacheTTL: 300, // Cache for 5 minutes (killmails don't change)
    });
  });

  // Get character ship history
  fastify.get<{
    Params: { characterId: string };
  }>('/api/intel/characters/:characterId/ships', async (request, reply) => {
    return proxyRequest(request, reply, ingestionServiceUrl, {
      path: `/api/intel/characters/${request.params.characterId}/ships`,
      cache: true,
      cacheTTL: 180, // Cache for 3 minutes
    });
  });
}
