# Claude Skill: Testing Standards and Coverage

**Purpose**: Ensure comprehensive test coverage, reliable tests, and confidence in code changes across the BattleScope system.

---

## Core Principle

**All code MUST have minimum 80% test coverage with meaningful tests that verify behavior, not implementation.**

**Rationale**:
- High coverage reduces bugs in production
- Tests serve as living documentation
- Refactoring confidence requires comprehensive tests
- Integration tests verify system behavior end-to-end
- Test quality matters more than coverage percentage alone

---

## Test Coverage Requirements

### 1. Coverage Thresholds

**Rule**: ALL services and libraries MUST meet minimum coverage thresholds.

**Minimum Coverage**:
- **Lines**: 80%
- **Functions**: 80%
- **Branches**: 75%
- **Statements**: 80%

**Vitest Configuration**:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        '**/*.test.ts',
        '**/*.config.ts',
        '**/types/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
```

---

## Test Types and Strategies

### 2. Unit Tests

**Rule**: Unit tests MUST test individual functions/classes in isolation.

**Characteristics**:
- Fast (< 100ms per test)
- No external dependencies (databases, APIs, file system)
- Use mocks/stubs for dependencies
- Test one thing per test
- Follow AAA pattern (Arrange, Act, Assert)

**Example - Testing Pure Logic**:

```typescript
// src/services/clustering/algorithm.ts
export function calculateDistance(
  killmail1: { occurredAt: Date; systemId: bigint },
  killmail2: { occurredAt: Date; systemId: bigint },
): number {
  // Different systems = infinite distance
  if (killmail1.systemId !== killmail2.systemId) {
    return Infinity;
  }

  // Time distance in minutes
  const timeDiff = Math.abs(
    killmail1.occurredAt.getTime() - killmail2.occurredAt.getTime()
  );
  return timeDiff / 1000 / 60; // Minutes
}

// test/unit/services/clustering/algorithm.test.ts
import { describe, it, expect } from 'vitest';
import { calculateDistance } from '../../../../src/services/clustering/algorithm';

describe('calculateDistance', () => {
  it('returns Infinity for killmails in different systems', () => {
    // Arrange
    const killmail1 = {
      occurredAt: new Date('2024-05-01T12:00:00Z'),
      systemId: 30000142n, // Jita
    };
    const killmail2 = {
      occurredAt: new Date('2024-05-01T12:05:00Z'),
      systemId: 30002187n, // Amarr
    };

    // Act
    const distance = calculateDistance(killmail1, killmail2);

    // Assert
    expect(distance).toBe(Infinity);
  });

  it('calculates time distance in minutes for same system', () => {
    // Arrange
    const killmail1 = {
      occurredAt: new Date('2024-05-01T12:00:00Z'),
      systemId: 30000142n,
    };
    const killmail2 = {
      occurredAt: new Date('2024-05-01T12:15:00Z'), // 15 minutes later
      systemId: 30000142n,
    };

    // Act
    const distance = calculateDistance(killmail1, killmail2);

    // Assert
    expect(distance).toBe(15);
  });

  it('handles killmails in reverse chronological order', () => {
    // Arrange
    const killmail1 = {
      occurredAt: new Date('2024-05-01T12:15:00Z'), // Later
      systemId: 30000142n,
    };
    const killmail2 = {
      occurredAt: new Date('2024-05-01T12:00:00Z'), // Earlier
      systemId: 30000142n,
    };

    // Act
    const distance = calculateDistance(killmail1, killmail2);

    // Assert
    expect(distance).toBe(15); // Still 15 minutes (absolute difference)
  });
});
```

**Example - Testing with Mocks**:

```typescript
// src/services/battle-service.ts
export class BattleService {
  constructor(
    private repository: BattleRepository,
    private publisher: EventPublisher,
  ) {}

  async createBattle(data: NewBattle): Promise<Battle> {
    const battle = await this.repository.create(data);
    await this.publisher.publish('battle.created', battle);
    return battle;
  }
}

