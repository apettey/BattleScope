/**
 * Authentication routes - proxy to authentication service
 */

import { FastifyInstance } from 'fastify';
import { proxyRequest } from '../lib/proxy';
import { config } from '../config';

export async function authRoutes(fastify: FastifyInstance) {
  const authServiceUrl = config.services.auth;

  // Get current user profile
  fastify.get('/api/me', async (request, reply) => {
    return proxyRequest(request, reply, authServiceUrl, {
      path: '/me',
    });
  });

  // Get user's linked characters
  fastify.get('/api/me/characters', async (request, reply) => {
    return proxyRequest(request, reply, authServiceUrl, {
      path: '/me/characters',
    });
  });

  // Link a new character via EVE SSO - GET to initiate SSO
  fastify.get('/api/me/characters/link', async (request, reply) => {
    return proxyRequest(request, reply, authServiceUrl, {
      path: '/me/characters/link',
    });
  });

  // Character linking callback
  fastify.get('/api/me/characters/link/callback', async (request, reply) => {
    return proxyRequest(request, reply, authServiceUrl, {
      path: '/me/characters/link/callback',
    });
  });

  // Set primary character
  fastify.post('/api/me/characters/primary', async (request, reply) => {
    return proxyRequest(request, reply, authServiceUrl, {
      path: '/me/characters/primary',
      method: 'POST',
    });
  });

  // Unlink a character
  fastify.delete<{
    Params: { id: string };
  }>('/api/me/characters/:id', async (request, reply) => {
    return proxyRequest(request, reply, authServiceUrl, {
      path: `/me/characters/${request.params.id}`,
      method: 'DELETE',
    });
  });

  // EVE SSO login
  fastify.get('/api/auth/login', async (request, reply) => {
    return proxyRequest(request, reply, authServiceUrl, {
      path: '/auth/login',
    });
  });

  // EVE SSO callback
  fastify.get('/api/auth/callback', async (request, reply) => {
    return proxyRequest(request, reply, authServiceUrl, {
      path: '/auth/callback',
    });
  });

  // Logout
  fastify.post('/api/auth/logout', async (request, reply) => {
    return proxyRequest(request, reply, authServiceUrl, {
      path: '/auth/logout',
      method: 'POST',
    });
  });
}
