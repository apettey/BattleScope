# Claude Skill: Service Contracts and Contract Testing

**Purpose**: Ensure all inter-service communication uses well-defined, tested contracts to prevent integration failures and maintain API compatibility.

---

## Core Principle

**Services MUST communicate via explicit contracts that are defined, versioned, and tested.**

**Rationale**:
- Prevents breaking changes from propagating silently
- Enables independent service evolution
- Catches integration issues before production
- Provides documentation for service interfaces
- Enables contract-driven development

---

## Communication Contract Types

### 1. HTTP/REST API Contracts

**Contract Format**: OpenAPI Specification (OAS) 3.x

**Location**: `{service}/contracts/openapi.yaml`

**Example**:
```yaml
# backend/clusterer/contracts/openapi.yaml
openapi: 3.0.0
info:
  title: Clusterer Service API
  version: 1.0.0
  description: Battle clustering and management API

servers:
  - url: http://clusterer-service:3000
    description: Internal K8s service

paths:
  /api/battles:
    get:
      summary: List battles
      operationId: listBattles
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
            maximum: 100
        - name: systemId
          in: query
          schema:
            type: string
            format: int64
      responses:
        '200':
          description: List of battles
          content:
            application/json:
              schema:
                type: object
                required:
                  - battles
                  - total
                properties:
                  battles:
                    type: array
                    items:
                      $ref: '#/components/schemas/Battle'
                  total:
                    type: integer

  /api/battles/{battleId}:
    get:
      summary: Get battle by ID
      operationId: getBattle
      parameters:
        - name: battleId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Battle details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Battle'
        '404':
          description: Battle not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

components:
  schemas:
    Battle:
      type: object
      required:
        - id
        - systemId
        - startTime
        - endTime
        - totalKills
        - totalIskDestroyed
      properties:
        id:
          type: string
          format: uuid
          example: "550e8400-e29b-41d4-a716-446655440000"
        systemId:
          type: string
          format: int64
          example: "30000142"
        systemName:
          type: string
          example: "Jita"
        startTime:
          type: string
          format: date-time
          example: "2024-05-01T12:00:00Z"
        endTime:
          type: string
          format: date-time
          example: "2024-05-01T14:30:00Z"
        totalKills:
          type: string
          format: int64
          example: "42"
        totalIskDestroyed:
          type: string
          format: int64
          example: "1500000000"

    Error:
      type: object
      required:
        - error
        - message
      properties:
        error:
          type: string
          example: "NOT_FOUND"
        message:
          type: string
          example: "Battle with ID '123' not found"
```

---

### 2. Kafka Event Contracts

**Contract Format**: JSON Schema or AsyncAPI Specification

**Location**: `{service}/contracts/events/{event-name}.schema.json`

**Example - JSON Schema**:
```json
// backend/clusterer/contracts/events/battle.created.schema.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://battlescope.dev/schemas/events/battle.created.v1.json",
  "title": "Battle Created Event",
  "description": "Published when a new battle is created by the clustering algorithm",
  "type": "object",
  "required": [
    "eventId",
    "eventType",
    "eventVersion",
    "timestamp",
    "data"
  ],
  "properties": {
    "eventId": {
      "type": "string",
      "format": "uuid",
      "description": "Unique event identifier"
    },
    "eventType": {
      "type": "string",
      "const": "battle.created",
      "description": "Event type identifier"
    },
    "eventVersion": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$",
      "example": "1.0.0",
      "description": "Semantic version of event schema"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "When the event was published"
    },
    "data": {
      "type": "object",
      "required": [
        "battleId",
        "systemId",
        "startTime",
        "endTime",
        "totalKills",
        "totalIskDestroyed"
      ],
      "properties": {
        "battleId": {
          "type": "string",
          "format": "uuid"
        },
        "systemId": {
          "type": "string",
          "format": "int64"
        },
        "systemName": {
          "type": "string"
        },
        "startTime": {
          "type": "string",
          "format": "date-time"
        },
        "endTime": {
          "type": "string",
          "format": "date-time"
        },
        "totalKills": {
          "type": "string",
          "format": "int64",
          "description": "BigInt serialized as string"
        },
        "totalIskDestroyed": {
          "type": "string",
          "format": "int64",
          "description": "BigInt serialized as string"
        },
        "participants": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["characterId", "side"],
            "properties": {
              "characterId": {
                "type": "string",
                "format": "int64"
              },
              "characterName": {
                "type": "string"
              },
              "side": {
                "type": "integer",
                "enum": [1, 2],
                "description": "1 = Side A, 2 = Side B"
              },
              "kills": {
                "type": "string",
                "format": "int64"
              },
              "losses": {
                "type": "string",
                "format": "int64"
              }
            }
          }
        }
      }
    }
  }
}
```