// test/unit/services/battle-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BattleService } from '../../../src/services/battle-service';
import type { BattleRepository } from '../../../src/repositories/battle-repository';
import type { EventPublisher } from '../../../src/services/events/publisher';

describe('BattleService', () => {
  let service: BattleService;
  let mockRepository: BattleRepository;
  let mockPublisher: EventPublisher;

  beforeEach(() => {
    // Create mocks
    mockRepository = {
      create: vi.fn(),
    } as unknown as BattleRepository;

    mockPublisher = {
      publish: vi.fn(),
    } as unknown as EventPublisher;

    service = new BattleService(mockRepository, mockPublisher);
  });

  it('creates battle and publishes event', async () => {
    // Arrange
    const newBattle = {
      systemId: 30000142n,
      startTime: new Date('2024-05-01T12:00:00Z'),
      endTime: new Date('2024-05-01T14:00:00Z'),
      totalKills: 10n,
      totalIskDestroyed: 1000000000n,
    };

    const createdBattle = {
      id: 'battle-123',
      ...newBattle,
    };

    vi.mocked(mockRepository.create).mockResolvedValue(createdBattle);
    vi.mocked(mockPublisher.publish).mockResolvedValue(undefined);

    // Act
    const result = await service.createBattle(newBattle);

    // Assert
    expect(result).toEqual(createdBattle);
    expect(mockRepository.create).toHaveBeenCalledWith(newBattle);
    expect(mockPublisher.publish).toHaveBeenCalledWith('battle.created', createdBattle);
  });

  it('throws error if repository fails', async () => {
    // Arrange
    const newBattle = {
      systemId: 30000142n,
      startTime: new Date(),
      endTime: new Date(),
      totalKills: 10n,
      totalIskDestroyed: 1000000000n,
    };

    vi.mocked(mockRepository.create).mockRejectedValue(new Error('Database error'));

    // Act & Assert
    await expect(service.createBattle(newBattle)).rejects.toThrow('Database error');
    expect(mockPublisher.publish).not.toHaveBeenCalled();
  });
});
```

---

### 3. Integration Tests

**Rule**: Integration tests MUST verify interactions between components.

**Characteristics**:
- Slower (< 5s per test)
- Use real dependencies (database, message queue)
- Test multiple components together
- Use test containers or in-memory equivalents
- Clean up state between tests

**Example - Database Integration Test**:

```typescript
// test/integration/repositories/battle-repository.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Kysely } from 'kysely';
import { newDb } from 'pg-mem';
import { BattleRepository } from '../../../src/repositories/battle-repository';
import { setupTestDatabase } from '../../helpers/database';

