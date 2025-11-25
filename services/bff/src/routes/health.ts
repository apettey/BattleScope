/**
 * Health check routes - aggregate status from all backend services
 */

import { FastifyInstance } from 'fastify';
import axios from 'axios';
import { config } from '../config';
import { createLogger } from '@battlescope/logger';

const logger = createLogger({ serviceName: 'bff' });

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTime?: number;
  error?: string;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: ServiceHealth[];
}

/**
 * Check health of a single service
 */
async function checkServiceHealth(
  name: string,
  url: string
): Promise<ServiceHealth> {
  const startTime = Date.now();

  try {
    const response = await axios.get(`${url}/health`, {
      timeout: 5000,
      validateStatus: () => true,
    });

    const responseTime = Date.now() - startTime;

    if (response.status === 200) {
      return {
        name,
        status: 'healthy',
        responseTime,
      };
    }

    return {
      name,
      status: 'unhealthy',
      responseTime,
      error: `HTTP ${response.status}`,
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;

    return {
      name,
      status: 'unhealthy',
      responseTime,
      error: error.message || 'Connection failed',
    };
  }
}

export async function healthRoutes(fastify: FastifyInstance) {
  // Comprehensive health check - check all backend services
  fastify.get('/api/health', async (request, reply) => {
    logger.debug('Starting health check for all services');

    const healthChecks = await Promise.all([
      checkServiceHealth('auth', config.services.auth),
      checkServiceHealth('battle', config.services.battle),
      checkServiceHealth('ingestion', config.services.ingestion),
      checkServiceHealth('search', config.services.search),
      checkServiceHealth('notification', config.services.notification),
    ]);

    const healthyCount = healthChecks.filter(
      (check) => check.status === 'healthy'
    ).length;
    const totalCount = healthChecks.length;

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';

    if (healthyCount === totalCount) {
      overallStatus = 'healthy';
    } else if (healthyCount > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'unhealthy';
    }

    const response: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: healthChecks,
    };

    logger.debug({
      status: overallStatus,
      healthy: healthyCount,
      total: totalCount
    }, 'Health check completed');

    // Return appropriate HTTP status code
    if (overallStatus === 'healthy') {
      reply.status(200);
    } else if (overallStatus === 'degraded') {
      reply.status(200); // Still operational
    } else {
      reply.status(503); // Service unavailable
    }

    return response;
  });

  // Simple liveness check for BFF itself
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'healthy',
      service: 'bff',
      timestamp: new Date().toISOString(),
    };
  });

  // Cache statistics endpoint
  fastify.get('/api/health/cache', async (request, reply) => {
    const { getCache } = await import('../lib/proxy');
    const cache = getCache();

    return {
      enabled: config.cache.enabled,
      ttl: config.cache.ttl,
      stats: cache.getStats(),
    };
  });
}
