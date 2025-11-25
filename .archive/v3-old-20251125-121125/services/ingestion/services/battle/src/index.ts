import Fastify from 'fastify';
import cors from '@fastify/cors';

const fastify = Fastify({ logger: true });

fastify.register(cors);

fastify.get('/health', async () => ({
  status: 'healthy',
  service: 'battle-service',
  version: '3.0.0'
}));

fastify.listen({ port: 3004, host: '0.0.0.0' });
