# Search Feature Specification

**Feature Key**: `search`
**Feature Name**: Global Search
**Last Updated**: 2025-11-10

---

## 1. Overview

**Global Search** provides fast, flexible, and user-friendly search capabilities across all BattleScope data. It enables users to find battles, entities (alliances, corporations, characters), systems, and other game data using natural language queries with autocomplete, fuzzy matching, and faceted filtering.

### Purpose

Provide users with:
- **Fast autocomplete** for entity names and systems in filter interfaces
- **Full-text search** across battles and participant data
- **Fuzzy matching** for typo-tolerant searches
- **Faceted search** with dynamic filters based on search results
- **Global search bar** accessible from anywhere in the application
- **Search suggestions** and recent searches

### Key Value Proposition

- **Better UX**: Users don't need to remember exact names or IDs
- **Fast**: Sub-100ms search response times
- **Scalable**: Handles millions of documents efficiently
- **Flexible**: Supports simple autocomplete and complex queries
- **Centralized**: One search infrastructure for all features

---

## 2. Feature Concepts

| Concept | Description |
| ------- | ----------- |
| **Search Index** | Searchable collection of documents (battles, entities, systems) |
| **Document** | A single searchable item with fields (title, description, metadata) |
| **Autocomplete** | Real-time search suggestions as user types |
| **Fuzzy Matching** | Tolerance for typos and spelling variations |
| **Facets** | Dynamic filters based on search results (e.g., space type, date) |
| **Ranking** | Relevance scoring to show most relevant results first |
| **Scoped Search** | Search within a specific feature (e.g., "search in Battle Reports") |

---

## 3. Technology Selection

### 3.1 Search Product Evaluation

| Product | Type | Pros | Cons | Recommendation |
|---------|------|------|------|----------------|
| **Typesense** | Self-hosted OSS | Fast, typo-tolerant, clustering support, great API | None significant | ✅ **Recommended** |
| **Meilisearch** | Self-hosted OSS | Fast, simple, great UX, low resource usage | No clustering (single node only) | ✅ Alternative |
| **Algolia** | SaaS | Best-in-class UX, managed | Expensive at scale ($1/1k searches) | Consider for future |
| **Elasticsearch** | Self-hosted OSS | Powerful, flexible | Complex, resource-heavy, overkill | Not recommended |
| **PostgreSQL FTS** | Built-in | No extra infra | Limited features, slower | Use for simple autocomplete only |

### 3.2 Recommended: Typesense

**Why Typesense**:
- **Performance**: <50ms search response times, written in C++ for speed
- **Typo tolerance**: Industry-leading fuzzy matching (1-2 typos by default)
- **Horizontal scaling**: Clustering support for high availability and load distribution
- **Simple deployment**: Single binary (like Meilisearch), low resource footprint (~50-100MB)
- **Developer-friendly API**: RESTful, excellent documentation
- **Prefix search**: Instant autocomplete with ultra-fast in-memory index
- **Faceted search**: Dynamic filters, grouping, and aggregations
- **Tunable ranking**: Customize relevance scoring per field
- **Open source**: GPLv3 licensed with commercial licensing available
- **Active development**: Regular releases, responsive community, backed by Typesense Inc.
- **Battle-tested**: Used by companies like Expedia, Birkenstock, Wolt

**Typesense vs Meilisearch**:
- ✅ Typesense has **clustering/replication** (Meilisearch is single-node only)
- ✅ Typesense has **built-in high availability** via multi-node setup
- ✅ Typesense has **RAFT consensus** for data consistency across nodes
- ✅ Typesense has **better control over ranking** (per-field weights, custom scoring)
- ≈ Both have similar performance (<50ms searches)
- ≈ Both have great typo tolerance
- ≈ Both have simple APIs

**Architecture**:
```
┌─────────────────────────────────────────────────────────────┐
│ BattleScope Application                                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Frontend → API (Proxy) → Typesense Cluster                 │
│                  ↓              (3 nodes)                    │
│              Search Service                                  │
│                  ↓                                           │
│            PostgreSQL (source of truth)                      │
│                                                              │
│  Daily CronJob: Sync entities from PostgreSQL → Typesense   │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Typesense Cluster (Production):
  Node 1 (Leader)  ←→  Node 2 (Follower)  ←→  Node 3 (Follower)
      ↕                     ↕                        ↕
  K8s Service (typesense.battlescope.svc.cluster.local)
      ↕
  API Service (acts as proxy for security)

Notes:
- API proxies search requests to Typesense (never expose Typesense directly)
- PostgreSQL is source of truth (Typesense is read-only index)
- Daily cronjob syncs entity data from PostgreSQL to Typesense
- Only entities referenced in battles are indexed
```

