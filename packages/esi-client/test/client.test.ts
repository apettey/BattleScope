import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { EsiClient } from '../src/client.js';
import { InMemoryCache } from '../src/cache.js';
import { UnauthorizedAPIToken, EsiHttpError } from '../src/errors.js';

describe('EsiClient', () => {
  let agent: MockAgent;
  let previousDispatcher: ReturnType<typeof getGlobalDispatcher>;

  beforeAll(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
    previousDispatcher = getGlobalDispatcher();
    setGlobalDispatcher(agent);
  });

  afterAll(async () => {
    setGlobalDispatcher(previousDispatcher);
    await agent.close();
  });

  afterEach(() => {
    agent.assertNoPendingInterceptors();
  });

  const buildClient = () =>
    new EsiClient({
      cache: new InMemoryCache(),
      cacheTtlMs: 60_000,
    });

  it('fetches universe names and caches subsequent lookups', async () => {
    const mock = agent.get('https://esi.evetech.net');
    mock
      .intercept({
        path: '/latest/universe/names?datasource=tranquility&compatibility_date=2025-09-30',
        method: 'POST',
        body: JSON.stringify([123]),
      })
      .reply(() => ({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        data: JSON.stringify([{ id: 123, name: 'Example Alliance', category: 'alliance' }]),
      }));

    const client = buildClient();
    const first = await client.getUniverseNames([123]);
    expect(first.get(123)?.name).toBe('Example Alliance');

    // Second call should be served from cache and therefore require no interceptor.
    const second = await client.getUniverseNames([123]);
    expect(second.get(123)?.name).toBe('Example Alliance');
  });

  it('throws UnauthorizedAPIToken for 403 responses', async () => {
    const mock = agent.get('https://esi.evetech.net');
    mock
      .intercept({
        path: '/latest/universe/names?datasource=tranquility&compatibility_date=2025-09-30',
        method: 'POST',
        body: JSON.stringify([456]),
      })
      .reply(() => ({
        statusCode: 403,
        headers: { 'content-type': 'application/json' },
        data: JSON.stringify({ error: 'forbidden' }),
      }));

    const client = buildClient();
    await expect(client.getUniverseNames([456])).rejects.toBeInstanceOf(UnauthorizedAPIToken);
  });

  it('wraps non-success responses in EsiHttpError', async () => {
    const mock = agent.get('https://esi.evetech.net');
    mock
      .intercept({
        path: '/latest/universe/names?datasource=tranquility&compatibility_date=2025-09-30',
        method: 'POST',
        body: JSON.stringify([789]),
      })
      .reply(() => ({
        statusCode: 500,
        headers: { 'content-type': 'application/json' },
        data: JSON.stringify({ error: 'internal' }),
      }));

    const client = buildClient();
    await expect(client.getUniverseNames([789])).rejects.toBeInstanceOf(EsiHttpError);
  });
});