**Example - AsyncAPI (Alternative)**:
```yaml
# backend/clusterer/contracts/asyncapi.yaml
asyncapi: 2.6.0
info:
  title: Clusterer Service Events
  version: 1.0.0
  description: Kafka events published by the Clusterer Service

servers:
  production:
    url: kafka-broker.battlescope.svc.cluster.local:9092
    protocol: kafka
    description: Production Kafka cluster

channels:
  battle.created:
    description: Published when a new battle is created
    publish:
      operationId: publishBattleCreated
      message:
        $ref: '#/components/messages/BattleCreated'

  battle.updated:
    description: Published when a battle is updated (retroactive attribution)
    publish:
      operationId: publishBattleUpdated
      message:
        $ref: '#/components/messages/BattleUpdated'

components:
  messages:
    BattleCreated:
      name: BattleCreated
      title: Battle Created Event
      contentType: application/json
      payload:
        $ref: '#/components/schemas/BattleCreatedPayload'

    BattleUpdated:
      name: BattleUpdated
      title: Battle Updated Event
      contentType: application/json
      payload:
        $ref: '#/components/schemas/BattleUpdatedPayload'

  schemas:
    BattleCreatedPayload:
      type: object
      required:
        - eventId
        - eventType
        - eventVersion
        - timestamp
        - data
      properties:
        eventId:
          type: string
          format: uuid
        eventType:
          type: string
          const: battle.created
        eventVersion:
          type: string
          pattern: '^[0-9]+\.[0-9]+\.[0-9]+$'
        timestamp:
          type: string
          format: date-time
        data:
          $ref: '#/components/schemas/BattleData'
```

---

## BattleScope Service Contract Map

### Clusterer Service

**Owns Domain**: Battle

**HTTP API Contract**: `backend/clusterer/contracts/openapi.yaml`

**Endpoints**:
```yaml
/api/battles:
  - GET (list battles)
  - POST (create battle manually - admin only)
/api/battles/{battleId}:
  - GET (get battle details)
  - PATCH (update battle - internal only)
/api/battles/statistics/alliance/{allianceId}:
  - GET (alliance battle statistics)
```

**Kafka Events Published**:
```
backend/clusterer/contracts/events/
├── battle.created.schema.json
├── battle.updated.schema.json
└── battle.closed.schema.json
```

**Kafka Events Consumed**:
```
backend/enrichment/contracts/events/
└── killmail.enriched.schema.json (consumed from Enrichment Service)
```

---

### Enrichment Service

**Owns Domain**: Killmail Enrichment

**HTTP API Contract**: `backend/enrichment/contracts/openapi.yaml`

**Endpoints**:
```yaml
/api/killmails/enriched/{killmailId}:
  - GET (get enriched killmail)
/api/killmails/enriched:
  - POST (manually trigger enrichment - admin only)
/api/esi/cache/stats:
  - GET (ESI cache statistics)
```

**Kafka Events Published**:
```
backend/enrichment/contracts/events/
└── killmail.enriched.schema.json
```

**Kafka Events Consumed**:
```
backend/ingest/contracts/events/
└── killmail.ingested.schema.json (consumed from Ingest Service)
```

---