describe('BattleRepository Integration', () => {
  let db: Kysely<Database>;
  let repository: BattleRepository;

  beforeAll(async () => {
    // Setup in-memory PostgreSQL
    db = await setupTestDatabase();
    repository = new BattleRepository(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    // Clean database before each test
    await db.deleteFrom('battles').execute();
  });

  it('creates and retrieves battle', async () => {
    // Arrange
    const newBattle = {
      id: 'battle-123',
      systemId: 30000142n,
      startTime: new Date('2024-05-01T12:00:00Z'),
      endTime: new Date('2024-05-01T14:00:00Z'),
      totalKills: 10n,
      totalIskDestroyed: 1000000000n,
    };

    // Act
    const created = await repository.create(newBattle);
    const retrieved = await repository.findById(created.id);

    // Assert
    expect(retrieved).toMatchObject({
      id: created.id,
      systemId: 30000142n,
      totalKills: 10n,
    });
  });

  it('finds overlapping battles in time window', async () => {
    // Arrange
    const battle1 = await repository.create({
      id: 'battle-1',
      systemId: 30000142n,
      startTime: new Date('2024-05-01T12:00:00Z'),
      endTime: new Date('2024-05-01T12:30:00Z'),
      totalKills: 5n,
      totalIskDestroyed: 500000000n,
    });

    const battle2 = await repository.create({
      id: 'battle-2',
      systemId: 30000142n,
      startTime: new Date('2024-05-01T12:45:00Z'),
      endTime: new Date('2024-05-01T13:15:00Z'),
      totalKills: 8n,
      totalIskDestroyed: 800000000n,
    });

    // Act
    const overlapping = await repository.findOverlappingBattles(
      30000142n,
      new Date('2024-05-01T12:20:00Z'), // Overlaps battle1
      new Date('2024-05-01T13:00:00Z'), // Overlaps battle2
      60, // 60 minute lookback
    );

    // Assert
    expect(overlapping).toHaveLength(2);
    expect(overlapping.map(b => b.id)).toContain(battle1.id);
    expect(overlapping.map(b => b.id)).toContain(battle2.id);
  });
});
```

**Example - Kafka Integration Test**:

```typescript
// test/integration/events/battle-events.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Kafka, Producer, Consumer } from 'kafkajs';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { BattleEventPublisher } from '../../../src/services/events/publisher';

describe('Battle Events Integration', () => {
  let kafkaContainer: StartedTestContainer;
  let producer: Producer;
  let consumer: Consumer;
  let publisher: BattleEventPublisher;

  beforeAll(async () => {
    // Start Kafka container
    kafkaContainer = await new GenericContainer('confluentinc/cp-kafka:7.5.0')
      .withExposedPorts(9093)
      .withEnvironment({
        KAFKA_BROKER_ID: '1',
        KAFKA_ZOOKEEPER_CONNECT: 'zookeeper:2181',
        KAFKA_ADVERTISED_LISTENERS: 'PLAINTEXT://localhost:9093',
      })
      .start();

    const kafka = new Kafka({
      clientId: 'test',
      brokers: [`localhost:${kafkaContainer.getMappedPort(9093)}`],
    });

    producer = kafka.producer();
    consumer = kafka.consumer({ groupId: 'test-group' });

    await producer.connect();
    await consumer.connect();

    publisher = new BattleEventPublisher(producer);
  }, 60000);

  afterAll(async () => {
    await producer.disconnect();
    await consumer.disconnect();
    await kafkaContainer.stop();
  });

  it('publishes and consumes battle.created event', async () => {
    // Arrange
    const topic = 'battle.created';
    await consumer.subscribe({ topic, fromBeginning: true });

    const receivedEvents: any[] = [];
    consumer.run({
      eachMessage: async ({ message }) => {
        receivedEvents.push(JSON.parse(message.value!.toString()));
      },
    });

    const battle = {
      id: 'battle-123',
      systemId: 30000142n,
      startTime: new Date('2024-05-01T12:00:00Z'),
      endTime: new Date('2024-05-01T14:00:00Z'),
      totalKills: 10n,
      totalIskDestroyed: 1000000000n,
    };

    // Act
    await publisher.publishBattleCreated(battle);

    // Wait for message
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Assert
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]).toMatchObject({
      eventType: 'battle.created',
      data: {
        battleId: 'battle-123',
        systemId: '30000142', // BigInt serialized as string
      },
    });
  });
});
```

---

### 4. End-to-End Tests

**Rule**: E2E tests MUST verify complete user workflows.

**Characteristics**:
- Slowest (< 30s per test)
- Test entire system (all services running)
- Use docker-compose or Kubernetes
- Simulate real user scenarios
- Run less frequently (nightly, pre-release)

**Example - Battle Creation E2E Test**:

```typescript
// test/e2e/battle-creation-flow.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';
import { setupE2EEnvironment, teardownE2EEnvironment } from '../helpers/e2e-setup';

