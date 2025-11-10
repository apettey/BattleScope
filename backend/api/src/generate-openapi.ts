#!/usr/bin/env tsx
/**
 * Script to generate OpenAPI specification from Fastify routes
 * Usage: pnpm run generate-openapi
 */

import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';
import {
  createMockRepositories,
  createMockDatabase,
  createMockNameEnricher,
  createMockEsiClient,
  createMockAuthServices,
  createMockSearchService,
} from './test-utils.js';
import { buildServer } from './server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function generateOpenApiSpec() {
  console.log('🔧 Building Fastify server...');

  const mockDb = createMockDatabase();
  const mockRepos = createMockRepositories();
  const mockEnricher = createMockNameEnricher();
  const mockEsiClient = createMockEsiClient();
  const mockAuthServices = createMockAuthServices();
  const mockSearchService = createMockSearchService();

  const app = buildServer({
    ...mockRepos,
    ...mockAuthServices,
    db: mockDb,
    esiClient: mockEsiClient,
    searchService: mockSearchService,
    config: {
      port: 3000,
      host: '0.0.0.0',
      corsAllowedOrigins: [],
      developerMode: true,
      esiBaseUrl: 'https://esi.evetech.net/latest/',
      esiDatasource: 'tranquility',
      esiCompatibilityDate: '2025-09-30',
      esiTimeoutMs: 10000,
      esiCacheTtlSeconds: 300,
      eveClientId: 'mock-client-id',
      eveClientSecret: 'mock-client-secret',
      eveCallbackUrl: 'http://localhost:3000/auth/callback',
      eveScopes: ['publicData'],
      encryptionKey: 'mock-encryption-key-32-characters-long',
      typesenseHost: 'localhost',
      typesensePort: 8108,
      typesenseProtocol: 'http' as const,
      typesenseApiKey: 'mock-api-key',
      sessionTtlSeconds: 2592000,
      sessionCookieName: 'battlescope_session',
      sessionCookieSecure: true,
      authzCacheTtlSeconds: 60,
      frontendUrl: 'http://localhost:5173',
    },
    nameEnricher: mockEnricher,
  });

  await app.ready();

  console.log('📝 Generating OpenAPI specification...');

  const spec = app.swagger();

  // Write JSON version
  const jsonPath = join(__dirname, '../../../docs/openapi.json');
  await writeFile(jsonPath, JSON.stringify(spec, null, 2), 'utf8');
  console.log(`✅ JSON spec written to: ${jsonPath}`);

  // Write YAML version
  const yamlPath = join(__dirname, '../../../docs/openapi-generated.yaml');
  const yamlContent = yaml.stringify(spec);
  await writeFile(yamlPath, yamlContent, 'utf8');
  console.log(`✅ YAML spec written to: ${yamlPath}`);

  await app.close();

  console.log('✨ OpenAPI generation complete!');
}

generateOpenApiSpec().catch((error) => {
  console.error('❌ Failed to generate OpenAPI spec:', error);
  process.exit(1);
});
