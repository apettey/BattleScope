# Test Engineer

Ensure comprehensive test coverage (80%+) for all BattleScope backend services with high-quality, illustrative test cases.

## Purpose

This skill helps you create, maintain, and verify comprehensive test suites for backend services, ensuring code quality, reliability, and maintainability through systematic testing practices.

## When to Use

Invoke this skill when:
- Creating a new backend service
- Adding new features to existing services
- Refactoring code without breaking functionality
- Fixing bugs (write tests first)
- Reviewing test coverage
- Setting up CI/CD testing pipelines
- Investigating test failures

## Testing Standards

### Coverage Requirements

**Minimum Coverage: 80%**

| Service Type | Coverage Target | Priority Areas |
|-------------|-----------------|----------------|
| API Service | 85%+ | Routes, middleware, auth, validation |
| Worker Services | 80%+ | Job handlers, error handling, retries |
| Background Services | 80%+ | Core logic, state management |
| Shared Packages | 90%+ | Utilities, clients, core functions |

### Coverage Exclusions
- Configuration files
- Type definitions
- Entry points (index.ts with minimal logic)
- Generated code
- Migration scripts

## Test Types

### 1. Unit Tests (60% of tests)
**Purpose**: Test individual functions and classes in isolation

**Coverage Target**: All business logic, utilities, validators

**Example**:
```typescript
// src/utils/battle-calculator.ts
export function calculateBattleValue(killmails: Killmail[]): number {
  return killmails.reduce((sum, km) => sum + km.totalValue, 0);
}

// test/utils/battle-calculator.test.ts
import { describe, it, expect } from 'vitest';
import { calculateBattleValue } from '../../src/utils/battle-calculator.js';

describe('calculateBattleValue', () => {
  it('should calculate total value of killmails', () => {
    const killmails = [
      { totalValue: 1000 },
      { totalValue: 2000 },
      { totalValue: 3000 },
    ];

    expect(calculateBattleValue(killmails)).toBe(6000);
  });

  it('should return 0 for empty array', () => {
    expect(calculateBattleValue([])).toBe(0);
  });

  it('should handle single killmail', () => {
    const killmails = [{ totalValue: 5000 }];
    expect(calculateBattleValue(killmails)).toBe(5000);
  });

  it('should handle negative values', () => {
    const killmails = [
      { totalValue: 1000 },
      { totalValue: -500 },
    ];
    expect(calculateBattleValue(killmails)).toBe(500);
  });
});
```

### 2. Integration Tests (30% of tests)
**Purpose**: Test interactions between components

**Coverage Target**: Database queries, API clients, service interactions

**Example**:
```typescript
// test/integration/battle-repository.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase } from '../helpers/test-database.js';
import { BattleRepository } from '../../src/repositories/battle-repository.js';

describe('BattleRepository Integration', () => {
  let db: TestDatabase;
  let repository: BattleRepository;

  beforeAll(async () => {
    db = await createTestDatabase();
    repository = new BattleRepository(db.client);
  });

  afterAll(async () => {
    await db.cleanup();
  });

  describe('createBattle', () => {
    it('should insert battle and return ID', async () => {
      const battle = {
        startTime: new Date('2024-01-01T12:00:00Z'),
        endTime: new Date('2024-01-01T12:30:00Z'),
        systemId: 30000142,
      };

      const battleId = await repository.createBattle(battle);

      expect(battleId).toBeDefined();
      expect(typeof battleId).toBe('string');

      // Verify it was actually inserted
      const retrieved = await repository.getBattle(battleId);
      expect(retrieved).toMatchObject(battle);
    });

    it('should throw error for invalid systemId', async () => {
      const battle = {
        startTime: new Date(),
        endTime: new Date(),
        systemId: -1, // Invalid
      };

      await expect(repository.createBattle(battle))
        .rejects
        .toThrow('Invalid system ID');
    });
  });

  describe('getBattlesByDateRange', () => {
    it('should return battles within date range', async () => {
      // Setup: Create test data
      await repository.createBattle({
        startTime: new Date('2024-01-01T12:00:00Z'),
        endTime: new Date('2024-01-01T12:30:00Z'),
        systemId: 30000142,
      });

      await repository.createBattle({
        startTime: new Date('2024-01-05T12:00:00Z'),
        endTime: new Date('2024-01-05T12:30:00Z'),
        systemId: 30000142,
      });

      // Test
      const battles = await repository.getBattlesByDateRange(
        new Date('2024-01-01'),
        new Date('2024-01-02')
      );

      expect(battles).toHaveLength(1);
      expect(battles[0].startTime.getDate()).toBe(1);
    });

    it('should return empty array when no battles in range', async () => {
      const battles = await repository.getBattlesByDateRange(
        new Date('2024-12-01'),
        new Date('2024-12-02')
      );

      expect(battles).toHaveLength(0);
    });
  });
});
```