### Ingest Service

**Owns Domain**: Killmail Ingestion

**HTTP API Contract**: `backend/ingest/contracts/openapi.yaml`

**Endpoints**:
```yaml
/api/ingestion/health:
  - GET (health check and ingestion stats)
/api/ingestion/stats:
  - GET (ingestion statistics)
```

**Kafka Events Published**:
```
backend/ingest/contracts/events/
└── killmail.ingested.schema.json
```

**Kafka Events Consumed**: None (polls zKillboard RedisQ)

---

### Search Service

**Owns Domain**: Search

**HTTP API Contract**: `backend/search/contracts/openapi.yaml`

**Endpoints**:
```yaml
/api/search/battles:
  - GET (search battles by filters)
  - POST (advanced search with query DSL)
/api/search/killmails:
  - GET (search killmails)
```

**Kafka Events Published**: None

**Kafka Events Consumed**:
```
backend/clusterer/contracts/events/
├── battle.created.schema.json
└── battle.updated.schema.json

backend/enrichment/contracts/events/
└── killmail.enriched.schema.json
```

---

## Contract Testing Strategies

### 1. Provider Contract Testing (HTTP APIs)

**Tool**: Pact, Prism, or OpenAPI validators

**Pattern**: Service validates its implementation matches its OpenAPI spec

**Example - Using Prism**:
```typescript
// backend/clusterer/test/contract/openapi.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';
import { startMockServer } from '@stoplight/prism-cli';
import fs from 'fs/promises';
import yaml from 'yaml';

describe('Clusterer Service - OpenAPI Contract Validation', () => {
  let prismServer: any;
  let realService: any;

  beforeAll(async () => {
    // Load OpenAPI spec
    const spec = await fs.readFile('./contracts/openapi.yaml', 'utf-8');
    const openApiDoc = yaml.parse(spec);

    // Start Prism mock server to validate requests/responses
    prismServer = await startMockServer({
      document: openApiDoc,
      port: 4010,
      validateRequest: true,
      validateResponse: true,
    });

    // Start real service
    realService = await startClustererService({ port: 3000 });
  });

  afterAll(async () => {
    await prismServer.close();
    await realService.close();
  });

  it('GET /api/battles should match OpenAPI response schema', async () => {
    const response = await axios.get('http://localhost:3000/api/battles', {
      params: { limit: 10 },
    });

    // Validate against OpenAPI schema
    const validator = await import('openapi-response-validator');
    const validator = new validator.OpenAPIResponseValidator({
      responses: openApiDoc.paths['/api/battles'].get.responses,
    });

    const validationResult = validator.validateResponse(200, response.data);
    expect(validationResult).toBeUndefined(); // No validation errors
  });

  it('GET /api/battles/{battleId} should return 404 for non-existent battle', async () => {
    try {
      await axios.get('http://localhost:3000/api/battles/non-existent-id');
      expect.fail('Should have thrown 404');
    } catch (error: any) {
      expect(error.response.status).toBe(404);
      expect(error.response.data).toMatchObject({
        error: expect.any(String),
        message: expect.any(String),
      });
    }
  });

  it('GET /api/battles with invalid query params should return 400', async () => {
    try {
      await axios.get('http://localhost:3000/api/battles', {
        params: { limit: 1000 }, // Exceeds maximum
      });
      expect.fail('Should have thrown 400');
    } catch (error: any) {
      expect(error.response.status).toBe(400);
    }
  });
});
```

---

### 2. Consumer Contract Testing (HTTP APIs)

**Tool**: Pact

**Pattern**: Consumer defines expectations, provider validates it can meet them

