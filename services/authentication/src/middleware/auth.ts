import type { FastifyRequest, FastifyReply } from 'fastify';
import * as session from '../lib/session';

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      accountId: string;
      characterId: string;
    };
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const cookieName = process.env.SESSION_COOKIE_NAME || 'battlescope_session';
  const sessionId = request.cookies[cookieName];

  request.log.info({
    url: request.url,
    cookieName,
    hasSessionId: !!sessionId,
    sessionId: sessionId?.substring(0, 20) + '...',
    allCookies: Object.keys(request.cookies),
    rawCookieHeader: request.headers.cookie?.substring(0, 100),
  }, 'Auth middleware check');

  if (!sessionId) {
    request.log.warn({ cookieName, availableCookies: Object.keys(request.cookies) }, 'No session ID found in cookies');
    reply.code(401).send({ error: 'Authentication required' });
    return;
  }

  const sessionData = await session.getSession(sessionId);

  request.log.info({
    sessionId: sessionId?.substring(0, 20) + '...',
    hasSessionData: !!sessionData,
    sessionData: sessionData ? { accountId: sessionData.accountId, characterId: sessionData.characterId } : null,
  }, 'Session lookup result');

  if (!sessionData) {
    request.log.warn({ sessionId: sessionId?.substring(0, 20) + '...' }, 'Session not found in Redis');
    reply.code(401).send({ error: 'Invalid or expired session' });
    return;
  }

  // Attach user data to request
  request.user = {
    accountId: sessionData.accountId,
    characterId: sessionData.characterId,
  };
}