### 3. End-to-End Tests (10% of tests)
**Purpose**: Test complete user workflows

**Coverage Target**: Critical user paths, API endpoints

**Example**:
```typescript
// test/e2e/battle-creation-flow.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestServer } from '../helpers/test-server.js';
import type { TestServer } from '../helpers/test-server.js';

describe('Battle Creation E2E', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await setupTestServer();
  });

  afterAll(async () => {
    await server.cleanup();
  });

  it('should complete full battle creation flow', async () => {
    // 1. Ingest killmail
    const killmail = await server.ingestKillmail({
      killmail_id: 123456,
      killmail_time: '2024-01-01T12:00:00Z',
      solar_system_id: 30000142,
      victim: { character_id: 12345 },
      attackers: [{ character_id: 67890 }],
    });

    expect(killmail).toMatchObject({ status: 'queued' });

    // 2. Wait for enrichment
    await server.waitForJobCompletion('enrichment', killmail.id);

    // 3. Trigger clustering
    await server.triggerClustering();

    // 4. Verify battle was created
    const battles = await server.api.get('/api/battles');
    expect(battles.data).toHaveLength(1);

    const battle = battles.data[0];
    expect(battle.killmailIds).toContain(killmail.id);
    expect(battle.systemId).toBe(30000142);

    // 5. Retrieve battle details
    const details = await server.api.get(`/api/battles/${battle.id}`);
    expect(details.data.statistics).toBeDefined();
    expect(details.data.statistics.totalValue).toBeGreaterThan(0);
  });
});
```

## Test Organization

### Directory Structure

```
<service>/
├── src/
│   ├── index.ts
│   ├── routes/
│   ├── services/
│   ├── repositories/
│   └── utils/
└── test/
    ├── unit/                    # Unit tests mirror src/
    │   ├── routes/
    │   ├── services/
    │   ├── repositories/
    │   └── utils/
    ├── integration/             # Integration tests
    │   ├── database/
    │   ├── api-client/
    │   └── redis/
    ├── e2e/                     # End-to-end tests
    │   └── workflows/
    ├── helpers/                 # Test utilities
    │   ├── factories.ts         # Test data factories
    │   ├── fixtures.ts          # Static test data
    │   ├── mocks.ts             # Mock implementations
    │   └── test-database.ts     # Database test setup
    └── setup.ts                 # Global test setup
```

### Naming Conventions

- Test files: `<module-name>.test.ts`
- Test helpers: `<helper-name>.ts` (no .test suffix)
- Factories: `<entity>-factory.ts`
- Fixtures: `<entity>-fixtures.ts`

## Test Implementation Guide

### Step 1: Set Up Test Infrastructure

#### Configure Vitest

**File**: `<service>/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'dist/**',
        'test/**',
        '**/*.config.ts',
        '**/index.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
```

#### Create Test Setup

**File**: `<service>/test/setup.ts`

```typescript
import { beforeAll, afterAll, afterEach } from 'vitest';
import { setupTestDatabase } from './helpers/test-database.js';
import { setupTestRedis } from './helpers/test-redis.js';

// Global test setup
let testDb: any;
let testRedis: any;

beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';

  // Setup test database
  testDb = await setupTestDatabase();

  // Setup test Redis
  testRedis = await setupTestRedis();
});

afterEach(async () => {
  // Clean up after each test
  if (testDb) {
    await testDb.clearAllTables();
  }
  if (testRedis) {
    await testRedis.flushAll();
  }
});

afterAll(async () => {
  // Cleanup connections
  if (testDb) {
    await testDb.destroy();
  }
  if (testRedis) {
    await testRedis.quit();
  }
});
```

### Step 2: Create Test Helpers

#### Database Helper

**File**: `<service>/test/helpers/test-database.ts`