**Example - Consumer Test (Frontend)**:
```typescript
// frontend/test/contract/clusterer-api.pact.test.ts
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { ClustererApiClient } from '../../src/api/clusterer';

const { like, iso8601DateTime, uuid } = MatchersV3;

describe('Frontend → Clusterer Service Contract', () => {
  const provider = new PactV3({
    consumer: 'BattleScopeFrontend',
    provider: 'ClustererService',
    dir: './pacts',
  });

  it('should get battle list', async () => {
    await provider
      .given('battles exist in the system')
      .uponReceiving('a request for battle list')
      .withRequest({
        method: 'GET',
        path: '/api/battles',
        query: { limit: '10' },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          battles: like([
            {
              id: uuid('550e8400-e29b-41d4-a716-446655440000'),
              systemId: like('30000142'),
              systemName: like('Jita'),
              startTime: iso8601DateTime('2024-05-01T12:00:00Z'),
              endTime: iso8601DateTime('2024-05-01T14:30:00Z'),
              totalKills: like('42'),
              totalIskDestroyed: like('1500000000'),
            },
          ]),
          total: like(100),
        },
      })
      .executeTest(async (mockServer) => {
        const client = new ClustererApiClient(mockServer.url);
        const result = await client.getBattles({ limit: 10 });

        expect(result.battles).toHaveLength(1);
        expect(result.battles[0].systemName).toBe('Jita');
      });
  });

  it('should get battle by ID', async () => {
    const battleId = '550e8400-e29b-41d4-a716-446655440000';

    await provider
      .given(`battle with ID ${battleId} exists`)
      .uponReceiving('a request for battle details')
      .withRequest({
        method: 'GET',
        path: `/api/battles/${battleId}`,
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          id: uuid(battleId),
          systemId: like('30000142'),
          systemName: like('Jita'),
          startTime: iso8601DateTime('2024-05-01T12:00:00Z'),
          endTime: iso8601DateTime('2024-05-01T14:30:00Z'),
          totalKills: like('42'),
          totalIskDestroyed: like('1500000000'),
        },
      })
      .executeTest(async (mockServer) => {
        const client = new ClustererApiClient(mockServer.url);
        const battle = await client.getBattle(battleId);

        expect(battle.id).toBe(battleId);
        expect(battle.systemName).toBe('Jita');
      });
  });
});
```

**Example - Provider Verification Test (Backend)**:
```typescript
// backend/clusterer/test/contract/pact-verification.test.ts
import { Verifier } from '@pact-foundation/pact';
import { startClustererService } from '../../src/index';

describe('Clusterer Service - Pact Verification', () => {
  let service: any;

  beforeAll(async () => {
    service = await startClustererService({ port: 3000 });
  });

  afterAll(async () => {
    await service.close();
  });

  it('should validate provider against consumer contracts', async () => {
    const verifier = new Verifier({
      providerBaseUrl: 'http://localhost:3000',
      provider: 'ClustererService',

      // Option 1: Local pact files
      pactUrls: ['./pacts/BattleScopeFrontend-ClustererService.json'],

      // Option 2: Pact Broker (production)
      // pactBrokerUrl: 'https://pact-broker.battlescope.dev',
      // pactBrokerToken: process.env.PACT_BROKER_TOKEN,
      // consumerVersionSelectors: [
      //   { tag: 'main', latest: true },
      //   { tag: 'production', latest: true },
      // ],

      // Provider states (test data setup)
      stateHandlers: {
        'battles exist in the system': async () => {
          // Setup: Insert test battles into database
          await setupTestBattles();
        },
        'battle with ID 550e8400-e29b-41d4-a716-446655440000 exists': async () => {
          await setupSpecificBattle('550e8400-e29b-41d4-a716-446655440000');
        },
      },

      // Cleanup after each interaction
      afterEach: async () => {
        await cleanupTestData();
      },
    });

    await verifier.verifyProvider();
  });
});
```

---

### 3. Event Contract Testing (Kafka)

**Tool**: JSON Schema validators, custom event contract testing

**Pattern**: Producer validates published events, consumer validates consumed events

