# Claude Skill: Code Isolation and Duplication

**Purpose**: Prevent tight coupling between services by avoiding shared code libraries while maintaining consistency through documented patterns.

---

## Core Principle

**Services MUST NOT share business logic, domain models, or types. Duplication is preferred over coupling.**

**Rationale**:
- Shared code creates invisible dependencies between services
- Services cannot be deployed independently
- Changes require coordination across teams
- Testing becomes complex (version compatibility matrices)
- "DRY" principle does NOT apply across service boundaries
- Independent evolution is more valuable than code reuse

---

## The Shared Code Anti-Pattern

### ❌ Anti-Pattern: Shared Library with Domain Logic

**Bad Architecture**:
```
battle-monitor/
├── packages/
│   └── common/                    # ANTI-PATTERN
│       ├── types/
│       │   ├── battle.ts          # Battle domain model
│       │   ├── killmail.ts        # Killmail domain model
│       │   └── participant.ts     # Participant domain model
│       ├── utils/
│       │   ├── battle-calculator.ts   # Business logic
│       │   ├── killmail-validator.ts  # Validation logic
│       │   └── date-formatter.ts      # Utility with domain rules
│       └── repositories/
│           └── base-repository.ts     # Database access patterns
│
├── backend/
│   ├── clusterer/
│   │   ├── package.json
│   │   │   dependencies:
│   │   │     "@battlescope/common": "workspace:*"  # ⚠️ DEPENDENCY
│   │   └── src/
│   │       └── services/
│   │           └── battle-service.ts
│   │               import { Battle, calculateBattleStats } from '@battlescope/common';
│   │
│   └── search/
│       ├── package.json
│       │   dependencies:
│       │     "@battlescope/common": "workspace:*"  # ⚠️ DEPENDENCY
│       └── src/
│           └── indexers/
│               └── battle-indexer.ts
│                   import { Battle } from '@battlescope/common';
```

**Problems**:
1. **Tight Coupling**: Clusterer and Search both depend on `@battlescope/common`
2. **Coordinated Deployments**: Change to `Battle` type requires updating both services
3. **Version Hell**: Services may run different versions of common package
4. **Cannot Deploy Independently**: Breaking change to common blocks all services
5. **Masked Coupling**: Looks like "clean code reuse" but creates distributed monolith

**Real-World Impact**:
```
Developer: "I need to add a field to Battle type"
Result:
  1. Update @battlescope/common/types/battle.ts
  2. Bump version to 1.5.0
  3. Update clusterer/package.json → "@battlescope/common": "1.5.0"
  4. Update search/package.json → "@battlescope/common": "1.5.0"
  5. Update enrichment/package.json → "@battlescope/common": "1.5.0"
  6. Run pnpm install across all services
  7. Fix all TypeScript errors in all services
  8. Deploy all services simultaneously
  ❌ Lost independent deployability
```

---

## The Correct Pattern: Duplicated Code

### ✅ Correct: Each Service Has Its Own Models

**Good Architecture**:
```
battle-monitor/
├── backend/
│   ├── clusterer/
│   │   ├── src/
│   │   │   ├── models/
│   │   │   │   ├── battle.ts              # Clusterer's Battle model
│   │   │   │   ├── participant.ts         # Clusterer's Participant model
│   │   │   │   └── killmail.ts           # Clusterer's Killmail model
│   │   │   ├── utils/
│   │   │   │   ├── battle-calculator.ts   # Clusterer's business logic
│   │   │   │   └── logger.ts             # Clusterer's logger setup
│   │   │   └── repositories/
│   │   │       └── battle-repository.ts   # Clusterer's DB access
│   │   └── package.json                   # NO common dependency
│   │
│   └── search/
│       ├── src/
│       │   ├── models/
│       │   │   └── battle.ts              # Search's Battle model (DIFFERENT)
│       │   ├── utils/
│       │   │   ├── battle-formatter.ts    # Search's formatting logic
│       │   │   └── logger.ts             # Search's logger setup
│       │   └── indexers/
│       │       └── battle-indexer.ts      # Search's indexing logic
│       └── package.json                   # NO common dependency
```

**Benefits**:
1. **Independent Evolution**: Clusterer can change its Battle model without affecting Search
2. **Independent Deployment**: Deploy Clusterer without touching Search
3. **Different Representations**: Clusterer's Battle has clustering fields, Search's has search fields
4. **No Version Conflicts**: Each service uses its own code
5. **True Microservices**: Services are genuinely independent