```typescript
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../../src/types/database.js';

export interface TestDatabase {
  client: Kysely<Database>;
  clearAllTables: () => Promise<void>;
  destroy: () => Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const pool = new Pool({
    host: process.env.TEST_POSTGRES_HOST || 'localhost',
    port: Number(process.env.TEST_POSTGRES_PORT) || 5432,
    database: process.env.TEST_POSTGRES_DB || 'battlescope_test',
    user: process.env.TEST_POSTGRES_USER || 'postgres',
    password: process.env.TEST_POSTGRES_PASSWORD || 'postgres',
  });

  const client = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });

  // Run migrations
  // await migrateToLatest(client);

  return {
    client,
    async clearAllTables() {
      // Delete in correct order to respect foreign keys
      await client.deleteFrom('battle_participants').execute();
      await client.deleteFrom('battles').execute();
      await client.deleteFrom('killmails').execute();
      // ... other tables
    },
    async destroy() {
      await client.destroy();
    },
  };
}
```

#### Factory Helper

**File**: `<service>/test/helpers/factories.ts`

```typescript
import { Factory } from 'fishery';
import type { Battle, Killmail } from '../../src/types/database.js';

// Battle factory
export const battleFactory = Factory.define<Battle>(({ sequence }) => ({
  id: `battle-${sequence}`,
  startTime: new Date('2024-01-01T12:00:00Z'),
  endTime: new Date('2024-01-01T12:30:00Z'),
  systemId: 30000142,
  systemName: 'Jita',
  killmailCount: 10,
  totalValue: 1000000000,
  createdAt: new Date(),
  updatedAt: new Date(),
}));

// Killmail factory
export const killmailFactory = Factory.define<Killmail>(({ sequence }) => ({
  id: `km-${sequence}`,
  zkbId: sequence,
  killTime: new Date('2024-01-01T12:00:00Z'),
  systemId: 30000142,
  victimCharacterId: 12345,
  victimCorporationId: 98765,
  victimAllianceId: 11111,
  victimShipTypeId: 587,
  totalValue: 100000000,
  rawData: {},
  createdAt: new Date(),
}));

// Usage in tests:
// const battle = battleFactory.build();
// const battles = battleFactory.buildList(5);
// const customBattle = battleFactory.build({ systemId: 30000143 });
```

#### Mock Helper

**File**: `<service>/test/helpers/mocks.ts`

```typescript
import { vi } from 'vitest';
import type { EsiClient } from '@battlescope/esi-client';

export function createMockEsiClient(): EsiClient {
  return {
    getKillmail: vi.fn().mockResolvedValue({
      killmail_id: 123456,
      killmail_time: '2024-01-01T12:00:00Z',
      victim: { character_id: 12345 },
      attackers: [],
    }),
    getCharacter: vi.fn().mockResolvedValue({
      character_id: 12345,
      name: 'Test Character',
      corporation_id: 98765,
    }),
    // ... other methods
  } as any;
}

export function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  };
}
```

### Step 3: Write Comprehensive Tests

#### Example: Service with Full Coverage

**File**: `src/services/battle-clusterer.ts`

```typescript
export class BattleClusterer {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly config: ClusterConfig,
  ) {}

  async clusterKillmails(killmails: Killmail[]): Promise<Battle[]> {
    if (killmails.length === 0) {
      return [];
    }

    // Sort by time
    const sorted = [...killmails].sort(
      (a, b) => a.killTime.getTime() - b.killTime.getTime()
    );

    const clusters: Killmail[][] = [];
    let currentCluster: Killmail[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];

      const timeDiff = curr.killTime.getTime() - prev.killTime.getTime();
      const maxGap = this.config.maxGapMinutes * 60 * 1000;

      if (
        timeDiff <= maxGap &&
        curr.systemId === prev.systemId
      ) {
        currentCluster.push(curr);
      } else {
        if (currentCluster.length >= this.config.minKillmails) {
          clusters.push(currentCluster);
        }
        currentCluster = [curr];
      }
    }

    // Don't forget last cluster
    if (currentCluster.length >= this.config.minKillmails) {
      clusters.push(currentCluster);
    }

    // Create battles
    const battles = await Promise.all(
      clusters.map(cluster => this.createBattle(cluster))
    );

    return battles;
  }

  private async createBattle(killmails: Killmail[]): Promise<Battle> {
    // Implementation...
  }
}
```