---

## 4. Data Indexing Strategy

### 4.1 Search Collections

BattleScope will maintain the following Typesense collections:

#### **battles** Collection

**Purpose**: Search battles by system, participants, time, characteristics

**Typesense Schema**:
```typescript
{
  name: 'battles',
  fields: [
    { name: 'id', type: 'string' }, // UUID - primary key
    { name: 'systemId', type: 'string' },
    { name: 'systemName', type: 'string' }, // Searchable
    { name: 'regionName', type: 'string' }, // Searchable
    { name: 'spaceType', type: 'string', facet: true }, // Filterable
    { name: 'securityLevel', type: 'string', facet: true, optional: true }, // Filterable

    { name: 'startTime', type: 'int64' }, // Unix timestamp - sortable, filterable
    { name: 'duration', type: 'int32' }, // seconds - filterable
    { name: 'totalKills', type: 'int32' }, // Sortable, filterable
    { name: 'totalParticipants', type: 'int32' }, // Sortable, filterable
    { name: 'totalIskDestroyed', type: 'int64' }, // Sortable, filterable

    // Participant data for text search (arrays)
    { name: 'allianceIds', type: 'string[]' },
    { name: 'allianceNames', type: 'string[]' }, // Searchable
    { name: 'corpIds', type: 'string[]' },
    { name: 'corpNames', type: 'string[]' }, // Searchable
    { name: 'characterNames', type: 'string[]', optional: true }, // Top participants only (limit 50)

    // For ranking
    { name: 'battleScore', type: 'int32' }, // Composite score for sorting
  ],
  default_sorting_field: 'startTime' // Default sort by time (newest first)
}
```

**Query Configuration**:
```typescript
{
  query_by: 'systemName,allianceNames,corpNames,characterNames',
  query_by_weights: '4,3,2,1', // System name most important, then alliances, etc.
  num_typos: 2, // Allow up to 2 typos
  typo_tokens_threshold: 1, // Enable typo tolerance for words >= 1 char
  prefix: true, // Enable prefix matching for autocomplete
  drop_tokens_threshold: 0, // Don't drop tokens
}
```

**Benefits of Typesense Fields**:
- `facet: true` enables fast faceted search (dynamic filter counts)
- Native support for `int32` and `int64` (no string conversion needed)
- Array fields (`string[]`) for multi-value attributes
- `default_sorting_field` for efficient sorting
- `optional: true` for nullable fields

---

#### **entities** Collection

**Purpose**: Autocomplete for alliances, corporations, characters

**Typesense Schema**:
```typescript
{
  name: 'entities',
  fields: [
    { name: 'id', type: 'string' }, // EVE entity ID - primary key
    { name: 'type', type: 'string', facet: true }, // alliance, corporation, character
    { name: 'name', type: 'string' }, // Searchable
    { name: 'ticker', type: 'string', optional: true }, // Searchable

    // For hierarchical display
    { name: 'allianceId', type: 'string', optional: true },
    { name: 'allianceName', type: 'string', optional: true },
    { name: 'corpId', type: 'string', optional: true },
    { name: 'corpName', type: 'string', optional: true },

    // Activity metrics
    { name: 'battleCount', type: 'int32' }, // Sortable
    { name: 'lastSeenAt', type: 'int64' }, // Unix timestamp

    // For ranking
    { name: 'activityScore', type: 'int32' }, // More active = higher rank
  ],
  default_sorting_field: 'activityScore' // Rank by activity
}
```

**Query Configuration**:
```typescript
{
  query_by: 'name,ticker',
  query_by_weights: '2,1', // Name more important than ticker
  num_typos: 2,
  prefix: true, // Enable autocomplete
}
```