**Example - Producer Test**:
```typescript
// backend/clusterer/test/contract/events/battle.created.test.ts
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs/promises';
import { BattleEventPublisher } from '../../../src/events/publisher';

describe('Battle Created Event Contract - Producer', () => {
  let ajv: Ajv;
  let schema: any;

  beforeAll(async () => {
    // Load JSON Schema
    const schemaJson = await fs.readFile(
      './contracts/events/battle.created.schema.json',
      'utf-8',
    );
    schema = JSON.parse(schemaJson);

    ajv = new Ajv({ strict: true, allErrors: true });
    addFormats(ajv);
  });

  it('should publish battle.created event matching contract', async () => {
    const publisher = new BattleEventPublisher();

    // Create a battle
    const battle = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      systemId: 30000142n,
      systemName: 'Jita',
      startTime: new Date('2024-05-01T12:00:00Z'),
      endTime: new Date('2024-05-01T14:30:00Z'),
      totalKills: 42n,
      totalIskDestroyed: 1500000000n,
    };

    // Publish event
    const event = await publisher.publishBattleCreated(battle);

    // Validate against JSON Schema
    const validate = ajv.compile(schema);
    const valid = validate(event);

    if (!valid) {
      console.error('Validation errors:', validate.errors);
    }

    expect(valid).toBe(true);
    expect(event.eventType).toBe('battle.created');
    expect(event.eventVersion).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
    expect(event.data.battleId).toBe(battle.id);
  });

  it('should reject invalid battle.created event', async () => {
    const invalidEvent = {
      eventId: '123', // Valid UUID
      eventType: 'battle.created',
      eventVersion: '1.0.0',
      timestamp: new Date().toISOString(),
      data: {
        // Missing required fields
        battleId: '550e8400-e29b-41d4-a716-446655440000',
      },
    };

    const validate = ajv.compile(schema);
    const valid = validate(invalidEvent);

    expect(valid).toBe(false);
    expect(validate.errors).toBeDefined();
  });
});
```

**Example - Consumer Test**:
```typescript
// backend/search/test/contract/events/battle.created.consumer.test.ts
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs/promises';
import { BattleCreatedConsumer } from '../../../src/consumers/battle-created';

describe('Battle Created Event Contract - Consumer', () => {
  let ajv: Ajv;
  let schema: any;

  beforeAll(async () => {
    // Load contract from Clusterer Service
    const schemaJson = await fs.readFile(
      '../../../backend/clusterer/contracts/events/battle.created.schema.json',
      'utf-8',
    );
    schema = JSON.parse(schemaJson);

    ajv = new Ajv({ strict: true });
    addFormats(ajv);
  });

  it('should consume valid battle.created event', async () => {
    const consumer = new BattleCreatedConsumer();

    const event = {
      eventId: '123e4567-e89b-12d3-a456-426614174000',
      eventType: 'battle.created',
      eventVersion: '1.0.0',
      timestamp: '2024-05-01T12:00:00Z',
      data: {
        battleId: '550e8400-e29b-41d4-a716-446655440000',
        systemId: '30000142',
        systemName: 'Jita',
        startTime: '2024-05-01T12:00:00Z',
        endTime: '2024-05-01T14:30:00Z',
        totalKills: '42',
        totalIskDestroyed: '1500000000',
        participants: [],
      },
    };

    // Validate event matches contract
    const validate = ajv.compile(schema);
    expect(validate(event)).toBe(true);

    // Process event
    await expect(consumer.handle(event)).resolves.not.toThrow();
  });

  it('should reject malformed battle.created event', async () => {
    const consumer = new BattleCreatedConsumer();

    const malformedEvent = {
      eventId: '123e4567-e89b-12d3-a456-426614174000',
      eventType: 'battle.created',
      eventVersion: '1.0.0',
      timestamp: '2024-05-01T12:00:00Z',
      data: {
        // Missing required fields
        battleId: '550e8400-e29b-41d4-a716-446655440000',
      },
    };

    const validate = ajv.compile(schema);
    expect(validate(malformedEvent)).toBe(false);

    // Consumer should reject invalid events
    await expect(consumer.handle(malformedEvent)).rejects.toThrow('Invalid event schema');
  });
});
```

---