**Example - Different Models**:
```typescript
// backend/clusterer/src/models/battle.ts
export interface Battle {
  id: string;
  systemId: bigint;
  startTime: Date;
  endTime: Date;
  totalKills: bigint;
  totalIskDestroyed: bigint;
  // Fields specific to clustering
  clusteringAlgorithm: 'DBSCAN' | 'HIERARCHICAL';
  clusterConfidence: number;
  participantGraph: Map<string, Set<string>>;  // For clustering
}

// backend/search/src/models/battle.ts
export interface Battle {
  id: string;
  systemId: string;              // Different type (string for search)
  systemName: string;            // Additional field
  startTime: number;             // Different type (timestamp for sorting)
  endTime: number;
  totalKills: number;            // Different type (number for search)
  totalIskDestroyed: number;
  // Fields specific to search
  searchText: string;            // Full-text search field
  allianceIds: string[];         // Faceted search
  regionId: string;              // Geo search
  indexed_at: number;            // Search metadata
}
```

**Why Different Models are Good**:
- Clusterer needs graph structure for clustering algorithm
- Search needs flattened structure for Typesense indexing
- Different data types for different use cases
- No artificial "one size fits all" model

---

## What Can Be Shared: Patterns, Not Code

### ✅ Share: Documented Patterns

Instead of sharing code, document patterns that each service implements independently.

#### Pattern 1: Logging

**Document**: `/docs/patterns/logging.md`

```markdown
# Logging Pattern

All services MUST use pino for structured logging.

## Setup

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'SERVICE_NAME',  // Replace with actual service name
    version: process.env.VERSION || 'dev',
  },
});
```

## Usage

```typescript
logger.info({ userId: '123' }, 'User logged in');
logger.error({ error: err }, 'Failed to process');
```
```

**Implementation**:
```typescript
// backend/clusterer/src/utils/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'clusterer',
    version: process.env.VERSION || 'dev',
  },
});

// backend/search/src/utils/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'search',
    version: process.env.VERSION || 'dev',
  },
});
```

**Result**: Consistent logging across services, but no shared code.

---

#### Pattern 2: OpenTelemetry Setup

**Document**: `/docs/patterns/observability.md`

```markdown
# OpenTelemetry Pattern

All services MUST initialize OpenTelemetry with the following configuration.

## Setup

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'SERVICE_NAME',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.VERSION || 'dev',
  }),
  traceExporter: new JaegerExporter({
    endpoint: process.env.JAEGER_ENDPOINT || 'http://jaeger:14268/api/traces',
  }),
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
  ],
});

sdk.start();
```
```

**Implementation**:
```typescript
// backend/clusterer/src/observability/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
// ... same imports

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'clusterer',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.VERSION || 'dev',
  }),
  traceExporter: new JaegerExporter({
    endpoint: process.env.JAEGER_ENDPOINT || 'http://jaeger:14268/api/traces',
  }),
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
  ],
});

sdk.start();

// backend/search/src/observability/tracing.ts
// Same pattern, different service name
```

**Result**: Consistent tracing across services, but each service owns its setup.

---

#### Pattern 3: Database Migrations

**Document**: `/docs/patterns/database-migrations.md`

```markdown
# Database Migration Pattern

All services MUST use Kysely Migrator for schema migrations.

## Naming Convention

Migrations MUST follow: `YYYYMMDDHHMMSS_description.ts`

Example: `20241124120000_create_battles_table.ts`

## Migration Structure

```typescript
import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create or alter schema
}

export async function down(db: Kysely<any>): Promise<void> {
  // Revert changes
}
```

## Running Migrations

```bash
make db-migrate        # Run pending migrations
make db-rollback      # Rollback last migration
```
```

**Implementation**:
```typescript
// backend/clusterer/src/migrations/20241124120000_create_battles_table.ts
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('battles')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('system_id', 'bigint', (col) => col.notNull())
    .addColumn('start_time', 'timestamp', (col) => col.notNull())
    .execute();
}

// backend/search/src/migrations/20241124130000_create_search_index.ts
// Different schema for search service
```

**Result**: Consistent migration pattern, but each service has its own migrations.

---

### ✅ Share: Configuration Standards

**What can be shared**:
- ESLint configuration files (`.eslintrc.js`)
- TypeScript configuration base (`tsconfig.base.json`)
- Prettier configuration (`.prettierrc`)
- Vitest configuration patterns

**Example - Shared ESLint Config**:
```javascript
// .eslintrc.base.js (at root)
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    'complexity': ['error', 10],
    '@typescript-eslint/no-explicit-any': 'error',
  },
};

// backend/clusterer/.eslintrc.js
module.exports = {
  extends: ['../../.eslintrc.base.js'],
  // Service-specific overrides if needed
};
```

**Why this is okay**: Configuration files don't create runtime dependencies.

