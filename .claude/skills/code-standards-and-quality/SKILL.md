# Claude Skill: Code Standards and Quality

**Purpose**: Ensure all code is maintainable, testable, and adheres to consistent quality standards across the BattleScope codebase.

---

## Core Principle

**All code MUST be written in TypeScript with strict type safety, follow consistent conventions, maintain low complexity, and be easily understandable by any developer.**

**Rationale**:
- TypeScript is chosen for developer accessibility, not performance
- Type safety prevents runtime errors and improves refactoring confidence
- Consistent code standards reduce cognitive load
- Low complexity makes code maintainable and testable
- Clear code is more valuable than clever code

---

## Language and Technology Standards

### 1. TypeScript Everywhere

**Rule**: All application code MUST be written in TypeScript with `strict` mode enabled.

**Why TypeScript**:
- **Not** for performance (it's not faster than other languages)
- **Not** because it's the best tool (debatable)
- **Because** it's easier for most developers to understand and work with
- Large ecosystem, excellent tooling, familiar syntax

**TypeScript Configuration**:

```json
// tsconfig.json (base configuration)
{
  "compilerOptions": {
    // Strict Type Checking
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,

    // Additional Checks
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,

    // Module Resolution
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ES2022",
    "lib": ["ES2022"],
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,

    // Output
    "outDir": "./dist",
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,

    // Best Practices
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

---

### 2. Build Tools and Package Management

**Rule**: Use modern, standard build tools with reproducible builds.

**Package Manager**: `pnpm` (required)
- Faster than npm/yarn
- Strict dependency resolution
- Workspace support for monorepo

**Build Tool**: `tsup` or `tsc` depending on use case
- `tsup` for services (fast, includes bundling)
- `tsc` for libraries (preserves structure, better for consumers)

**Example `package.json`**:

```json
{
  "name": "@battlescope/clusterer",
  "version": "1.0.0",
  "type": "module",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=8.0.0"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    // Runtime dependencies only
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "eslint": "^8.55.0",
    "prettier": "^3.1.0"
  }
}
```

**Example `tsup.config.ts`**:

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  dts: true,
  splitting: false,
  treeshake: true,
  minify: false, // Keep readable in production for debugging
});
```

---

## Code Quality Standards

### 3. Complexity Limits

**Rule**: Code MUST maintain low complexity to remain maintainable.

**Cyclomatic Complexity**: Maximum 10 per function
**Cognitive Complexity**: Maximum 15 per function
**Function Length**: Maximum 50 lines (guideline, not hard rule)
**File Length**: Maximum 300 lines (guideline, not hard rule)

**ESLint Configuration**:

```javascript
// .eslintrc.cjs
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier', // Must be last
  ],
  rules: {
    // Complexity Rules
    'complexity': ['error', 10],
    'max-depth': ['error', 4],
    'max-lines': ['warn', 300],
    'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true, skipComments: true }],
    'max-params': ['error', 4],

    // TypeScript Specific
    '@typescript-eslint/explicit-function-return-type': ['error', {
      allowExpressions: true,
      allowTypedFunctionExpressions: true,
    }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': 'error',

    // Import Rules
    'import/order': ['error', {
      'groups': [
        'builtin',
        'external',
        'internal',
        'parent',
        'sibling',
        'index',
      ],
      'newlines-between': 'always',
      'alphabetize': { order: 'asc', caseInsensitive: true },
    }],
    'import/no-duplicates': 'error',

    // Best Practices
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'error',
    'no-var': 'error',
    'eqeqeq': ['error', 'always'],
  },
};
```

**Example - Refactoring High Complexity**:

```typescript
// Bad: High complexity (cyclomatic complexity = 12)
function processBattleData(battle: Battle, options: ProcessOptions): ProcessedBattle {
  if (!battle) {
    throw new Error('Battle is required');
  }

  if (options.includeParticipants) {
    if (battle.participants.length > 0) {
      if (options.filterBySide) {
        battle.participants = battle.participants.filter(p => p.side === options.side);
      }
      if (options.sortByKills) {
        battle.participants.sort((a, b) => Number(b.kills - a.kills));
      }
    }
  }

  if (options.calculateStatistics) {
    if (battle.totalKills > 0) {
      battle.statistics = {
        avgIskPerKill: Number(battle.totalIskDestroyed / battle.totalKills),
      };
    }
  }

  return battle;
}

// Good: Low complexity (cyclomatic complexity = 3)
function processBattleData(battle: Battle, options: ProcessOptions): ProcessedBattle {
  validateBattle(battle);

  const processedBattle = { ...battle };

  if (options.includeParticipants) {
    processedBattle.participants = processParticipants(battle.participants, options);
  }

  if (options.calculateStatistics) {
    processedBattle.statistics = calculateBattleStatistics(battle);
  }

  return processedBattle;
}

function validateBattle(battle: Battle | null): asserts battle is Battle {
  if (!battle) {
    throw new Error('Battle is required');
  }
}

function processParticipants(
  participants: Participant[],
  options: ProcessOptions,
): Participant[] {
  let processed = participants;

  if (options.filterBySide) {
    processed = processed.filter(p => p.side === options.side);
  }

  if (options.sortByKills) {
    processed = [...processed].sort((a, b) => Number(b.kills - a.kills));
  }

  return processed;
}

function calculateBattleStatistics(battle: Battle): BattleStatistics {
  if (battle.totalKills === 0n) {
    return { avgIskPerKill: 0 };
  }

  return {
    avgIskPerKill: Number(battle.totalIskDestroyed / battle.totalKills),
  };
}
```

---

### 4. Code Formatting

**Rule**: All code MUST be formatted with Prettier (no exceptions).

**Why Prettier**:
- Zero configuration debates
- Automatic formatting
- Consistent style across entire codebase

**Prettier Configuration**:

```json
// .prettierrc
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

**Pre-commit Hook** (using Husky + lint-staged):

```json
// package.json
{
  "lint-staged": {
    "*.ts": [
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

```bash
# .husky/pre-commit
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

pnpm lint-staged
```

---

## Code Organization

### 5. Project Structure

**Rule**: Follow consistent directory structure across all services.

**Standard Service Structure**:

```
backend/clusterer/
├── src/
│   ├── index.ts                 # Entry point
│   ├── server.ts                # HTTP server setup
│   ├── config/
│   │   ├── index.ts             # Configuration loader
│   │   └── env.ts               # Environment validation
│   ├── routes/                  # HTTP routes (if applicable)
│   │   ├── battles.ts
│   │   └── health.ts
│   ├── services/                # Business logic
│   │   ├── clustering/
│   │   │   ├── service.ts       # Main service
│   │   │   ├── algorithm.ts     # Core algorithm
│   │   │   └── types.ts         # Service-specific types
│   │   └── events/
│   │       ├── publisher.ts
│   │       └── consumer.ts
│   ├── repositories/            # Data access layer
│   │   └── battle-repository.ts
│   ├── models/                  # Domain models
│   │   ├── battle.ts
│   │   └── participant.ts
│   ├── utils/                   # Shared utilities
│   │   ├── logger.ts
│   │   └── bigint.ts
│   └── types/                   # Shared types
│       └── index.ts
├── test/                        # Tests mirror src/ structure
│   ├── unit/
│   │   └── services/
│   │       └── clustering/
│   │           └── algorithm.test.ts
│   ├── integration/
│   │   └── clustering-flow.test.ts
│   └── contract/
│       └── openapi.test.ts
├── contracts/                   # API contracts
│   ├── openapi.yaml
│   └── events/
│       └── battle.created.schema.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── package.json
├── Dockerfile
└── README.md
```

**Standard Library Structure**:

```
packages/database/
├── src/
│   ├── index.ts                 # Public API exports
│   ├── db.ts                    # Database connection
│   ├── repositories/            # Repository implementations
│   │   ├── battle-repository.ts
│   │   └── killmail-repository.ts
│   ├── migrations/              # Database migrations
│   │   └── 001_create_battles.ts
│   ├── schemas/                 # Kysely schemas
│   │   └── battles.ts
│   └── types/                   # Exported types
│       └── index.ts
├── test/
│   └── repositories/
│       └── battle-repository.test.ts
├── tsconfig.json
└── package.json
```

---

### 6. Naming Conventions

**Rule**: Use consistent, descriptive naming throughout the codebase.

**File Names**:
- `kebab-case.ts` for all files
- `*.test.ts` for test files
- `*.types.ts` for type-only files

**Variable and Function Names**:
- `camelCase` for variables and functions
- Descriptive names, avoid abbreviations
- Boolean variables start with `is`, `has`, `should`, `can`

**Type and Interface Names**:
- `PascalCase` for types, interfaces, classes
- Suffix interfaces with what they represent: `BattleRecord`, `BattleService`, `BattleRepository`

**Constants**:
- `UPPER_SNAKE_CASE` for true constants
- `camelCase` for configuration objects

**Examples**:

```typescript
// Good naming
const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 5000;

interface BattleRecord {
  id: string;
  systemId: bigint;
  startTime: Date;
}

class BattleRepository {
  async findById(id: string): Promise<BattleRecord | null> {
    // ...
  }

  async findOverlappingBattles(
    systemId: bigint,
    startTime: Date,
    endTime: Date,
  ): Promise<BattleRecord[]> {
    // ...
  }
}

function calculateAverageIskPerKill(battle: BattleRecord): number {
  if (battle.totalKills === 0n) {
    return 0;
  }
  return Number(battle.totalIskDestroyed / battle.totalKills);
}

const isReadyToProcess = await checkDependencies();
const hasRequiredFields = validateSchema(data);
```

```typescript
// Bad naming
const MAX_R = 3; // Unclear abbreviation
const t = 5000; // Single letter variable

interface Battle { // Generic name
  id: string;
}

class BattleRepo { // Abbreviation
  async find(id: string): Promise<Battle | null> { // Ambiguous
    // ...
  }
}

function calcAvg(b: Battle): number { // Abbreviations
  // ...
}

const ready = await check(); // Unclear boolean
const data = process(); // Generic name
```

---

### 7. Type Safety Best Practices

**Rule**: Leverage TypeScript's type system for maximum safety.

**Prefer Types Over Interfaces** (for unions and utilities):

```typescript
// Good: Use type for unions and complex types
type BattleStatus = 'active' | 'closed' | 'archived';

type BattleWithParticipants = Battle & {
  participants: Participant[];
};

// Good: Use interface for object shapes
interface Battle {
  id: string;
  systemId: bigint;
  status: BattleStatus;
}
```

**Use Discriminated Unions**:

```typescript
// Good: Discriminated union for event types
type BattleEvent =
  | { type: 'created'; data: Battle }
  | { type: 'updated'; data: Partial<Battle> }
  | { type: 'deleted'; data: { id: string } };

function handleEvent(event: BattleEvent): void {
  switch (event.type) {
    case 'created':
      // TypeScript knows event.data is Battle
      console.log(`Created battle ${event.data.id}`);
      break;
    case 'updated':
      // TypeScript knows event.data is Partial<Battle>
      console.log(`Updated battle fields`);
      break;
    case 'deleted':
      // TypeScript knows event.data is { id: string }
      console.log(`Deleted battle ${event.data.id}`);
      break;
  }
}
```

**Avoid `any`, Use `unknown`**:

```typescript
// Bad
function processData(data: any): void {
  console.log(data.field); // No type safety
}

// Good
function processData(data: unknown): void {
  if (isValidData(data)) {
    console.log(data.field); // Type-safe after validation
  }
}

function isValidData(data: unknown): data is { field: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'field' in data &&
    typeof data.field === 'string'
  );
}
```

**Use Branded Types for IDs**:

```typescript
// Good: Prevent mixing different ID types
type BattleId = string & { readonly __brand: 'BattleId' };
type CharacterId = string & { readonly __brand: 'CharacterId' };

function createBattleId(id: string): BattleId {
  return id as BattleId;
}

function getBattle(battleId: BattleId): Battle {
  // Can only pass BattleId, not raw string
  // ...
}

// Compile error: can't pass CharacterId to function expecting BattleId
const characterId = createCharacterId('123');
getBattle(characterId); // Type error
```

---

### 8. Error Handling

**Rule**: Use typed errors with proper error handling patterns.

**Custom Error Classes**:

```typescript
// Good: Typed error hierarchy
export class BattleScopeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends BattleScopeError {
  constructor(resource: string, id: string) {
    super(`${resource} with ID '${id}' not found`, 'NOT_FOUND', 404, { resource, id });
  }
}

export class ValidationError extends BattleScopeError {
  constructor(message: string, errors: Record<string, string[]>) {
    super(message, 'VALIDATION_ERROR', 400, { errors });
  }
}

export class ConflictError extends BattleScopeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, context);
  }
}
```

**Error Handling Pattern**:

```typescript
// Good: Explicit error handling with types
async function getBattle(battleId: string): Promise<Battle> {
  try {
    const battle = await battleRepository.findById(battleId);

    if (!battle) {
      throw new NotFoundError('Battle', battleId);
    }

    return battle;
  } catch (error) {
    if (error instanceof BattleScopeError) {
      throw error; // Re-throw known errors
    }

    // Log unexpected errors
    logger.error('Unexpected error fetching battle', {
      battleId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw new BattleScopeError(
      'Failed to fetch battle',
      'INTERNAL_ERROR',
      500,
      { battleId },
    );
  }
}

// Express error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof BattleScopeError) {
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
      context: err.context,
    });
    return;
  }

  // Unknown error
  logger.error('Unhandled error', { error: err });
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
});
```

---

### 9. Async/Await Best Practices

**Rule**: Use async/await consistently, handle promises properly.

**Good Practices**:

```typescript
// Good: Proper error handling
async function processBattle(battleId: string): Promise<void> {
  try {
    const battle = await battleRepository.findById(battleId);
    await enrichBattle(battle);
    await publishBattleEvent(battle);
  } catch (error) {
    logger.error('Failed to process battle', { battleId, error });
    throw error;
  }
}

// Good: Parallel execution for independent operations
async function enrichBattle(battle: Battle): Promise<EnrichedBattle> {
  const [systemData, participantData, statisticsData] = await Promise.all([
    fetchSystemData(battle.systemId),
    fetchParticipantData(battle.participants),
    calculateStatistics(battle),
  ]);

  return {
    ...battle,
    system: systemData,
    participants: participantData,
    statistics: statisticsData,
  };
}

// Good: Sequential execution when order matters
async function createAndPublishBattle(data: NewBattle): Promise<Battle> {
  // Must complete in order
  const battle = await battleRepository.create(data);
  await publishEvent('battle.created', battle);
  return battle;
}

// Good: Handle Promise.allSettled for partial failures
async function notifySubscribers(battle: Battle): Promise<void> {
  const subscribers = await getSubscribers(battle.id);

  const results = await Promise.allSettled(
    subscribers.map(sub => sendNotification(sub, battle))
  );

  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    logger.warn('Some notifications failed', {
      battleId: battle.id,
      failureCount: failures.length,
    });
  }
}
```

**ESLint Rules for Promises**:

```javascript
// .eslintrc.cjs
module.exports = {
  rules: {
    '@typescript-eslint/no-floating-promises': 'error', // Must await or handle promises
    '@typescript-eslint/no-misused-promises': 'error', // No promises in conditionals
    '@typescript-eslint/await-thenable': 'error', // Only await thenables
    'no-async-promise-executor': 'error', // No async in Promise constructor
    'prefer-promise-reject-errors': 'error', // Only reject with Error objects
  },
};
```

---

### 10. Documentation Standards

**Rule**: Code MUST be self-documenting with minimal but meaningful comments.

**JSDoc for Public APIs**:

```typescript
/**
 * Finds battles that overlap with the given time range in the specified system.
 *
 * @param systemId - The EVE Online solar system ID
 * @param startTime - Start of the time range to search
 * @param endTime - End of the time range to search
 * @param lookbackMinutes - How far back to look for battles (default: 60 minutes)
 * @returns Array of overlapping battles, sorted by start time (newest first)
 *
 * @example
 * ```typescript
 * const battles = await repo.findOverlappingBattles(
 *   30000142n, // Jita system ID
 *   new Date('2024-05-01T12:00:00Z'),
 *   new Date('2024-05-01T14:00:00Z'),
 *   60
 * );
 * ```
 */
async findOverlappingBattles(
  systemId: bigint,
  startTime: Date,
  endTime: Date,
  lookbackMinutes: number = 60,
): Promise<BattleRecord[]> {
  // Implementation
}
```

**Inline Comments for Complex Logic**:

```typescript
function calculateBattleSide(
  attackers: Set<bigint>,
  victims: Set<bigint>,
): 1 | 2 | null {
  // Check if character appears in both sets (switched sides)
  const switchedSides = [...attackers].some(id => victims.has(id));
  if (switchedSides) {
    return null; // Ambiguous - can't determine side
  }

  // Assign side based on first appearance
  // Side 1: Characters who attacked first
  // Side 2: Characters who were victims first
  return attackers.size > victims.size ? 1 : 2;
}
```

**README for Each Service**:

```markdown
# Clusterer Service

## Purpose
Clusters killmails into battles based on temporal and spatial proximity.

## Architecture
- Consumes `killmail.enriched` events from Kafka
- Applies DBSCAN clustering algorithm
- Publishes `battle.created` and `battle.updated` events

## Configuration
| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | - |
| `KAFKA_BROKERS` | Comma-separated Kafka brokers | `localhost:9092` |
| `CLUSTERING_TIME_WINDOW_MS` | Max time between killmails in same battle | `1800000` (30 min) |

## Running Locally
```bash
pnpm install
pnpm run dev
```

## Testing
```bash
pnpm run test
pnpm run test:coverage
```

## API Endpoints
- `GET /api/battles` - List battles
- `GET /api/battles/:id` - Get battle details
- `GET /health/liveness` - Liveness probe
- `GET /health/readiness` - Readiness probe
```

---

## CI/CD Quality Gates

### 11. Continuous Integration Checks

**Rule**: All code MUST pass CI checks before merging.

**GitHub Actions Workflow**:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type check
        run: pnpm run typecheck

      - name: Lint
        run: pnpm run lint

      - name: Format check
        run: pnpm run format:check

      - name: Test
        run: pnpm run test:coverage

      - name: Check coverage threshold
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80% threshold"
            exit 1
          fi

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

  complexity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Check complexity
        run: npx eslint src --ext .ts --format json | npx complexity-report
```

---

## Summary: The Golden Rules

1. **TypeScript Everywhere** - Strict mode enabled, no exceptions
2. **Low Complexity** - Max cyclomatic complexity of 10 per function
3. **Consistent Formatting** - Prettier for all code, no debates
4. **Type Safety** - No `any`, prefer `unknown`, use branded types
5. **Proper Error Handling** - Custom error classes, typed errors
6. **Clear Naming** - Descriptive names, consistent conventions
7. **Self-Documenting Code** - JSDoc for public APIs, minimal inline comments
8. **80% Test Coverage** - Minimum threshold, enforced in CI
9. **Reproducible Builds** - pnpm with frozen lockfile
10. **Quality Gates** - All checks must pass before merge

---

## How Claude Should Use This Skill

When I (Claude) am:

- **Writing code**: Follow TypeScript strict mode, low complexity, clear naming
- **Reviewing code**: Check complexity, type safety, error handling, formatting
- **Creating files**: Follow standard project structure
- **Adding dependencies**: Use pnpm, check if really needed
- **Handling errors**: Use custom error classes with proper context
- **Documenting**: Add JSDoc for public APIs, meaningful inline comments
- **Testing**: Ensure 80%+ coverage (covered in separate testing skill)

**If code doesn't meet these standards, I should REFACTOR before submitting.**

---

## References

- **TypeScript Handbook** - https://www.typescriptlang.org/docs/
- **ESLint Rules** - https://eslint.org/docs/rules/
- **Prettier** - https://prettier.io/
- **Clean Code** (Robert C. Martin)
- **The Pragmatic Programmer** (Andy Hunt, Dave Thomas)
- **Code Complete** (Steve McConnell)