### 4. Integration Contract Testing

**Tool**: Testcontainers + real Kafka instance

**Pattern**: End-to-end contract validation with real message bus

**Example**:
```typescript
// backend/test/integration/kafka-contracts.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { Kafka, Producer, Consumer } from 'kafkajs';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import fs from 'fs/promises';

describe('Kafka Event Contracts - Integration', () => {
  let kafkaContainer: StartedTestContainer;
  let producer: Producer;
  let consumer: Consumer;
  let ajv: Ajv;

  beforeAll(async () => {
    // Start Kafka container
    kafkaContainer = await new GenericContainer('confluentinc/cp-kafka:7.5.0')
      .withExposedPorts(9093)
      .withEnvironment({
        KAFKA_BROKER_ID: '1',
        KAFKA_ZOOKEEPER_CONNECT: 'zookeeper:2181',
        KAFKA_ADVERTISED_LISTENERS: 'PLAINTEXT://localhost:9093',
        KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: '1',
      })
      .start();

    const kafka = new Kafka({
      clientId: 'contract-test',
      brokers: [`localhost:${kafkaContainer.getMappedPort(9093)}`],
    });

    producer = kafka.producer();
    consumer = kafka.consumer({ groupId: 'contract-test-group' });

    await producer.connect();
    await consumer.connect();

    ajv = new Ajv({ strict: true });
    addFormats(ajv);
  }, 60000);

  afterAll(async () => {
    await producer.disconnect();
    await consumer.disconnect();
    await kafkaContainer.stop();
  });

  it('should publish and consume battle.created event matching contract', async () => {
    const topic = 'battle.created';

    // Load contract
    const schemaJson = await fs.readFile(
      './backend/clusterer/contracts/events/battle.created.schema.json',
      'utf-8',
    );
    const schema = JSON.parse(schemaJson);
    const validate = ajv.compile(schema);

    // Subscribe consumer
    await consumer.subscribe({ topic, fromBeginning: true });

    const receivedEvents: any[] = [];
    consumer.run({
      eachMessage: async ({ message }) => {
        const event = JSON.parse(message.value!.toString());
        receivedEvents.push(event);
      },
    });

    // Publish event
    const event = {
      eventId: '123e4567-e89b-12d3-a456-426614174000',
      eventType: 'battle.created',
      eventVersion: '1.0.0',
      timestamp: new Date().toISOString(),
      data: {
        battleId: '550e8400-e29b-41d4-a716-446655440000',
        systemId: '30000142',
        systemName: 'Jita',
        startTime: '2024-05-01T12:00:00Z',
        endTime: '2024-05-01T14:30:00Z',
        totalKills: '42',
        totalIskDestroyed: '1500000000',
        participants: [],
      },
    };

    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(event) }],
    });

    // Wait for message
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(receivedEvents).toHaveLength(1);
    expect(validate(receivedEvents[0])).toBe(true);
  });
});
```

---

## Contract Versioning

### Semantic Versioning for Contracts

**Rule**: All contracts MUST use semantic versioning (MAJOR.MINOR.PATCH)

**Version Changes**:
- **MAJOR**: Breaking changes (field removed, type changed, required field added)
- **MINOR**: Backward-compatible additions (new optional field, new endpoint)
- **PATCH**: Documentation updates, clarifications

**Example**:
```json
{
  "eventVersion": "2.1.0",
  "description": "Version 2.1.0 - Added optional 'allianceIds' field (MINOR)"
}
```

### Handling Breaking Changes

**Strategy**: Dual-write during transition period

**Example - Event Version Migration**:
```typescript
// Publish both v1 and v2 events during migration
async publishBattleCreated(battle: Battle): Promise<void> {
  const v1Event = this.createV1Event(battle); // Old format
  const v2Event = this.createV2Event(battle); // New format

  await Promise.all([
    this.producer.send({ topic: 'battle.created.v1', messages: [v1Event] }),
    this.producer.send({ topic: 'battle.created.v2', messages: [v2Event] }),
  ]);
}

// Consumers migrate at their own pace
// Once all consumers on v2, deprecate v1 topic
```