---

## Contract Sharing: Schema Files Only

### ✅ Correct: Share JSON Schema, Not TypeScript Types

**Event Producer (Clusterer)**:
```typescript
// backend/clusterer/contracts/events/battle.created.schema.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["eventId", "eventType", "data"],
  "properties": {
    "eventId": { "type": "string", "format": "uuid" },
    "eventType": { "type": "string", "const": "battle.created" },
    "data": {
      "type": "object",
      "required": ["battleId", "systemId"],
      "properties": {
        "battleId": { "type": "string" },
        "systemId": { "type": "string" }
      }
    }
  }
}

// backend/clusterer/src/events/publisher.ts
import Ajv from 'ajv';
import schema from '../../contracts/events/battle.created.schema.json';

const ajv = new Ajv();
const validate = ajv.compile(schema);

export function publishBattleCreated(battle: Battle) {
  const event = {
    eventId: uuidv4(),
    eventType: 'battle.created',
    data: {
      battleId: battle.id,
      systemId: battle.systemId.toString(),
    },
  };

  // Validate against schema
  if (!validate(event)) {
    throw new Error('Event validation failed');
  }

  return kafka.send({ topic: 'battle.created', messages: [event] });
}
```

**Event Consumer (Search)**:
```typescript
// backend/search/src/events/consumer.ts
import Ajv from 'ajv';
// Import schema from Clusterer's published contracts
import schema from '../../../clusterer/contracts/events/battle.created.schema.json';

const ajv = new Ajv();
const validate = ajv.compile(schema);

export async function onBattleCreated(message: KafkaMessage) {
  const event = JSON.parse(message.value.toString());

  // Validate against schema
  if (!validate(event)) {
    logger.error('Invalid event schema', { errors: validate.errors });
    return; // Skip invalid events
  }

  // Process event (with Search's own Battle type)
  await indexBattle({
    id: event.data.battleId,
    systemId: event.data.systemId,
    // ... map to Search's Battle model
  });
}
```

**Why this works**:
- Schema is the contract (language-agnostic)
- Each service validates independently
- No TypeScript type sharing
- Schema can be versioned separately
- Services can have different internal models

---

## Anti-Pattern Detection

### Red Flags: You're Doing It Wrong

❌ **Red Flag 1**: `import { Type } from '@battlescope/common'`
- Importing domain types from shared package

❌ **Red Flag 2**: `dependencies: { "@battlescope/database": "workspace:*" }`
- Service depends on another service's package

❌ **Red Flag 3**: `import { calculateBattleStats } from '@battlescope/utils'`
- Sharing business logic functions

❌ **Red Flag 4**: Monorepo packages with domain logic
```
packages/
├── common/
├── utils/
├── models/
└── repositories/
```

❌ **Red Flag 5**: Coordinated deployments
- "We need to deploy Clusterer and Search together"

### Green Flags: You're Doing It Right

✅ **Green Flag 1**: Each service has its own `models/` directory

✅ **Green Flag 2**: No `@battlescope/common` package exists

✅ **Green Flag 3**: Services can be deployed independently

✅ **Green Flag 4**: Code duplication between services
- "This looks like the Battle type from Clusterer, but it's different"

✅ **Green Flag 5**: Documented patterns in `/docs/patterns/`

---

## Summary: The Golden Rules

1. **Duplication > Coupling** - Duplicate code rather than share it between services
2. **Patterns, Not Libraries** - Document patterns, implement independently
3. **Schema for Contracts** - Use JSON Schema, not TypeScript types
4. **Config Files OK** - ESLint, TypeScript, Prettier configs can be shared
5. **Different Models** - Each service has its own domain models
6. **Independent Deployment** - Services must deploy without coordination
7. **No Business Logic Sharing** - Never share domain logic, calculations, or validations
8. **Documentation Over Packages** - Write docs on how to implement patterns

---

## How Claude Should Use This Skill

When I (Claude) am:

- **Creating types**: Each service gets its own types directory
- **Writing utilities**: Implement per-service, don't create shared utils
- **Refactoring**: If I see `@battlescope/common`, flag as anti-pattern
- **Adding dependencies**: Never add dependencies between services
- **Seeing duplicate code**: Recognize this as CORRECT, not "needs refactoring"
- **Proposing patterns**: Document pattern, don't create shared library

**If I suggest sharing code between services, I am WRONG.**

---

## References

- **Building Microservices** (Sam Newman) - Chapter on "Avoiding Shared Libraries"
- **Accelerate** (Nicole Forsgren) - Independent deployability metrics
- **Team Topologies** (Matthew Skelton) - Conway's Law and coupling
