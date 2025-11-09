import { describe, expect, it, vi } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { createRequireSuperAdminMiddleware } from '../../src/middleware/auth-middleware.js';
import type { AuthenticatedRequest } from '../../src/middleware/auth-middleware.js';

describe('createRequireSuperAdminMiddleware', () => {
  const createMockRequest = (account?: {
    id: string;
    isSuperAdmin: boolean;
    roles: Map<string, number>;
  }): FastifyRequest => {
    const request = {
      log: {
        warn: vi.fn(),
      },
    } as unknown as FastifyRequest;

    if (account) {
      (request as AuthenticatedRequest).account = account;
    }

    return request;
  };

  const createMockReply = () => {
    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    return reply;
  };

  it('should allow access for SuperAdmin users', async () => {
    const middleware = createRequireSuperAdminMiddleware();
    const request = createMockRequest({
      id: 'user-123',
      isSuperAdmin: true,
      roles: new Map(),
    });
    const reply = createMockReply();

    await middleware(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('should deny access for non-SuperAdmin users', async () => {
    const middleware = createRequireSuperAdminMiddleware();
    const request = createMockRequest({
      id: 'user-456',
      isSuperAdmin: false,
      roles: new Map([['battle-reports', 40]]), // Admin role
    });
    const reply = createMockReply();

    await middleware(request, reply);

    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      statusCode: 403,
      error: 'Forbidden',
      message: 'SuperAdmin access required',
    });
  });

  it('should deny access for unauthenticated requests', async () => {
    const middleware = createRequireSuperAdminMiddleware();
    const request = createMockRequest(); // No account attached
    const reply = createMockReply();

    await middleware(request, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  });

  it('should log warning when non-SuperAdmin attempts access', async () => {
    const middleware = createRequireSuperAdminMiddleware();
    const request = createMockRequest({
      id: 'user-789',
      isSuperAdmin: false,
      roles: new Map(),
    });
    const reply = createMockReply();

    await middleware(request, reply);

    expect(request.log.warn).toHaveBeenCalledWith(
      {
        accountId: 'user-789',
      },
      'SuperAdmin access denied',
    );
  });

  it('should allow SuperAdmin even with no feature roles', async () => {
    const middleware = createRequireSuperAdminMiddleware();
    const request = createMockRequest({
      id: 'superadmin-000',
      isSuperAdmin: true,
      roles: new Map(), // No feature roles
    });
    const reply = createMockReply();

    await middleware(request, reply);

    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});
