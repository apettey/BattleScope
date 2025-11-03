import type { KillmailReference } from '@battlescope/shared';
import { trace } from '@opentelemetry/api';

export interface KillmailSource {
  pull(): Promise<KillmailReference | null>;
}

const tracer = trace.getTracer('battlescope.ingest.source');

interface RedisQKillmail {
  package: {
    killID: number;
    killmail: {
      killmail_id: number;
      solar_system_id: number;
      killmail_time: string;
      victim: {
        alliance_id?: number | null;
        corporation_id?: number | null;
        character_id?: number | null;
      };
      attackers: Array<{
        alliance_id?: number | null;
        corporation_id?: number | null;
        character_id?: number | null;
      }>;
    };
    zkb: {
      totalValue?: number | null;
      url?: string | null;
    };
  } | null;
}

const uniqueNumberIds = (values: Array<number | null | undefined>): number[] => {
  const ids = values.filter((value): value is number => typeof value === 'number');
  return Array.from(new Set(ids));
};

const uniqueBigIntIds = (values: Array<number | bigint | null | undefined>): bigint[] => {
  const set = new Set<bigint>();
  values.forEach((value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      set.add(BigInt(value));
    } else if (typeof value === 'bigint') {
      set.add(value);
    }
  });
  return Array.from(set);
};

const toKillmailReference = (payload: RedisQKillmail['package']): KillmailReference => {
  if (!payload) {
    throw new Error('Empty RedisQ package');
  }

  const { killmail, zkb } = payload;
  if (!killmail) {
    throw new Error('Missing killmail data');
  }

  const occurredAt = new Date(killmail.killmail_time);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error('Invalid killmail timestamp');
  }

  const victimAllianceId =
    typeof killmail.victim?.alliance_id === 'number' ? killmail.victim.alliance_id : null;
  const victimCorpId =
    typeof killmail.victim?.corporation_id === 'number' ? killmail.victim.corporation_id : null;
  const victimCharacterId =
    typeof killmail.victim?.character_id === 'number' ? BigInt(killmail.victim.character_id) : null;

  const attackers = killmail.attackers ?? [];
  const attackerAllianceIds = uniqueNumberIds(attackers.map((attacker) => attacker.alliance_id));
  const attackerCorpIds = uniqueNumberIds(attackers.map((attacker) => attacker.corporation_id));
  const attackerCharacterIds = uniqueBigIntIds(
    attackers.map((attacker) => attacker.character_id ?? null),
  );
  const iskValueRaw = zkb?.totalValue ?? null;
  const iskValue = iskValueRaw !== null ? BigInt(Math.round(iskValueRaw)) : null;

  const url = zkb?.url ?? `https://zkillboard.com/kill/${killmail.killmail_id}/`;

  return {
    killmailId: killmail.killmail_id ?? payload.killID,
    systemId: killmail.solar_system_id,
    occurredAt,
    victimAllianceId,
    victimCorpId,
    victimCharacterId,
    attackerAllianceIds,
    attackerCorpIds,
    attackerCharacterIds,
    iskValue,
    zkbUrl: url,
  };
};

export class ZKillboardRedisQSource implements KillmailSource {
  constructor(
    private readonly redisqUrl: string,
    private readonly queueId?: string,
    private readonly userAgent = 'BattleScope-Ingest/1.0 (+https://battlescope.app)',
  ) {}

  async pull(): Promise<KillmailReference | null> {
    return tracer.startActiveSpan('redisq.pull', async (span) => {
      try {
        const url = new URL(this.redisqUrl);
        if (this.queueId) {
          url.searchParams.set('queueID', this.queueId);
        }

        const response = await fetch(url, {
          headers: {
            'User-Agent': this.userAgent,
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`RedisQ request failed with status ${response.status}`);
        }

        const body = (await response.json()) as RedisQKillmail;
        if (!body.package) {
          span.addEvent('empty-package');
          return null;
        }

        const reference = toKillmailReference(body.package);
        span.setAttribute('killmail.id', reference.killmailId);
        return reference;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: 2, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });
  }
}

export class MockKillmailSource implements KillmailSource {
  private index = 0;

  constructor(private readonly events: KillmailReference[]) {}

  async pull(): Promise<KillmailReference | null> {
    if (this.index >= this.events.length) {
      return null;
    }

    const next = this.events[this.index];
    this.index += 1;
    return next;
  }
}
