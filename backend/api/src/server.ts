import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

export const buildServer = (): FastifyInstance => {
  const app = Fastify({ logger: true });

  app.get('/healthz', async () => ({ status: 'ok' }));

  return app;
};

export const start = async (): Promise<void> => {
  const app = buildServer();
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
