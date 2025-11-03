import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KillmailEnrichmentRepository } from '@battlescope/database';
import { KillmailEnrichmentService } from '../src/enrichment-service';

type MockSpan = {
  setAttribute: (key: string, value: unknown) => void;
  recordException: (error: unknown) => void;
  setStatus: (status: unknown) => void;
  end: () => void;
};

const createMockSpan = (): MockSpan => ({
  setAttribute: vi.fn<[string, unknown], void>(),
  recordException: vi.fn<[unknown], void>(),
  setStatus: vi.fn<[unknown], void>(),
  end: vi.fn<[], void>(),
});

vi.mock('@opentelemetry/api', () => ({
  SpanStatusCode: { ERROR: 2 },
  trace: {
    getTracer: () => ({
      startActiveSpan: (_name: string, fn: (span: MockSpan) => Promise<void>) =>
        fn(createMockSpan()),
    }),
  },
}));

describe('KillmailEnrichmentService', () => {
  const repositoryMocks = {
    upsertPending: vi.fn(),
    markProcessing: vi.fn(),
    markSucceeded: vi.fn(),
    markFailed: vi.fn(),
  };

  const source = {
    fetchKillmail: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    for (const fn of Object.values(repositoryMocks)) {
      fn.mockReset();
    }
    source.fetchKillmail.mockReset();
  });

  it('processes killmail data successfully', async () => {
    source.fetchKillmail.mockResolvedValue({ foo: 'bar' });

    const service = new KillmailEnrichmentService(
      repositoryMocks as unknown as KillmailEnrichmentRepository,
      source,
      0,
    );

    await service.process(123);

    expect(repositoryMocks.upsertPending).toHaveBeenCalledWith(123);
    expect(repositoryMocks.markProcessing).toHaveBeenCalledWith(123);
    expect(repositoryMocks.markSucceeded).toHaveBeenCalledWith(
      123,
      { foo: 'bar' },
      expect.any(Date),
    );
    expect(repositoryMocks.markFailed).not.toHaveBeenCalled();
  });

  it('marks failures when source throws', async () => {
    source.fetchKillmail.mockRejectedValue(new Error('rate limit'));

    const service = new KillmailEnrichmentService(
      repositoryMocks as unknown as KillmailEnrichmentRepository,
      source,
      0,
    );

    await expect(service.process(999)).rejects.toThrow('rate limit');

    expect(repositoryMocks.markFailed).toHaveBeenCalledWith(999, 'rate limit');
    expect(repositoryMocks.markSucceeded).not.toHaveBeenCalled();
  });

  it('respects throttle delay before fetching', async () => {
    vi.useFakeTimers();
    const times: number[] = [];
    repositoryMocks.upsertPending.mockResolvedValue(undefined);
    repositoryMocks.markProcessing.mockResolvedValue(undefined);
    repositoryMocks.markSucceeded.mockResolvedValue(undefined);
    repositoryMocks.markFailed.mockResolvedValue(undefined);

    source.fetchKillmail.mockImplementation(async () => {
      times.push(Date.now());
      return { foo: 'bar' };
    });

    const service = new KillmailEnrichmentService(
      repositoryMocks as unknown as KillmailEnrichmentRepository,
      source,
      100,
    );

    const startTime = Date.now();
    const promise = service.process(555);
    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(times).toHaveLength(1);
    expect(times[0] - startTime).toBeGreaterThanOrEqual(100);
  });
});
