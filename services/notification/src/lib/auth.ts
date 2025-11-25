import { FastifyRequest, FastifyReply } from 'fastify';
import { createLogger } from '@battlescope/logger';

const logger = createLogger('auth-middleware');

// Extended request with user info
export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    userId: string;
    characterId: number;
    characterName: string;
  };
}

// Middleware to require authentication
export async function requireAuth(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  try {
    // In a real implementation, verify session cookie or JWT
    // For now, we'll check for a user ID in the session/cookie

    // Check session cookie (set by authentication service)
    const sessionCookie = request.cookies['battlescope_session'];

    if (!sessionCookie) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    // In production, validate session with Redis or auth service
    // For now, we'll decode a simple structure
    try {
      const sessionData = JSON.parse(
        Buffer.from(sessionCookie, 'base64').toString('utf-8')
      );

      request.user = {
        userId: sessionData.userId,
        characterId: sessionData.characterId,
        characterName: sessionData.characterName,
      };
    } catch (error) {
      logger.error('Invalid session cookie', { error });
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid session',
      });
    }
  } catch (error) {
    logger.error('Auth middleware error', { error });
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Authentication check failed',
    });
  }
}

// Extract user ID from request (after auth middleware)
export function getUserId(request: AuthenticatedRequest): string {
  if (!request.user?.userId) {
    throw new Error('User not authenticated');
  }
  return request.user.userId;
}