describe('Battle Creation E2E', () => {
  let baseURL: string;

  beforeAll(async () => {
    // Start all services with docker-compose
    baseURL = await setupE2EEnvironment();
  }, 120000); // 2 minute timeout for startup

  afterAll(async () => {
    await teardownE2EEnvironment();
  });

  it('creates battle from killmail ingestion to search indexing', async () => {
    // Step 1: Ingest killmail
    const killmailResponse = await axios.post(`${baseURL}/api/ingestion/killmails`, {
      killmailId: 123456,
      systemId: 30000142,
      occurredAt: '2024-05-01T12:00:00Z',
      // ... full killmail data
    });
    expect(killmailResponse.status).toBe(201);

    // Step 2: Wait for enrichment and clustering
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 3: Check battle was created
    const battlesResponse = await axios.get(`${baseURL}/api/battles`, {
      params: { systemId: 30000142 },
    });
    expect(battlesResponse.status).toBe(200);
    expect(battlesResponse.data.battles).toHaveLength(1);

    const battle = battlesResponse.data.battles[0];
    expect(battle.systemId).toBe('30000142');
    expect(battle.totalKills).toBe('1');

    // Step 4: Verify battle is searchable
    const searchResponse = await axios.get(`${baseURL}/api/search/battles`, {
      params: { q: 'Jita' },
    });
    expect(searchResponse.status).toBe(200);
    expect(searchResponse.data.results).toContainEqual(
      expect.objectContaining({ id: battle.id })
    );
  });
});
```

---

### 5. Contract Tests

**Rule**: Contract tests MUST verify API contracts and event schemas.

**Characteristics**:
- Fast (< 200ms per test)
- Validate against OpenAPI specs and JSON schemas
- Run on every commit
- Catch breaking changes early

**Example - OpenAPI Contract Test**:

```typescript
// test/contract/openapi.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server';
import { validateResponse } from 'openapi-response-validator';
import fs from 'fs/promises';
import yaml from 'yaml';

describe('OpenAPI Contract Validation', () => {
  let openApiSpec: any;

  beforeAll(async () => {
    const specYaml = await fs.readFile('./contracts/openapi.yaml', 'utf-8');
    openApiSpec = yaml.parse(specYaml);
  });

  it('GET /api/battles matches OpenAPI response schema', async () => {
    // Act
    const response = await request(app).get('/api/battles').query({ limit: 10 });

    // Assert
    expect(response.status).toBe(200);

    const validator = validateResponse(
      openApiSpec.paths['/api/battles'].get.responses['200']
    );
    const errors = validator(response.body);
    expect(errors).toBeUndefined();
  });

  it('GET /api/battles/:id returns 404 for non-existent battle', async () => {
    // Act
    const response = await request(app).get('/api/battles/non-existent-id');

    // Assert
    expect(response.status).toBe(404);

    const validator = validateResponse(
      openApiSpec.paths['/api/battles/{battleId}'].get.responses['404']
    );
    const errors = validator(response.body);
    expect(errors).toBeUndefined();
  });
});
```

**Example - Event Schema Contract Test**:

```typescript
// test/contract/events/battle-created.test.ts
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs/promises';
import { BattleEventPublisher } from '../../../src/services/events/publisher';

