# Battle Reports - Code Examples

## Frontend API Usage

### Fetching Battles with Filters

```typescript
// Current API (from frontend/src/modules/battles/api.ts)
import { fetchBattles, fetchBattleDetail } from '../battles/api.js';

// Simple list
const response = await fetchBattles({ limit: 20 });

// With filters
const response = await fetchBattles({
  limit: 20,
  spaceType: 'kspace',
  allianceId: '99005338',  // Goonswarm (example)
  since: new Date('2025-01-01'),
  until: new Date('2025-01-31'),
});

// With pagination cursor
const nextResponse = await fetchBattles({
  limit: 20,
  cursor: response.nextCursor,
});

// Get battle details
const detail = await fetchBattleDetail('550e8400-e29b-41d4-a716-446655440000');

// Format ISK for display
import { formatIsk } from '../battles/api.js';
const formatted = formatIsk(detail.totalIskDestroyed);
// Output: "1,234,567,890 ISK"
```

### BattlesView Component Integration

```typescript
// From frontend/src/modules/battles/components/BattlesView.tsx
export const BattlesView = () => {
  const { wrapApiCall } = useApiCall();
  const [battles, setBattles] = useState<BattleSummary[]>([]);
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [selectedBattle, setSelectedBattle] = useState<BattleDetail | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Load initial battles
  useEffect(() => {
    const controller = new AbortController();
    wrapApiCall(() => fetchBattles({ limit: 10, signal: controller.signal }))
      .then((response) => {
        setBattles(response.items);
        setNextCursor(response.nextCursor);
        if (response.items.length > 0) {
          loadBattle(response.items[0].id);
        }
      });
    return () => controller.abort();
  }, []);

  // Load more with cursor
  const handleLoadMore = useCallback(() => {
    wrapApiCall(() => fetchBattles({ cursor: nextCursor }))
      .then((response) => {
        setBattles((current) => [...current, ...response.items]);
        setNextCursor(response.nextCursor);
      });
  }, [nextCursor, wrapApiCall]);
};
```

## Backend API Implementation

### BattleListQuerySchema

```typescript
// From backend/api/src/schemas.ts
export const BattleListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
  spaceType: SpaceTypeSchema.optional(),  // 'kspace' | 'jspace' | 'pochven'
  systemId: z.string().regex(/^\d+$/).optional(),
  allianceId: z.string().regex(/^\d+$/).optional(),
  corpId: z.string().regex(/^\d+$/).optional(),
  characterId: z.string().regex(/^\d+$/).optional(),
  since: z.coerce.date().optional(),
  until: z.coerce.date().optional(),
});
```

### API Route Handler

```typescript
// From backend/api/src/routes/battles.ts

// Register the routes
export const registerBattleRoutes = (
  app: FastifyInstance,
  repository: BattleRepository,
  nameEnricher: NameEnricher,
): void => {
  // List battles endpoint
  app.get('/battles', {
    schema: {
      tags: ['Battles'],
      summary: 'List battles',
      querystring: BattleListQuerySchema,
      response: {
        200: BattleListResponseSchema,
        400: ErrorResponseSchema,
      },
    },
    handler: async (request, reply) => {
      return handleListRequest(repository, request, reply, nameEnricher);
    },
  });

  // Alliance-specific battles
  app.get('/alliances/:id/battles', {
    handler: async (request, reply) => {
      const params = AllianceParamsSchema.parse(request.params);
      return handleListRequest(repository, request, reply, nameEnricher, {
        allianceId: BigInt(params.id),
      });
    },
  });

  // Battle details
  app.get('/battles/:id', {
    handler: async (request, reply) => {
      const params = BattleParamsSchema.parse(request.params);
      const battle = await repository.getBattleById(params.id);
      if (!battle) {
        return reply.status(404).send({ message: 'Battle not found' });
      }
      const response = await nameEnricher.enrichBattleDetail(battle);
      return reply.send(response);
    },
  });
};
```

### Building Filters

