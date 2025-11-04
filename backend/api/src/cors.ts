import type { FastifyReply, FastifyRequest } from 'fastify';

export type ResolveCorsOrigin = (origin?: string) => string | false | undefined;

export const ensureCorsHeaders = (
  request: FastifyRequest,
  reply: FastifyReply,
  resolveCorsOrigin: ResolveCorsOrigin,
) => {
  const origin = request.headers.origin;
  if (!origin) {
    return;
  }

  const resolvedOrigin = resolveCorsOrigin(origin);
  if (resolvedOrigin === false) {
    return;
  }

  const allowedOrigin = resolvedOrigin ?? origin;
  void reply.header('access-control-allow-origin', allowedOrigin);
  void reply.header('access-control-allow-credentials', 'true');
  reply.raw.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');

  const varyHeader = reply.getHeader('vary');
  if (!varyHeader) {
    void reply.header('vary', 'Origin');
    reply.raw.setHeader('vary', 'Origin');
    return;
  }

  if (typeof varyHeader === 'string') {
    const varyValues = varyHeader
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0);
    if (!varyValues.includes('origin')) {
      const next = `${varyHeader}, Origin`;
      void reply.header('vary', next);
      reply.raw.setHeader('vary', next);
    }
    return;
  }

  if (Array.isArray(varyHeader)) {
    const lowerValues = varyHeader.map((value) => value.toLowerCase());
    if (!lowerValues.includes('origin')) {
      const next = [...varyHeader, 'Origin'];
      void reply.header('vary', next);
      reply.raw.setHeader('vary', next.join(', '));
    }
  }
};