---

## CI/CD Contract Testing Pipeline

### GitHub Actions Example

```yaml
# .github/workflows/contract-tests.yml
name: Contract Tests

on:
  pull_request:
    paths:
      - 'backend/*/contracts/**'
      - 'backend/*/src/**'
      - 'backend/*/test/contract/**'

jobs:
  validate-contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install

      - name: Validate OpenAPI specs
        run: |
          npx @redocly/cli lint backend/*/contracts/openapi.yaml

      - name: Validate JSON schemas
        run: |
          npx ajv validate -s backend/*/contracts/events/*.schema.json \
            --spec=draft7 --strict=true

      - name: Run contract tests
        run: pnpm run test:contract

      - name: Publish pact files
        if: github.ref == 'refs/heads/main'
        run: |
          npx pact-broker publish ./pacts \
            --consumer-app-version=${{ github.sha }} \
            --broker-base-url=${{ secrets.PACT_BROKER_URL }} \
            --broker-token=${{ secrets.PACT_BROKER_TOKEN }}

  verify-provider-contracts:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [clusterer, enrichment, ingest, search]
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install

      - name: Start service
        run: |
          cd backend/${{ matrix.service }}
          pnpm run start:test &
          sleep 5

      - name: Run provider verification
        run: |
          cd backend/${{ matrix.service }}
          pnpm run test:contract:provider
```

---

## Contract Breaking Change Detection

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Checking for contract breaking changes..."

# Get changed contract files
CHANGED_CONTRACTS=$(git diff --cached --name-only | grep -E 'contracts/(openapi\.yaml|events/.*\.schema\.json)')

if [ -z "$CHANGED_CONTRACTS" ]; then
  echo "No contract changes detected."
  exit 0
fi

# Check for breaking changes using openapi-diff
for contract in $CHANGED_CONTRACTS; do
  if [[ $contract == *"openapi.yaml" ]]; then
    echo "Checking OpenAPI contract: $contract"

    # Compare with main branch
    git show main:$contract > /tmp/old-contract.yaml

    npx openapi-diff /tmp/old-contract.yaml $contract --format markdown

    if [ $? -ne 0 ]; then
      echo "❌ Breaking changes detected in $contract"
      echo "Please bump MAJOR version or revert breaking changes."
      exit 1
    fi
  fi

  if [[ $contract == *".schema.json" ]]; then
    echo "Checking JSON Schema: $contract"

    # TODO: Implement JSON schema breaking change detection
    # For now, require manual version bump
  fi
done

echo "✅ No breaking changes detected."
exit 0
```

---

## Anti-Patterns to Avoid

### ❌ No Contract Definition

**Bad**:
```typescript
// Service publishes events without schema
await kafka.send({
  topic: 'some-event',
  messages: [{ value: JSON.stringify({ foo: 'bar' }) }],
});

// Consumer doesn't validate
consumer.on('message', (msg) => {
  const data = JSON.parse(msg.value); // Assumes structure, no validation
  doSomething(data.foo); // Runtime error if structure changes
});
```

**Good**:
```typescript
// Service publishes with validated schema
const event = createBattleCreatedEvent(battle);
const validate = ajv.compile(battleCreatedSchema);
if (!validate(event)) {
  throw new Error('Event validation failed');
}
await kafka.send({ topic: 'battle.created', messages: [event] });

// Consumer validates on receipt
consumer.on('message', (msg) => {
  const event = JSON.parse(msg.value);
  if (!validate(event)) {
    logger.error('Invalid event schema', validate.errors);
    return; // Skip invalid events
  }
  await handleBattleCreated(event);
});
```

---

### ❌ Implicit Contracts

**Bad**:
```typescript
// HTTP API without OpenAPI spec
app.get('/api/battles', (req, res) => {
  // No documented contract
  res.json({ battles: [...] });
});
```

**Good**:
```typescript
// HTTP API with OpenAPI spec
/**
 * @openapi
 * /api/battles:
 *   get:
 *     summary: List battles
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Battle list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BattleList'
 */