describe('battle.created Event Contract', () => {
  let ajv: Ajv;
  let schema: any;

  beforeAll(async () => {
    const schemaJson = await fs.readFile(
      './contracts/events/battle.created.schema.json',
      'utf-8'
    );
    schema = JSON.parse(schemaJson);

    ajv = new Ajv({ strict: true, allErrors: true });
    addFormats(ajv);
  });

  it('published event matches schema', async () => {
    // Arrange
    const publisher = new BattleEventPublisher(mockProducer);
    const battle = {
      id: 'battle-123',
      systemId: 30000142n,
      startTime: new Date('2024-05-01T12:00:00Z'),
      endTime: new Date('2024-05-01T14:00:00Z'),
      totalKills: 10n,
      totalIskDestroyed: 1000000000n,
    };

    // Act
    const event = publisher.createBattleCreatedEvent(battle);

    // Assert
    const validate = ajv.compile(schema);
    const valid = validate(event);

    if (!valid) {
      console.error('Validation errors:', validate.errors);
    }

    expect(valid).toBe(true);
  });
});
```

---

## Test Organization

### 6. Test File Structure

**Rule**: Test files MUST mirror source file structure.

**Structure**:

```
backend/clusterer/
├── src/
│   ├── services/
│   │   └── clustering/
│   │       ├── service.ts
│   │       └── algorithm.ts
│   └── repositories/
│       └── battle-repository.ts
├── test/
│   ├── unit/                        # Unit tests
│   │   ├── services/
│   │   │   └── clustering/
│   │   │       ├── service.test.ts
│   │   │       └── algorithm.test.ts
│   │   └── repositories/
│   │       └── battle-repository.test.ts
│   ├── integration/                 # Integration tests
│   │   ├── repositories/
│   │   │   └── battle-repository.test.ts
│   │   └── events/
│   │       └── kafka-flow.test.ts
│   ├── contract/                    # Contract tests
│   │   ├── openapi.test.ts
│   │   └── events/
│   │       └── battle.created.test.ts
│   ├── e2e/                         # End-to-end tests
│   │   └── battle-creation-flow.test.ts
│   └── helpers/                     # Test utilities
│       ├── database.ts
│       ├── mocks.ts
│       └── e2e-setup.ts
```

---

### 7. Test Helpers and Fixtures

**Rule**: Reuse test setup code with helpers and fixtures.

**Example - Database Helper**:

```typescript
// test/helpers/database.ts
import { Kysely } from 'kysely';
import { newDb } from 'pg-mem';
import type { Database } from '../../src/types/database';