**Indexing Rules**:
- ✅ **Only index entities referenced in battles** - If an alliance/corp/character has never participated in a battle in your database, do NOT index it
- ✅ **Real-time updates** - When a battle is ingested, update entity `lastSeenAt` and `battleCount`
- ✅ **Daily sync** - CronJob refreshes all entity metadata (names, tickers, corp→alliance relationships)
- ✅ **Garbage collection** - Remove entities with `battleCount = 0` (no longer referenced)

**Activity Score Calculation**:
```typescript
activityScore = (battleCount * 10) + recencyBonus

// Recency bonus: More recent activity = higher score
const daysSinceLastSeen = (Date.now() - lastSeenAt) / (1000 * 60 * 60 * 24);
const recencyBonus = Math.max(0, 100 - daysSinceLastSeen);
```

---

#### **systems** Collection

**Purpose**: Autocomplete for EVE Online solar systems

**Typesense Schema**:
```typescript
{
  name: 'systems',
  fields: [
    { name: 'id', type: 'string' }, // System ID - primary key
    { name: 'name', type: 'string' }, // Searchable
    { name: 'regionId', type: 'string' },
    { name: 'regionName', type: 'string' }, // Searchable
    { name: 'constellationId', type: 'string' },
    { name: 'constellationName', type: 'string' }, // Searchable
    { name: 'spaceType', type: 'string', facet: true },
    { name: 'securityLevel', type: 'string', facet: true, optional: true },
    { name: 'securityStatus', type: 'float' }, // -1.0 to 1.0

    // Activity metrics
    { name: 'battleCount', type: 'int32' },
    { name: 'lastBattleAt', type: 'int64', optional: true }, // Unix timestamp

    // For ranking
    { name: 'activityScore', type: 'int32' },
  ],
  default_sorting_field: 'activityScore'
}
```

**Query Configuration**:
```typescript
{
  query_by: 'name,regionName,constellationName',
  query_by_weights: '4,2,1', // System name most important
  num_typos: 1, // More strict typo tolerance for system names
  prefix: true,
}
```

**Indexing Rules**:
- ✅ **Only index systems with battles** - If a system has never had a battle, do NOT index it
- ✅ **Update on battle creation** - When a battle is created, update system `battleCount` and `lastBattleAt`
- ✅ **Daily sync** - CronJob can refresh EVE system metadata (names, security status) from SDE or ESI
- ✅ **Pre-populate on startup** - Can optionally pre-index all EVE systems (8,000+ systems) for better UX, but only if storage isn't a concern

**Note**: Unlike entities (which change frequently), EVE system data is mostly static. You can choose to either:
1. **Lazy index** - Only index systems that have battles (saves space, ~100-500 systems)
2. **Full index** - Pre-populate all 8,000+ EVE systems (better UX for system search, ~5MB)

---

### 4.2 Indexing Pipeline

**Real-time Indexing**:
```
Battle Created → Trigger Indexing Job → Update Meilisearch
     ↓
  Update entity activity metrics
     ↓
  Update system activity metrics
```

**Implementation**:
```typescript
// backend/search/src/indexers/battle-indexer.ts

import Typesense from 'typesense';

export class BattleIndexer {
  private client: Typesense.Client;

  constructor(client: Typesense.Client, battleRepo, entityIndexer, systemIndexer) {
    this.client = client;
    this.battleRepo = battleRepo;
    this.entityIndexer = entityIndexer;
    this.systemIndexer = systemIndexer;
  }

  async indexBattle(battleId: string): Promise<void> {
    // 1. Fetch battle data from PostgreSQL
    const battle = await this.battleRepo.getDetailById(battleId);

    // 2. Transform to Typesense document
    const document = {
      id: battle.id,
      systemId: battle.systemId,
      systemName: battle.systemName,
      regionName: battle.regionName,
      spaceType: battle.spaceType,
      securityLevel: battle.securityLevel || undefined, // Optional field
      startTime: Math.floor(new Date(battle.startTime).getTime() / 1000), // Unix timestamp
      duration: battle.duration,
      totalKills: battle.totalKills,
      totalParticipants: battle.totalParticipants,
      totalIskDestroyed: Number(battle.totalIskDestroyed),
      allianceIds: this.extractAllianceIds(battle.participants),
      allianceNames: this.extractAllianceNames(battle.participants),
      corpIds: this.extractCorpIds(battle.participants),
      corpNames: this.extractCorpNames(battle.participants),
      characterNames: this.extractTopCharacterNames(battle.participants, 50),
      battleScore: this.calculateBattleScore(battle),
    };

    // 3. Index in Typesense (upsert)
    await this.client.collections('battles').documents().upsert(document);

    // 4. Update entity activity metrics
    await this.entityIndexer.updateActivityMetrics(battle.participants);

    // 5. Update system activity metrics
    await this.systemIndexer.updateActivityMetrics(battle.systemId);
  }

  private calculateBattleScore(battle: Battle): number {
    // Composite score for ranking
    const iskScore = Math.log10(Number(battle.totalIskDestroyed) + 1) * 100;
    const killsScore = battle.totalKills * 10;
    const participantsScore = battle.totalParticipants * 5;
    return Math.round(iskScore + killsScore + participantsScore);
  }

  private extractAllianceNames(participants: Participant[]): string[] {
    const names = new Set<string>();
    for (const p of participants) {
      if (p.allianceName) names.add(p.allianceName);
    }
    return Array.from(names);
  }

  // Similar helpers for other fields...
}
```

