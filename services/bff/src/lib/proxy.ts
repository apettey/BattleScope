/**
 * Generic proxy helper for forwarding requests to backend services
 */

import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { FastifyRequest, FastifyReply } from 'fastify';
import { createLogger } from '@battlescope/logger';
import { config } from '../config';
import { SimpleCache } from './cache';

const logger = createLogger({ serviceName: 'bff' });

const cache = new SimpleCache(config.cache.ttl);

interface ProxyOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path?: string;
  body?: any;
  headers?: Record<string, string>;
  cache?: boolean;
  cacheTTL?: number;
}

/**
 * Forward cookies from the incoming request to the backend service
 */
function extractCookies(request: FastifyRequest): string | undefined {
  const cookieHeader = request.headers.cookie;
  return cookieHeader;
}

/**
 * Proxy a request to a backend service
 */
export async function proxyRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  serviceUrl: string,
  options: ProxyOptions = {}
): Promise<any> {
  const {
    method = request.method as any,
    path = request.url,
    body = request.body,
    headers = {},
    cache: enableCache = false,
    cacheTTL,
  } = options;

  // Generate cache key for GET requests
  const cacheKey = method === 'GET'
    ? SimpleCache.generateKey(method, `${serviceUrl}${path}`, request.query)
    : null;

  // Check cache for GET requests
  if (enableCache && cacheKey && config.cache.enabled) {
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
      logger.debug({ cacheKey }, 'Cache hit');
      return cachedResponse;
    }
  }

  // Prepare request configuration
  const axiosConfig: AxiosRequestConfig = {
    method,
    url: `${serviceUrl}${path}`,
    timeout: config.requestTimeout,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true, // Don't throw on any status code
    maxRedirects: 0, // Don't follow redirects - pass them through to client
  };

  // Forward cookies for authentication
  const cookies = extractCookies(request);
  logger.info({
    url: axiosConfig.url,
    hasCookies: !!cookies,
    cookieCount: cookies?.split(';').length || 0,
    cookies: cookies?.substring(0, 100) // Log first 100 chars for debugging
  }, 'Cookie forwarding');
  if (cookies) {
    axiosConfig.headers!['Cookie'] = cookies;
  }

  // Add body for non-GET requests
  if (method !== 'GET' && body) {
    axiosConfig.data = body;
  }

  // Add query parameters for GET requests
  if (method === 'GET' && request.query) {
    axiosConfig.params = request.query;
  }

  try {
    logger.debug({
      method,
      url: axiosConfig.url,
      params: axiosConfig.params
    }, 'Proxying request');

    const response: AxiosResponse = await axios(axiosConfig);

    // Forward set-cookie headers from backend
    const setCookieHeader = response.headers['set-cookie'];
    logger.info({
      url: axiosConfig.url,
      status: response.status,
      hasSetCookie: !!setCookieHeader,
      setCookieCount: Array.isArray(setCookieHeader) ? setCookieHeader.length : (setCookieHeader ? 1 : 0),
      setCookieHeaders: setCookieHeader
    }, 'Set-Cookie response');
    if (setCookieHeader) {
      reply.header('set-cookie', setCookieHeader);
    }

    // Forward location header for redirects
    const locationHeader = response.headers['location'];
    if (locationHeader) {
      reply.header('location', locationHeader);
    }

    // Cache successful GET responses
    if (enableCache && cacheKey && response.status === 200 && config.cache.enabled) {
      cache.set(cacheKey, response.data, cacheTTL);
      logger.debug({ cacheKey, ttl: cacheTTL || config.cache.ttl }, 'Cached response');
    }

    // Forward status code
    reply.status(response.status);

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      logger.error({
        error: axiosError.message,
        url: axiosConfig.url,
        status: axiosError.response?.status
      }, 'Proxy request failed');

      if (axiosError.response) {
        reply.status(axiosError.response.status);
        return axiosError.response.data;
      }

      // Network error or timeout
      reply.status(503);
      return {
        error: 'Service Unavailable',
        message: 'Backend service is not responding',
      };
    }

    logger.error({ error }, 'Unexpected proxy error');
    reply.status(500);
    return {
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    };
  }
}

/**
 * Aggregate data from multiple services
 */
export async function aggregateRequests<T>(
  requests: Array<Promise<T>>
): Promise<T[]> {
  try {
    return await Promise.all(requests);
  } catch (error) {
    logger.error({ error }, 'Failed to aggregate requests');
    throw error;
  }
}

/**
 * Get cache instance for manual cache operations
 */
export function getCache(): SimpleCache {
  return cache;
}