**File**: `test/unit/services/battle-clusterer.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { BattleClusterer } from '../../../src/services/battle-clusterer.js';
import { createMockDatabase } from '../../helpers/mocks.js';
import { killmailFactory } from '../../helpers/factories.js';

describe('BattleClusterer', () => {
  let clusterer: BattleClusterer;
  let mockDb: any;

  beforeEach(() => {
    mockDb = createMockDatabase();
    clusterer = new BattleClusterer(mockDb, {
      maxGapMinutes: 10,
      minKillmails: 3,
    });
  });

  describe('clusterKillmails', () => {
    it('should return empty array for no killmails', async () => {
      const result = await clusterer.clusterKillmails([]);
      expect(result).toEqual([]);
    });

    it('should create single cluster for consecutive killmails', async () => {
      const killmails = [
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:00:00Z'),
          systemId: 30000142,
        }),
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:05:00Z'),
          systemId: 30000142,
        }),
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:08:00Z'),
          systemId: 30000142,
        }),
      ];

      const result = await clusterer.clusterKillmails(killmails);

      expect(result).toHaveLength(1);
      expect(result[0].killmailCount).toBe(3);
    });

    it('should split clusters when gap exceeds maxGapMinutes', async () => {
      const killmails = [
        // Cluster 1
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:00:00Z'),
          systemId: 30000142,
        }),
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:05:00Z'),
          systemId: 30000142,
        }),
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:08:00Z'),
          systemId: 30000142,
        }),
        // Gap of 15 minutes
        // Cluster 2
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:25:00Z'),
          systemId: 30000142,
        }),
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:28:00Z'),
          systemId: 30000142,
        }),
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:30:00Z'),
          systemId: 30000142,
        }),
      ];

      const result = await clusterer.clusterKillmails(killmails);

      expect(result).toHaveLength(2);
      expect(result[0].killmailCount).toBe(3);
      expect(result[1].killmailCount).toBe(3);
    });

    it('should split clusters when system changes', async () => {
      const killmails = [
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:00:00Z'),
          systemId: 30000142, // Jita
        }),
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:05:00Z'),
          systemId: 30000142,
        }),
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:08:00Z'),
          systemId: 30000142,
        }),
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:09:00Z'),
          systemId: 30000143, // Different system
        }),
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:10:00Z'),
          systemId: 30000143,
        }),
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:11:00Z'),
          systemId: 30000143,
        }),
      ];

      const result = await clusterer.clusterKillmails(killmails);

      expect(result).toHaveLength(2);
      expect(result[0].systemId).toBe(30000142);
      expect(result[1].systemId).toBe(30000143);
    });

    it('should ignore clusters below minKillmails threshold', async () => {
      const killmails = [
        // Only 2 killmails (below threshold of 3)
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:00:00Z'),
          systemId: 30000142,
        }),
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:05:00Z'),
          systemId: 30000142,
        }),
      ];

      const result = await clusterer.clusterKillmails(killmails);

      expect(result).toHaveLength(0);
    });

    it('should handle killmails in random order', async () => {
      const killmails = [
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:08:00Z'),
        }),
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:00:00Z'),
        }),
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:05:00Z'),
        }),
      ];

      const result = await clusterer.clusterKillmails(killmails);

      // Should still create cluster after sorting
      expect(result).toHaveLength(1);
    });

    it('should handle edge case of exactly maxGapMinutes', async () => {
      const killmails = [
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:00:00Z'),
        }),
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:10:00Z'), // Exactly 10 minutes
        }),
        killmailFactory.build({
          killTime: new Date('2024-01-01T12:15:00Z'),
        }),
      ];

      const result = await clusterer.clusterKillmails(killmails);

      // Should be in same cluster
      expect(result).toHaveLength(1);
      expect(result[0].killmailCount).toBe(3);
    });
  });
});
```

### Step 4: Run and Verify Coverage

```bash
# Run all tests
pnpm --filter @battlescope/<service> test

# Run tests with coverage
pnpm --filter @battlescope/<service> test --coverage

# Run specific test file
pnpm --filter @battlescope/<service> test path/to/file.test.ts

# Run tests in watch mode
pnpm --filter @battlescope/<service> test --watch

# Run tests matching pattern
pnpm --filter @battlescope/<service> test --grep "BattleClusterer"
```

## Coverage Verification

### Check Current Coverage

```bash
# Generate coverage report
pnpm --filter @battlescope/<service> test --coverage

# View HTML report
open backend/<service>/coverage/index.html
```