**Batch Re-indexing** (for schema changes or initial setup):
```typescript
// backend/search/src/commands/reindex.ts

export class ReindexCommand {
  constructor(private client: Typesense.Client, private indexers) {}

  async reindexAll(): Promise<void> {
    console.log('Starting full re-index...');

    // Step 1: Delete existing collections
    try {
      await this.client.collections('battles').delete();
      await this.client.collections('entities').delete();
      await this.client.collections('systems').delete();
    } catch (e) {
      // Ignore errors if collections don't exist
    }

    // Step 2: Create collections with schemas
    await this.createCollections();

    // Step 3: Index all battles (paginated)
    let cursor = null;
    let totalIndexed = 0;
    do {
      const battles = await this.battleRepo.getAll({ limit: 1000, cursor });
      await this.indexers.battle.indexBattles(battles.items);
      totalIndexed += battles.items.length;
      console.log(`Indexed ${totalIndexed} battles...`);
      cursor = battles.nextCursor;
    } while (cursor);

    console.log(`Re-index complete. Total: ${totalIndexed} battles`);
  }

  private async createCollections(): Promise<void> {
    // Create battles collection
    await this.client.collections().create({
      name: 'battles',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'systemId', type: 'string' },
        { name: 'systemName', type: 'string' },
        { name: 'regionName', type: 'string' },
        { name: 'spaceType', type: 'string', facet: true },
        { name: 'securityLevel', type: 'string', facet: true, optional: true },
        { name: 'startTime', type: 'int64' },
        { name: 'duration', type: 'int32' },
        { name: 'totalKills', type: 'int32' },
        { name: 'totalParticipants', type: 'int32' },
        { name: 'totalIskDestroyed', type: 'int64' },
        { name: 'allianceIds', type: 'string[]' },
        { name: 'allianceNames', type: 'string[]' },
        { name: 'corpIds', type: 'string[]' },
        { name: 'corpNames', type: 'string[]' },
        { name: 'characterNames', type: 'string[]', optional: true },
        { name: 'battleScore', type: 'int32' },
      ],
      default_sorting_field: 'startTime',
    });

    // Create entities collection
    await this.client.collections().create({
      name: 'entities',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'type', type: 'string', facet: true },
        { name: 'name', type: 'string' },
        { name: 'ticker', type: 'string', optional: true },
        { name: 'allianceId', type: 'string', optional: true },
        { name: 'allianceName', type: 'string', optional: true },
        { name: 'corpId', type: 'string', optional: true },
        { name: 'corpName', type: 'string', optional: true },
        { name: 'battleCount', type: 'int32' },
        { name: 'lastSeenAt', type: 'int64' },
        { name: 'activityScore', type: 'int32' },
      ],
      default_sorting_field: 'activityScore',
    });

    // Create systems collection
    await this.client.collections().create({
      name: 'systems',
      fields: [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'regionId', type: 'string' },
        { name: 'regionName', type: 'string' },
        { name: 'constellationId', type: 'string' },
        { name: 'constellationName', type: 'string' },
        { name: 'spaceType', type: 'string', facet: true },
        { name: 'securityLevel', type: 'string', facet: true, optional: true },
        { name: 'securityStatus', type: 'float' },
        { name: 'battleCount', type: 'int32' },
        { name: 'lastBattleAt', type: 'int64', optional: true },
        { name: 'activityScore', type: 'int32' },
      ],
      default_sorting_field: 'activityScore',
    });

    console.log('Collections created successfully');
  }
}
```