```typescript
// From backend/api/src/routes/battles.ts

const buildFilters = (
  query: z.infer<typeof ListQuerySchema>,
  overrides: Partial<BattleFilters> = {},
): BattleFilters => {
  let characterId: bigint | undefined;
  if (query.characterId) {
    characterId = BigInt(query.characterId);
  }

  let systemId: bigint | undefined;
  if (query.systemId) {
    systemId = BigInt(query.systemId);
  }

  let allianceId: bigint | undefined;
  if (query.allianceId) {
    allianceId = BigInt(query.allianceId);
  }

  let corpId: bigint | undefined;
  if (query.corpId) {
    corpId = BigInt(query.corpId);
  }

  return {
    spaceType: query.spaceType,
    systemId,
    allianceId,
    corpId,
    characterId,
    since: query.since,
    until: query.until,
    ...overrides,
  };
};
```

## Database Layer

### BattleRepository Methods

```typescript
// From packages/database/src/repositories/battle-repository.ts

export class BattleRepository {
  // Create new battle
  async createBattle(input: BattleInsert): Promise<BattleRecord> {
    const battle = BattleInsertSchema.parse(input);
    const inserted = await this.db
      .insertInto('battles')
      .values({
        id: battle.id,
        systemId: serializeBigIntRequired(battle.systemId),
        spaceType: battle.spaceType,
        startTime: battle.startTime,
        endTime: battle.endTime,
        totalKills: serializeBigIntRequired(battle.totalKills),
        totalIskDestroyed: serializeBigIntRequired(battle.totalIskDestroyed),
        zkillRelatedUrl: battle.zkillRelatedUrl,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      ...inserted,
      systemId: toBigInt(inserted.systemId) ?? 0n,
      totalKills: toBigInt(inserted.totalKills) ?? 0n,
      totalIskDestroyed: toBigInt(inserted.totalIskDestroyed) ?? 0n,
    };
  }

  // List battles with filters and pagination
  async listBattles(
    filters: BattleFilters,
    limit: number,
    cursor?: BattleCursor,
  ): Promise<BattleRecord[]> {
    let query = this.db.selectFrom('battles').selectAll();

    if (filters.spaceType) {
      query = query.where('spaceType', '=', filters.spaceType);
    }

    if (filters.systemId !== undefined) {
      query = query.where('systemId', '=', filters.systemId);
    }

    if (filters.allianceId !== undefined) {
      const allianceId = filters.allianceId;
      const allianceSubquery = this.db
        .selectFrom('killmail_events')
        .select('battleId')
        .where('battleId', 'is not', null)
        .where(
          sql<boolean>`("killmail_events"."victim_alliance_id" = CAST(${serializeBigIntRequired(
            allianceId,
          )} AS bigint) OR CAST(${serializeBigIntRequired(
            allianceId,
          )} AS bigint) = ANY("killmail_events"."attacker_alliance_ids"))`,
        );
      query = query.where('id', 'in', allianceSubquery);
    }

    if (filters.characterId !== undefined) {
      const characterId = filters.characterId;
      const characterSubquery = this.db
        .selectFrom('killmail_events')
        .select('battleId')
        .where('battleId', 'is not', null)
        .where(
          sql<boolean>`("killmail_events"."victim_character_id" = CAST(${serializeBigIntRequired(
            characterId,
          )} AS bigint) OR CAST(${serializeBigIntRequired(
            characterId,
          )} AS bigint) = ANY("killmail_events"."attacker_character_ids"))`,
        );
      query = query.where('id', 'in', characterSubquery);
    }

    if (filters.since) {
      query = query.where('startTime', '>=', filters.since);
    }

    if (filters.until) {
      query = query.where('startTime', '<=', filters.until);
    }

    // Handle cursor-based pagination
    if (cursor) {
      query = query.where((eb) =>
        eb.or([
          eb('startTime', '<', cursor.startTime),
          eb.and([eb('startTime', '=', cursor.startTime), eb('id', '<', cursor.id)]),
        ]),
      );
    }

    const rows = await query
      .orderBy('startTime', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      ...row,
      systemId: toBigInt(row.systemId) ?? 0n,
      totalKills: toBigInt(row.totalKills) ?? 0n,
      totalIskDestroyed: toBigInt(row.totalIskDestroyed) ?? 0n,
    }));
  }

  // Get alliance statistics
  async getAllianceStatistics(allianceId: bigint) {
    const battleIds = await this.db
      .selectFrom('killmail_events')
      .select('battleId')
      .distinct()
      .where('battleId', 'is not', null)
      .where(
        sql<boolean>`("killmail_events"."victim_alliance_id" = CAST(${serializeBigIntRequired(
          allianceId,
        )} AS bigint) OR CAST(${serializeBigIntRequired(
          allianceId,
        )} AS bigint) = ANY("killmail_events"."attacker_alliance_ids"))`,
      )
      .execute();

    // ... rest of implementation
    return {
      totalBattles: battleIdList.length,
      totalKillmails: Number(killmailStats?.totalKillmails ?? 0),
      totalIskDestroyed: toBigInt(killmailStats?.totalIskDestroyed) ?? 0n,
      totalIskLost: toBigInt(killmailStats?.totalIskLost) ?? 0n,
      averageParticipants: Number(participantStats?.avgParticipants ?? 0),
      mostUsedShips: [...],
      topOpponents: [...],
      topSystems: [...],
    };
  }
}
```

