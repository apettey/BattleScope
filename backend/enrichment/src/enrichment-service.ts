import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { KillmailEnrichmentRepository } from '@battlescope/database';

const tracer = trace.getTracer('battlescope.enrichment');

export interface KillmailEnrichmentSource {
  fetchKillmail(killmailId: number): Promise<Record<string, unknown>>;
}

export class ZKillboardSource implements KillmailEnrichmentSource {
  constructor(
    private readonly userAgent = 'BattleScope-Enrichment/1.0 (+https://battlescope.app)',
  ) {}

  async fetchKillmail(killmailId: number): Promise<Record<string, unknown>> {
    const response = await fetch(`https://zkillboard.com/api/killID/${killmailId}/`, {
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch killmail ${killmailId}: ${response.status}`);
    }

    const body = (await response.json()) as unknown;
    if (!Array.isArray(body) || body.length === 0) {
      throw new Error(`Empty killmail response for ${killmailId}`);
    }

    return body[0] as Record<string, unknown>;
  }
}

export class KillmailEnrichmentService {
  constructor(
    private readonly repository: KillmailEnrichmentRepository,
    private readonly source: KillmailEnrichmentSource,
    private readonly throttleMs = 0,
  ) {}

  private async throttle(): Promise<void> {
    if (this.throttleMs <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, this.throttleMs));
  }

  async process(killmailId: number): Promise<void> {
    await this.repository.upsertPending(killmailId);

    await tracer.startActiveSpan('enrich.killmail', async (span) => {
      span.setAttribute('killmail.id', killmailId);
      try {
        await this.repository.markProcessing(killmailId);
        await this.throttle();
        const payload = await this.source.fetchKillmail(killmailId);
        await this.repository.markSucceeded(killmailId, payload, new Date());
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        await this.repository.markFailed(killmailId, message);
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        throw error;
      } finally {
        span.end();
      }
    });
  }
}