### Identify Uncovered Lines

```bash
# Coverage will show:
# - Lines not covered (red in HTML report)
# - Branches not taken
# - Functions not called

# Focus on:
# 1. Critical business logic
# 2. Error handling paths
# 3. Edge cases
```

### Improve Coverage

```typescript
// Example: Uncovered error path
export function processPayment(amount: number): void {
  if (amount < 0) {
    throw new Error('Amount cannot be negative'); // Not covered!
  }
  // ... rest of logic
}

// Add test:
it('should throw error for negative amount', () => {
  expect(() => processPayment(-100))
    .toThrow('Amount cannot be negative');
});
```

## Test Quality Standards

### Characteristics of Good Tests

1. **Independent**: Tests don't depend on each other
2. **Repeatable**: Same result every time
3. **Fast**: Run quickly (< 100ms per unit test)
4. **Comprehensive**: Cover all paths
5. **Maintainable**: Easy to understand and update
6. **Illustrative**: Serve as documentation

### AAA Pattern (Arrange-Act-Assert)

```typescript
it('should calculate battle value correctly', () => {
  // Arrange: Set up test data
  const killmails = [
    { totalValue: 1000 },
    { totalValue: 2000 },
  ];

  // Act: Execute the function
  const result = calculateBattleValue(killmails);

  // Assert: Verify the result
  expect(result).toBe(3000);
});
```

### Descriptive Test Names

```typescript
// ✅ Good: Describes what is being tested
it('should return empty array when no battles in date range', () => {});

// ❌ Bad: Vague or unhelpful
it('test 1', () => {});
it('works', () => {});
```

### Test One Thing

```typescript
// ✅ Good: Single responsibility
it('should calculate total value', () => {
  const result = calculateBattleValue(killmails);
  expect(result).toBe(6000);
});

it('should handle empty array', () => {
  const result = calculateBattleValue([]);
  expect(result).toBe(0);
});

// ❌ Bad: Testing multiple concerns
it('should calculate value and handle errors and validate input', () => {
  // Too much in one test!
});
```

### Use Meaningful Test Data

```typescript
// ✅ Good: Clear and relevant
const user = {
  id: 'user-123',
  name: 'John Doe',
  email: 'john@example.com',
};

// ❌ Bad: Magic numbers and unclear data
const user = {
  id: 1,
  name: 'a',
  email: 'b',
};
```

## Test Categories Checklist

For each service, ensure coverage of:

### Business Logic
- [ ] Core algorithms
- [ ] Calculations and transformations
- [ ] Business rules and validations
- [ ] State machines and workflows

### Error Handling
- [ ] Invalid input
- [ ] Boundary conditions
- [ ] Exception paths
- [ ] Timeout scenarios
- [ ] Network failures

### Data Layer
- [ ] CRUD operations
- [ ] Queries with filters
- [ ] Transactions
- [ ] Constraint violations
- [ ] Migration compatibility

### API Layer
- [ ] Request validation
- [ ] Authentication/authorization
- [ ] Response formatting
- [ ] Error responses
- [ ] Rate limiting

### Integration Points
- [ ] Database connections
- [ ] Redis operations
- [ ] External API calls
- [ ] Message queue operations
- [ ] File system operations

### Edge Cases
- [ ] Empty inputs
- [ ] Null/undefined values
- [ ] Very large numbers
- [ ] Special characters
- [ ] Concurrent operations

## CI/CD Integration

### Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage",
    "test:coverage:ci": "vitest run --coverage --reporter=json --reporter=default",
    "test:unit": "vitest run test/unit",
    "test:integration": "vitest run test/integration",
    "test:e2e": "vitest run test/e2e"
  }
}
```

### GitHub Actions

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: battlescope_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests with coverage
        run: pnpm test:coverage
        env:
          TEST_POSTGRES_HOST: localhost
          TEST_POSTGRES_PORT: 5432
          TEST_POSTGRES_USER: postgres
          TEST_POSTGRES_PASSWORD: postgres
          TEST_POSTGRES_DB: battlescope_test
          TEST_REDIS_URL: redis://localhost:6379

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: true

      - name: Check coverage thresholds
        run: |
          COVERAGE=$(jq '.total.lines.pct' coverage/coverage-summary.json)
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80% threshold"
            exit 1
          fi
```

## Common Testing Patterns

### Testing Async Code