---

### 4.3 Daily Entity Sync (CronJob)

**Purpose**: Keep entity metadata fresh and remove stale entities.

**Schedule**: Daily at 3:00 AM UTC

**What it does**:
1. **Refresh entity metadata** from PostgreSQL (names, tickers, alliance memberships)
2. **Update activity metrics** (battleCount, lastSeenAt)
3. **Remove stale entities** (entities with battleCount = 0, meaning no battles reference them)
4. **Sync EVE Online data** (optional: fetch latest corp/alliance names from ESI API)

**Implementation**:
```typescript
// backend/search/src/jobs/entity-sync.ts

export class EntitySyncJob {
  async run(): Promise<void> {
    console.log('Starting daily entity sync...');

    // Step 1: Get all unique entity IDs from battles in PostgreSQL
    const referencedEntities = await this.getReferencedEntities();

    // Step 2: For each entity type, sync to Typesense
    await this.syncAlliances(referencedEntities.alliances);
    await this.syncCorporations(referencedEntities.corporations);
    await this.syncCharacters(referencedEntities.characters);

    // Step 3: Remove entities not in battles (garbage collection)
    await this.removeStaleEntities(referencedEntities);

    console.log('Entity sync complete');
  }

  private async getReferencedEntities(): Promise<ReferencedEntities> {
    // Query PostgreSQL for all unique alliance/corp/character IDs in battles
    const alliances = await this.db
      .selectFrom('battle_participants')
      .select('alliance_id')
      .distinct()
      .where('alliance_id', 'is not', null)
      .execute();

    const corporations = await this.db
      .selectFrom('battle_participants')
      .select('corp_id')
      .distinct()
      .where('corp_id', 'is not', null)
      .execute();

    const characters = await this.db
      .selectFrom('battle_participants')
      .select('character_id')
      .distinct()
      .execute();

    return { alliances, corporations, characters };
  }

  private async syncAlliances(allianceIds: string[]): Promise<void> {
    console.log(`Syncing ${allianceIds.length} alliances...`);

    // Batch process (1000 at a time)
    for (let i = 0; i < allianceIds.length; i += 1000) {
      const batch = allianceIds.slice(i, i + 1000);

      // Get alliance data from PostgreSQL + count battles
      const allianceData = await this.db
        .selectFrom('battle_participants as bp')
        .select([
          'bp.alliance_id as id',
          'bp.alliance_name as name',
          'bp.alliance_ticker as ticker',
          db.fn.count('bp.battle_id').distinct().as('battleCount'),
          db.fn.max('b.start_time').as('lastSeenAt'),
        ])
        .innerJoin('battles as b', 'b.id', 'bp.battle_id')
        .where('bp.alliance_id', 'in', batch)
        .groupBy(['bp.alliance_id', 'bp.alliance_name', 'bp.alliance_ticker'])
        .execute();

      // Transform and upsert to Typesense
      const documents = allianceData.map(a => ({
        id: a.id,
        type: 'alliance',
        name: a.name,
        ticker: a.ticker,
        battleCount: Number(a.battleCount),
        lastSeenAt: Math.floor(new Date(a.lastSeenAt).getTime() / 1000),
        activityScore: this.calculateActivityScore(
          Number(a.battleCount),
          new Date(a.lastSeenAt)
        ),
      }));

      await this.typesense
        .collections('entities')
        .documents()
        .import(documents, { action: 'upsert' });
    }

    console.log(`✓ Synced ${allianceIds.length} alliances`);
  }

  // Similar methods for syncCorporations() and syncCharacters()...

  private async removeStaleEntities(referenced: ReferencedEntities): Promise<void> {
    console.log('Removing stale entities...');

    // Get all entity IDs currently in Typesense
    const searchResult = await this.typesense
      .collections('entities')
      .documents()
      .search({
        q: '*',
        per_page: 250,
        // Paginate through all results...
      });

    const typesenseEntityIds = new Set(
      searchResult.hits.map(h => h.document.id)
    );

    const referencedIds = new Set([
      ...referenced.alliances,
      ...referenced.corporations,
      ...referenced.characters,
    ]);

    // Find entities in Typesense but not in battles (stale)
    const staleIds = Array.from(typesenseEntityIds).filter(
      id => !referencedIds.has(id)
    );

    // Delete stale entities
    for (const id of staleIds) {
      await this.typesense.collections('entities').documents(id).delete();
    }

    console.log(`✓ Removed ${staleIds.length} stale entities`);
  }

  private calculateActivityScore(battleCount: number, lastSeenAt: Date): number {
    const daysSince = (Date.now() - lastSeenAt.getTime()) / (1000 * 60 * 60 * 24);
    const recencyBonus = Math.max(0, 100 - daysSince);
    return Math.round(battleCount * 10 + recencyBonus);
  }
}
```