export async function setupTestDatabase(): Promise<Kysely<Database>> {
  const mem = newDb();

  // Create tables
  await mem.public.none(`
    CREATE TABLE battles (
      id TEXT PRIMARY KEY,
      system_id BIGINT NOT NULL,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      total_kills BIGINT NOT NULL DEFAULT 0,
      total_isk_destroyed BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  return mem.adapters.createKysely() as Kysely<Database>;
}
```

**Example - Mock Factory**:

```typescript
// test/helpers/mocks.ts
import type { Battle, Killmail } from '../../src/types';

export function createMockBattle(overrides?: Partial<Battle>): Battle {
  return {
    id: 'battle-123',
    systemId: 30000142n,
    startTime: new Date('2024-05-01T12:00:00Z'),
    endTime: new Date('2024-05-01T14:00:00Z'),
    totalKills: 10n,
    totalIskDestroyed: 1000000000n,
    ...overrides,
  };
}

export function createMockKillmail(overrides?: Partial<Killmail>): Killmail {
  return {
    killmailId: 123456n,
    systemId: 30000142n,
    occurredAt: new Date('2024-05-01T12:00:00Z'),
    victimCharacterId: 98765n,
    attackers: [],
    ...overrides,
  };
}
```

---

## Test Quality Guidelines

### 8. Writing Good Tests

**Rule**: Tests MUST be clear, maintainable, and test behavior not implementation.

**Good Test Characteristics**:

1. **Clear Test Names**: Describe what is being tested
2. **AAA Pattern**: Arrange, Act, Assert
3. **One Assertion Concept**: Test one thing per test
4. **No Logic**: Tests should be simple, no conditionals
5. **Deterministic**: Always produce same result
6. **Fast**: Complete quickly
7. **Isolated**: Independent of other tests

**Example - Good vs Bad Tests**:

```typescript
// Bad: Unclear name, multiple assertions, mixed concerns
it('test battle', async () => {
  const battle = await repo.create({ id: '1', systemId: 123n });
  expect(battle.id).toBe('1');
  const found = await repo.findById('1');
  expect(found?.id).toBe('1');
  expect(found?.systemId).toBe(123n);
});

// Good: Clear name, single responsibility, AAA pattern
describe('BattleRepository', () => {
  describe('create', () => {
    it('returns battle with generated ID when ID not provided', async () => {
      // Arrange
      const newBattle = {
        systemId: 30000142n,
        startTime: new Date(),
        endTime: new Date(),
        totalKills: 0n,
        totalIskDestroyed: 0n,
      };

      // Act
      const created = await repository.create(newBattle);

      // Assert
      expect(created.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });
  });

  describe('findById', () => {
    it('returns null when battle does not exist', async () => {
      // Arrange
      const nonExistentId = 'non-existent-id';

      // Act
      const result = await repository.findById(nonExistentId);

      // Assert
      expect(result).toBeNull();
    });
  });
});
```

---

### 9. Test Doubles (Mocks, Stubs, Spies)

**Rule**: Use appropriate test doubles for different scenarios.

**Types**:
- **Mock**: Verifies interactions (e.g., "was function called?")
- **Stub**: Provides canned responses (e.g., "return this value")
- **Spy**: Tracks calls while preserving real implementation

**Example**:

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock: Verify interactions
it('calls repository with correct parameters', async () => {
  const mockRepo = {
    create: vi.fn().mockResolvedValue({ id: '123' }),
  };

  await service.createBattle(mockRepo, data);

  expect(mockRepo.create).toHaveBeenCalledWith(data);
  expect(mockRepo.create).toHaveBeenCalledTimes(1);
});

// Stub: Provide canned response
it('handles repository error gracefully', async () => {
  const stubRepo = {
    create: vi.fn().mockRejectedValue(new Error('Database error')),
  };

  await expect(service.createBattle(stubRepo, data)).rejects.toThrow('Database error');
});

// Spy: Track calls on real object
it('logs battle creation', async () => {
  const loggerSpy = vi.spyOn(logger, 'info');

  await service.createBattle(realRepo, data);

  expect(loggerSpy).toHaveBeenCalledWith('Battle created', expect.any(Object));
});
```

---

## CI/CD Integration

### 10. Automated Test Execution

**Rule**: Tests MUST run automatically in CI/CD pipeline.

**GitHub Actions Workflow**:

```yaml
# .github/workflows/test.yml
name: Tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run unit tests
        run: pnpm run test:unit --coverage

      - name: Check coverage threshold
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "❌ Coverage $COVERAGE% is below 80% threshold"
            exit 1
          fi
          echo "✅ Coverage $COVERAGE% meets threshold"

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: pnpm/action-setup@v2

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run integration tests
        run: pnpm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: pnpm/action-setup@v2

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Start services
        run: docker-compose -f docker-compose.test.yml up -d

      - name: Wait for services
        run: ./scripts/wait-for-services.sh

      - name: Run E2E tests
        run: pnpm run test:e2e

      - name: Stop services
        if: always()
        run: docker-compose -f docker-compose.test.yml down
```

---

## Summary: The Golden Rules

1. **80% Coverage Minimum** - Lines, functions, statements (75% branches)
2. **Test Behavior, Not Implementation** - Tests should verify outcomes
3. **Fast Unit Tests** - Keep under 100ms per test
4. **Isolated Tests** - No dependencies between tests
5. **Clear Test Names** - Describe what is being tested
6. **AAA Pattern** - Arrange, Act, Assert structure
7. **Use Test Helpers** - Reuse setup code with helpers and fixtures
8. **Contract Tests** - Validate API contracts and event schemas
9. **Integration Tests** - Verify component interactions
10. **E2E Tests** - Test complete user workflows

---

## How Claude Should Use This Skill

When I (Claude) am:

- **Writing code**: Consider testability, write tests alongside code
- **Creating functions**: Ensure they can be unit tested in isolation
- **Adding features**: Write unit, integration, and contract tests
- **Refactoring**: Run tests to ensure behavior unchanged
- **Reviewing code**: Check test coverage and test quality
- **Fixing bugs**: Write test that reproduces bug first (TDD)

**If coverage drops below 80%, I should ADD TESTS before merging.**

---

## References

- **Vitest Documentation** - https://vitest.dev/
- **Test-Driven Development** (Kent Beck)
- **Growing Object-Oriented Software, Guided by Tests** (Steve Freeman, Nat Pryce)
- **Working Effectively with Legacy Code** (Michael Feathers)
- **xUnit Test Patterns** (Gerard Meszaros)