app.get('/api/battles', validateRequest, async (req, res) => {
  const battles = await battleService.list(req.query);
  res.json(battles);
});
```

---

### ❌ No Contract Versioning

**Bad**:
```json
{
  "eventType": "battle.created",
  "data": { ... }
}
```

**Good**:
```json
{
  "eventType": "battle.created",
  "eventVersion": "1.2.0",
  "data": { ... }
}
```

---

### ❌ No Contract Testing

**Bad**:
```typescript
// No tests validating contract adherence
describe('Battle API', () => {
  it('should return battles', async () => {
    const response = await request(app).get('/api/battles');
    expect(response.status).toBe(200);
    // Doesn't validate response schema
  });
});
```

**Good**:
```typescript
describe('Battle API - Contract Validation', () => {
  it('should return battles matching OpenAPI schema', async () => {
    const response = await request(app).get('/api/battles');
    expect(response.status).toBe(200);

    // Validate against OpenAPI schema
    const validator = createResponseValidator(openApiSpec);
    const errors = validator.validate(response.body);
    expect(errors).toBeUndefined();
  });
});
```

---

## Validation Checklist

Before implementing any inter-service communication, verify:

### HTTP API Contracts
- [ ] OpenAPI spec exists in `{service}/contracts/openapi.yaml`
- [ ] All endpoints documented with request/response schemas
- [ ] Error responses documented (400, 404, 500, etc.)
- [ ] Contract version specified
- [ ] Provider contract tests exist
- [ ] Consumer contract tests exist (if applicable)
- [ ] Breaking change detection enabled in CI/CD

### Kafka Event Contracts
- [ ] JSON Schema exists for each event type
- [ ] Event versioning field included (`eventVersion`)
- [ ] Required fields clearly specified
- [ ] BigInt fields use string serialization
- [ ] Producer validates events before publishing
- [ ] Consumer validates events on receipt
- [ ] Integration tests with real Kafka instance
- [ ] Dual-write strategy planned for breaking changes

### General
- [ ] Contracts stored in version control
- [ ] CI/CD pipeline runs contract tests
- [ ] Contract changes trigger dependent service verification
- [ ] Documentation links to contract files

---

## Summary: The Golden Rules

1. **Define Explicit Contracts** - Use OpenAPI for HTTP, JSON Schema for events
2. **Version All Contracts** - Semantic versioning (MAJOR.MINOR.PATCH)
3. **Test Contracts** - Provider and consumer tests for all communication
4. **Validate at Runtime** - Reject malformed messages immediately
5. **Detect Breaking Changes** - Automated checks in CI/CD
6. **Document Changes** - Changelog for contract updates
7. **Dual-Write for Migrations** - Support old and new contracts during transitions
8. **Centralize Contracts** - Single source of truth per service

---

## How Claude Should Use This Skill

When I (Claude) am:

- **Adding inter-service communication**: Verify contract exists and is tested
- **Creating a new service**: Create OpenAPI spec and event schemas
- **Modifying API responses**: Check for breaking changes, bump version
- **Publishing Kafka events**: Validate against JSON Schema before sending
- **Consuming events**: Validate on receipt, handle schema mismatches gracefully
- **Reviewing code**: Flag missing contracts or contract tests
- **Designing APIs**: Use OpenAPI spec as source of truth

**If a contract doesn't exist or isn't tested, I should STOP and create it first.**

---

## References

- OpenAPI Specification: https://spec.openapis.org/oas/v3.0.0
- AsyncAPI Specification: https://www.asyncapi.com/docs/reference/specification/v2.6.0
- JSON Schema: https://json-schema.org/draft-07/schema
- Pact Contract Testing: https://docs.pact.io/
- Consumer-Driven Contracts: https://martinfowler.com/articles/consumerDrivenContracts.html