---

### 4.4 Kubernetes CronJob Configuration

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: search-entity-sync
  namespace: battlescope
spec:
  schedule: "0 3 * * *" # Daily at 3:00 AM UTC
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: entity-sync
            image: battlescope/search:latest
            command:
              - node
              - dist/jobs/entity-sync.js
            env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: database-secret
                  key: url
            - name: TYPESENSE_HOST
              value: "typesense.battlescope.svc.cluster.local"
            - name: TYPESENSE_PORT
              value: "8108"
            - name: TYPESENSE_PROTOCOL
              value: "http"
            - name: TYPESENSE_API_KEY
              valueFrom:
                secretKeyRef:
                  name: typesense-secret
                  key: api-key
            resources:
              requests:
                memory: "256Mi"
                cpu: "250m"
              limits:
                memory: "512Mi"
                cpu: "500m"
```

**Monitoring**:
- Check CronJob status: `kubectl get cronjobs -n battlescope`
- View logs: `kubectl logs -n battlescope -l job-name=search-entity-sync`
- Success/failure alerts via monitoring system

---

## 5. API Design

### 5.1 Search Service Architecture

**Package**: `backend/search/`

**Structure**:
```
backend/search/
├── src/
│   ├── client/
│   │   └── meilisearch-client.ts      # Meilisearch wrapper
│   ├── indexers/
│   │   ├── battle-indexer.ts          # Battle indexing logic
│   │   ├── entity-indexer.ts          # Entity indexing logic
│   │   └── system-indexer.ts          # System indexing logic
│   ├── services/
│   │   └── search-service.ts          # High-level search API
│   ├── transformers/
│   │   └── document-transformers.ts   # DB → Search document
│   ├── commands/
│   │   └── reindex.ts                 # CLI reindex command
│   └── index.ts
└── package.json
```

**Dependencies**:
- `meilisearch` (official client)
- `@battlescope/database`
- `@battlescope/shared`

---

### 5.2 Search Service API

```typescript
// backend/search/src/services/search-service.ts

export class SearchService {
  /**
   * Search battles with filters and sorting
   */
  async searchBattles(params: {
    query?: string;
    filters?: {
      spaceType?: SpaceType[];
      securityLevel?: SecurityLevel[];
      minIsk?: number;
      maxIsk?: number;
      minKills?: number;
      maxKills?: number;
      // ... other filters
    };
    sort?: {
      by: 'startTime' | 'totalIskDestroyed' | 'totalKills' | '_battleScore';
      order: 'asc' | 'desc';
    };
    limit?: number;
    offset?: number;
  }): Promise<SearchResults<BattleDocument>> {
    const filterString = this.buildFilterString(params.filters);

    return this.meilisearch.index('battles').search(params.query || '', {
      filter: filterString,
      sort: params.sort ? [`${params.sort.by}:${params.sort.order}`] : undefined,
      limit: params.limit || 20,
      offset: params.offset || 0,
    });
  }

  /**
   * Autocomplete for entities
   */
  async autocompleteEntities(params: {
    query: string;
    types?: ('alliance' | 'corporation' | 'character')[];
    limit?: number;
  }): Promise<SearchResults<EntityDocument>> {
    const filter = params.types
      ? `type IN [${params.types.map(t => `"${t}"`).join(', ')}]`
      : undefined;

    return this.meilisearch.index('entities').search(params.query, {
      filter,
      limit: params.limit || 10,
      sort: ['_activityScore:desc'],
    });
  }

