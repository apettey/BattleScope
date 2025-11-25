/**
 * Stats routes - proxy to ingestion service
 */

import { FastifyInstance } from 'fastify';
import { proxyRequest } from '../lib/proxy';
import { config } from '../config';

export async function statsRoutes(fastify: FastifyInstance) {
  const ingestionServiceUrl = config.services.ingestion;

  // Get summary statistics
  fastify.get('/api/stats/summary', async (request, reply) => {
    return proxyRequest(request, reply, ingestionServiceUrl, {
      path: '/api/stats',
      cache: true,
      cacheTTL: 30, // Cache for 30 seconds since stats change frequently
    });
  });

  // Also support the base stats endpoint
  fastify.get('/api/stats', async (request, reply) => {
    return proxyRequest(request, reply, ingestionServiceUrl, {
      path: '/api/stats',
      cache: true,
      cacheTTL: 30,
    });
  });
}
