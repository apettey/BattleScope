/**
 * Search routes - proxy to search service
 */

import { FastifyInstance } from 'fastify';
import { proxyRequest } from '../lib/proxy';
import { config } from '../config';

export async function searchRoutes(fastify: FastifyInstance) {
  const searchServiceUrl = config.services.search;

  // Universal search endpoint
  fastify.get('/api/search', async (request, reply) => {
    return proxyRequest(request, reply, searchServiceUrl, {
      path: '/api/search',
      cache: true,
      cacheTTL: 60, // Cache search results for 1 minute
    });
  });
}