```typescript
it('should fetch data asynchronously', async () => {
  const result = await fetchData();
  expect(result).toBeDefined();
});

it('should handle rejected promises', async () => {
  await expect(fetchInvalidData())
    .rejects
    .toThrow('Not found');
});
```

### Testing Timers

```typescript
import { vi } from 'vitest';

it('should call function after delay', () => {
  vi.useFakeTimers();

  const callback = vi.fn();
  scheduleCallback(callback, 1000);

  // Fast-forward time
  vi.advanceTimersByTime(1000);

  expect(callback).toHaveBeenCalledOnce();

  vi.useRealTimers();
});
```

### Testing Database Transactions

```typescript
it('should rollback on error', async () => {
  await expect(async () => {
    await db.transaction().execute(async (trx) => {
      await trx.insertInto('battles').values(battle).execute();
      throw new Error('Simulated error');
    });
  }).rejects.toThrow('Simulated error');

  // Verify rollback
  const count = await db
    .selectFrom('battles')
    .select(db.fn.count('id').as('count'))
    .executeTakeFirst();

  expect(Number(count?.count)).toBe(0);
});
```

### Testing HTTP APIs

```typescript
import request from 'supertest';

describe('GET /api/battles/:id', () => {
  it('should return battle details', async () => {
    const battle = await createTestBattle();

    const response = await request(app)
      .get(`/api/battles/${battle.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: battle.id,
      systemId: battle.systemId,
      killmailCount: battle.killmailCount,
    });
  });

  it('should return 404 for non-existent battle', async () => {
    await request(app)
      .get('/api/battles/non-existent-id')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);
  });

  it('should return 401 without authentication', async () => {
    await request(app)
      .get('/api/battles/some-id')
      .expect(401);
  });
});
```

## Documentation Integration

When creating tests:

1. **Update Implementation Summary**
   ```markdown
   ## Testing

   ### Unit Tests
   - Coverage: 85%
   - Key test files:
     - `test/unit/services/battle-clusterer.test.ts`
     - `test/unit/repositories/battle-repository.test.ts`

   ### Integration Tests
   - Database integration: ✅
   - Redis integration: ✅
   - ESI client integration: ✅
   ```

2. **Document Test Patterns**
   - Add examples of complex test setups
   - Document custom test helpers
   - Explain testing decisions

3. **Update Architecture Docs**
   - Note test coverage percentage
   - Document testing strategy
   - List testing dependencies

## Troubleshooting

### Tests are Slow
**Solution**:
- Use `vi.mock()` for external dependencies
- Use in-memory databases for unit tests
- Parallelize test execution
- Reduce test data size

### Flaky Tests
**Solution**:
- Remove time-dependent logic
- Use `vi.useFakeTimers()`
- Avoid shared state between tests
- Add proper `beforeEach`/`afterEach` cleanup

### Low Coverage on Specific Files
**Solution**:
- Identify uncovered branches with coverage report
- Add tests for error paths
- Test edge cases and boundary conditions
- Consider if code is untestable (refactor if needed)

## Success Metrics

- ✅ 80%+ line coverage across all services
- ✅ 80%+ branch coverage
- ✅ All critical paths tested
- ✅ Tests run in < 30 seconds per service
- ✅ Zero flaky tests
- ✅ Tests serve as documentation
- ✅ CI/CD pipeline enforces coverage

## Quick Commands

```bash
# Run tests for specific service
pnpm --filter @battlescope/api test

# Generate coverage report
pnpm --filter @battlescope/api test --coverage

# Run tests in watch mode
pnpm --filter @battlescope/api test --watch

# Run only unit tests
pnpm --filter @battlescope/api test test/unit

# Run tests matching pattern
pnpm --filter @battlescope/api test --grep "BattleClusterer"

# Debug specific test
pnpm --filter @battlescope/api test --reporter=verbose test/unit/services/battle-clusterer.test.ts
```

## Related Documentation

- **Architecture**: [docs/architecture.md](../../docs/architecture.md)
- **CI/CD**: [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- **Feature Docs**: [docs/features/](../../docs/features/)

## Related Skills

- `feature-documenter`: Document test strategy in implementation summaries
- `docker-docs-maintainer`: Ensure test commands documented in Docker images

---

**Last Updated**: 2025-11-12
**Coverage Target**: 80%+
**Test Framework**: Vitest
**Coverage Tool**: V8