  /**
   * Autocomplete for systems
   */
  async autocompleteSystems(params: {
    query: string;
    spaceType?: SpaceType[];
    limit?: number;
  }): Promise<SearchResults<SystemDocument>> {
    const filter = params.spaceType
      ? `spaceType IN [${params.spaceType.map(t => `"${t}"`).join(', ')}]`
      : undefined;

    return this.meilisearch.index('systems').search(params.query, {
      filter,
      limit: params.limit || 10,
      sort: ['_activityScore:desc'],
    });
  }

  /**
   * Global search across all indexes
   */
  async searchGlobal(query: string, limit = 20): Promise<GlobalSearchResults> {
    const [battles, entities, systems] = await Promise.all([
      this.searchBattles({ query, limit }),
      this.autocompleteEntities({ query, limit }),
      this.autocompleteSystems({ query, limit }),
    ]);

    return { battles, entities, systems };
  }
}
```

---

## 6. API Endpoints

### 6.1 API as Proxy

**Important**: The API service acts as a **proxy** to Typesense. Never expose Typesense directly to the frontend.

**Benefits of API Proxy Pattern**:
- ✅ **Security**: Hide Typesense API keys from frontend
- ✅ **Authorization**: Enforce feature-based access control before search
- ✅ **Rate limiting**: Control search request rates per user
- ✅ **Logging**: Track all search queries for analytics
- ✅ **Transformation**: Convert between API format and Typesense format
- ✅ **Flexibility**: Can swap search backend without changing frontend

**Request Flow**:
```
Frontend → API (/search/*) → SearchService → Typesense
                ↓
         Auth & validation
```

---

### 6.2 Search Routes

All search endpoints are exposed via the API service:

```typescript
// backend/api/src/routes/search.ts

export function registerSearchRoutes(app: FastifyInstance, searchService: SearchService) {
  // Autocomplete entities (for filters)
  app.get('/search/entities', {
    preHandler: [authMiddleware, requireFeatureRole('battle-reports', 'user')],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', minLength: 2 },
          type: { type: 'array', items: { enum: ['alliance', 'corporation', 'character'] } },
          limit: { type: 'number', minimum: 1, maximum: 20 },
        },
        required: ['q'],
      },
    },
    handler: async (request, reply) => {
      const { q, type, limit } = request.query;
      const results = await searchService.autocompleteEntities({
        query: q,
        types: type,
        limit,
      });
      return results;
    },
  });

  // Autocomplete systems
  app.get('/search/systems', {
    preHandler: [authMiddleware, requireFeatureRole('battle-reports', 'user')],
    handler: async (request, reply) => {
      const { q, space_type, limit } = request.query;
      const results = await searchService.autocompleteSystems({
        query: q,
        spaceType: space_type,
        limit,
      });
      return results;
    },
  });

  // Global search
  app.get('/search/global', {
    preHandler: [authMiddleware],
    handler: async (request, reply) => {
      const { q, limit } = request.query;
      const results = await searchService.searchGlobal(q, limit);
      return results;
    },
  });

  // Advanced battle search
  app.post('/search/battles', {
    preHandler: [authMiddleware, requireFeatureRole('battle-reports', 'user')],
    handler: async (request, reply) => {
      const results = await searchService.searchBattles(request.body);
      return results;
    },
  });
}
```

---

## 7. Deployment

### 7.1 Meilisearch Deployment

**Docker Compose** (for development):
```yaml
services:
  meilisearch:
    image: getmeili/meilisearch:v1.5
    ports:
      - "7700:7700"
    environment:
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
      MEILI_ENV: ${MEILI_ENV:-development}
      MEILI_DB_PATH: /meili_data
      MEILI_LOG_LEVEL: INFO
    volumes:
      - meilisearch-data:/meili_data
    restart: unless-stopped

volumes:
  meilisearch-data:
```

**Kubernetes** (for production):
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: meilisearch
  namespace: battlescope
spec:
  replicas: 1 # Single instance (Meilisearch doesn't support clustering)
  selector:
    matchLabels:
      app: meilisearch
  template:
    metadata:
      labels:
        app: meilisearch
    spec:
      containers:
      - name: meilisearch
        image: getmeili/meilisearch:v1.5
        ports:
        - containerPort: 7700
        env:
        - name: MEILI_MASTER_KEY
          valueFrom:
            secretKeyRef:
              name: meilisearch-secret
              key: master-key
        - name: MEILI_ENV
          value: "production"
        volumeMounts:
        - name: data
          mountPath: /meili_data
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: meilisearch-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: meilisearch
  namespace: battlescope
spec:
  selector:
    app: meilisearch
  ports:
  - port: 7700
    targetPort: 7700
```

---

### 7.2 Initial Setup

**Step 1**: Deploy Meilisearch

**Step 2**: Configure indexes
```bash
pnpm --filter @battlescope/search run setup-indexes
```

**Step 3**: Initial data indexing
```bash
pnpm --filter @battlescope/search run reindex
```

**Step 4**: Verify search is working
```bash
curl http://localhost:7700/indexes/battles/search?q=pandemic
```

---

## 8. Performance & Scaling

### 8.1 Performance Targets

- **Autocomplete**: <50ms p95
- **Battle search**: <100ms p95
- **Indexing latency**: <5 seconds from battle creation
- **Index size**: ~500MB for 100k battles, 50k entities, 8k systems

### 8.2 Scaling Considerations

**Current Architecture (Single Node)**:
- Good for up to 1M battles, 100k entities
- ~2GB RAM, 2 CPU cores sufficient
- SSD recommended for fast indexing

**Future Scaling** (if needed):
- Meilisearch doesn't support clustering, but single node handles large datasets well
- If needed: Split indexes by region/time period and implement query routing
- Alternative: Migrate to Typesense (supports clustering) or Elasticsearch

---

## 9. Monitoring & Observability

### 9.1 Metrics to Track

- **Search query latency** (p50, p95, p99)
- **Indexing latency** (time from battle creation to searchable)
- **Index size** (disk usage, document count)
- **Search error rate**
- **Top search queries** (for UX optimization)
- **Zero-result searches** (indicates missing data or bad queries)

### 9.2 Health Checks

```typescript
app.get('/health/search', async () => {
  try {
    await meilisearch.health();
    return { status: 'healthy' };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
});
```

---

## 10. Integration with Features

### 10.1 Battle Reports

**Use Cases**:
- Autocomplete for alliance/corp/character filters
- Autocomplete for system filters
- Advanced battle search (future)

**Integration**:
- Battle Reports uses `/search/entities` and `/search/systems` for filter autocomplete
- Basic filtering remains in PostgreSQL (no search needed)
- Advanced/complex queries use Meilisearch

---

### 10.2 Battle Intel

**Use Cases**:
- Search for alliances/corps/characters to view intel pages
- Find entities by partial name match

**Integration**:
- Intel pages use `/search/entities` to find entity IDs
- Redirect to `/intel/alliances/{id}` after selection

---

### 10.3 Global Search

**Use Cases**:
- Global search bar in navigation
- Search across all features

**Integration**:
- Uses `/search/global` endpoint
- Returns mixed results (battles, entities, systems)
- Click result navigates to appropriate feature page

---

## 11. Future Enhancements

- [ ] **Search analytics**: Track popular queries, click-through rates
- [ ] **Saved searches**: Users can save and name frequently used searches
- [ ] **Search suggestions**: "Did you mean..." for typos
- [ ] **Related searches**: "People also searched for..."
- [ ] **Advanced query builder UI**: Visual interface for complex queries
- [ ] **Search alerts**: Notify users when new battles match saved search
- [ ] **Personalized ranking**: Boost results based on user's tracked entities
- [ ] **Geospatial search**: Find battles near a location (using system coordinates)

---

## 12. Success Metrics

- **Adoption**: % of users using search vs. manual navigation
- **Performance**: 95% of searches < 100ms
- **Relevance**: <5% zero-result searches
- **Uptime**: 99.9% search service availability
- **Indexing lag**: <5 seconds p95

---

## 13. References

- [Meilisearch Documentation](https://docs.meilisearch.com/)
- [Meilisearch API Reference](https://docs.meilisearch.com/reference/api/)
- [Battle Reports Feature Spec](../battle-reports/feature-spec.md)
- [Battle Intel Feature Spec](../battle-intel/feature-spec.md)