## Database Queries

### Get Battles for an Alliance

```sql
-- Direct SQL equivalent of filter logic
SELECT *
FROM battles b
WHERE b.id IN (
  SELECT DISTINCT ke.battle_id
  FROM killmail_events ke
  WHERE ke.battle_id IS NOT NULL
    AND (
      ke.victim_alliance_id = $1
      OR $1 = ANY(ke.attacker_alliance_ids)
    )
)
ORDER BY b.start_time DESC, b.id DESC
LIMIT 20;
```

### Get Battle with Killmails and Participants

```sql
-- Battles
SELECT * FROM battles WHERE id = $1;

-- Killmails for battle
SELECT * FROM battle_killmails WHERE battle_id = $1 ORDER BY occurred_at ASC;

-- Killmail events for enrichment
SELECT *
FROM killmail_events
WHERE battle_id = $1;

-- Killmail enrichment data
SELECT *
FROM killmail_enrichments
WHERE killmail_id = ANY(
  SELECT killmail_id FROM battle_killmails WHERE battle_id = $1
);

-- Participants in battle
SELECT * FROM battle_participants WHERE battle_id = $1;
```

## Type Conversions

### BigInt Handling

```typescript
// From packages/database/src/repositories/utils.ts

// Database → JavaScript
const toBigInt = (value: string | number | null | undefined): bigint | null => {
  if (value === null || value === undefined) return null;
  return BigInt(value);
};

// JavaScript → Database
const serializeBigInt = (value: bigint | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  return value.toString();
};

const serializeBigIntRequired = (value: bigint): string => {
  return value.toString();
};

// Arrays
const toBigIntArray = (values: (string | number)[]): bigint[] => {
  return values.map((v) => BigInt(v));
};

const serializeBigIntArray = (values: (bigint | undefined | null)[]): (string | null)[] => {
  return values.map((v) => (v === null || v === undefined ? null : v.toString()));
};
```

## Cursor Pagination

```typescript
// Encode cursor for next page
const encodeCursor = (cursor: BattleCursor): string =>
  Buffer.from(
    JSON.stringify({
      startTime: cursor.startTime.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64');

// Decode cursor from client
const decodeCursor = (value: string): BattleCursor | null => {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as {
      startTime: string;
      id: string;
    };
    const startTime = new Date(decoded.startTime);
    if (Number.isNaN(startTime.getTime()) || typeof decoded.id !== 'string') {
      return null;
    }
    return { startTime, id: decoded.id };
  } catch {
    return null;
  }
};

// Use in response
const nextCursor =
  battles.length === limit
    ? encodeCursor({
        startTime: battles[battles.length - 1].startTime,
        id: battles[battles.length - 1].id,
      })
    : null;

return reply.send({
  items: enriched,
  nextCursor,
});
```

---

**Note:** These examples are extracted from the actual codebase. Check the implementation files for complete, up-to-date code.
