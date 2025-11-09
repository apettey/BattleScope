# Logger Usage Guide

## Overview

The BattleScope logger automatically adds file and package information to every log entry, making it easy to filter and group logs in Loki/Grafana.

## Features

Every log entry automatically includes:
- `file` - Source file path (e.g., `backend/api/src/routes/auth.ts`)
- `package` - Package name (e.g., `api`, `auth`, `database`)
- `caller` - Function/method name (when available)
- Standard Pino fields (level, msg, time, etc.)

## Usage

### For Fastify Applications (API, Ingest, Enrichment, etc.)

```typescript
import Fastify from 'fastify';
import { createLoggerConfig } from '@battlescope/shared';

const app = Fastify({ logger: createLoggerConfig() });

// Then use the logger as normal
app.log.info('Server starting');
app.log.error({ error }, 'Failed to connect');
```

### For Standalone Scripts

```typescript
import pino from 'pino';
import { createLoggerConfig } from '@battlescope/shared';

const logger = pino(createLoggerConfig());

logger.info('Processing batch');
logger.error({ error }, 'Batch failed');
```

### Within Request Handlers

```typescript
app.get('/some-route', async (request, reply) => {
  // Use request.log for request-scoped logging
  request.log.info('Processing request');

  // The file/package/caller are automatically added
  request.log.error({ error }, 'Request failed');

  return { success: true };
});
```

## Example Log Output

```json
{
  "level": 30,
  "time": 1762692420566,
  "pid": 1,
  "hostname": "api-6867c7fd4-8689s",
  "file": "backend/api/src/routes/auth.ts",
  "package": "api",
  "caller": "exchangeCodeForToken",
  "msg": "Token exchange successful",
  "characterId": 12345678,
  "characterName": "Test Character"
}
```

## How It Works

The logger uses Node.js stack traces to automatically detect:

1. **File Path**: Extracts from the call stack, removes absolute paths
2. **Package Name**: Determined from file path pattern matching
3. **Caller**: Function or method name from the stack frame

This happens automatically via Pino's `mixin` feature - no manual logging required!

## Package Detection

The logger automatically detects these packages from file paths:

| File Path Pattern | Package Name |
|------------------|--------------|
| `backend/api/**` | `api` |
| `backend/ingest/**` | `ingest` |
| `backend/enrichment/**` | `enrichment` |
| `backend/clusterer/**` | `clusterer` |
| `backend/scheduler/**` | `scheduler` |
| `packages/auth/**` | `auth` |
| `packages/database/**` | `database` |
| `packages/esi-client/**` | `esi-client` |
| `packages/battle-reports/**` | `battle-reports` |
| `packages/battle-intel/**` | `battle-intel` |
| `packages/shared/**` | `shared` |

## Querying Logs in Grafana

### By File
```logql
{file="backend/api/src/routes/auth.ts"}
```

### By Package
```logql
{package="auth"}
```

### By Package + Error Level
```logql
{package="database"} | json | level >= 50
```

### All Auth Route Files
```logql
{file=~".*routes/auth.*"}
```

## Performance

The stack trace extraction has minimal performance impact:
- Only runs once per log entry
- Uses cached Error.prepareStackTrace
- Skips pino internal frames
- ~0.1-0.2ms overhead per log

## Log Levels

Standard Pino levels:
- `10` - trace
- `20` - debug
- `30` - info (default)
- `40` - warn
- `50` - error
- `60` - fatal

Set via environment variable:
```bash
LOG_LEVEL=debug npm start
```

## Best Practices

### DO:
✅ Use structured logging with context objects
```typescript
logger.info({ userId, action: 'login' }, 'User logged in');
```

✅ Log errors with error objects
```typescript
logger.error({ error, context }, 'Operation failed');
```

✅ Use appropriate log levels
```typescript
logger.debug({ details }, 'Debug info');  // Development only
logger.info({ event }, 'Normal operation');
logger.warn({ issue }, 'Potential problem');
logger.error({ error }, 'Error occurred');
```

### DON'T:
❌ Log sensitive data (passwords, tokens, PII)
```typescript
// BAD
logger.info({ password, accessToken }, 'Auth data');
```

❌ Log in hot loops without throttling
```typescript
// BAD
for (const item of millionItems) {
  logger.info({ item }, 'Processing');  // Creates millions of logs!
}

// GOOD
logger.info({ count: millionItems.length }, 'Processing items');
```

❌ Use string concatenation
```typescript
// BAD
logger.info('User ' + userId + ' did ' + action);

// GOOD
logger.info({ userId, action }, 'User action');
```

## Integration with Other Services

All backend services should use this logger:
- ✅ API (`backend/api`)
- ✅ Ingest (`backend/ingest`)
- ✅ Enrichment (`backend/enrichment`)
- ✅ Clusterer (`backend/clusterer`)
- ✅ Scheduler (`backend/scheduler`)

Packages can also use it:
- ✅ Auth (`packages/auth`)
- ✅ Database (`packages/database`)
- ✅ ESI Client (`packages/esi-client`)

## Troubleshooting

### File shows as "unknown"
- Logger couldn't parse the stack trace
- Might be from a native module or eval'd code
- Check that the file is not in node_modules

### Package shows as "unknown"
- File path doesn't match any known pattern
- Add the pattern to `getCallerInfo()` in `packages/shared/src/logger.ts`

### Caller is undefined
- Anonymous function or arrow function
- Add a name: `const handler = function namedHandler() { ... }`
- Or use method syntax: `{ async handleRequest() { ... } }`

## Extending

To add a new package pattern:

1. Edit `packages/shared/src/logger.ts`
2. Add to the `getCallerInfo()` function:
```typescript
else if (file.startsWith('backend/my-service/')) {
  pkg = 'my-service';
}
```
3. Rebuild shared package: `pnpm --filter @battlescope/shared run build`
4. Rebuild services that use it

## Migration

If you have existing services using `logger: true`:

```typescript
// BEFORE
const app = Fastify({ logger: true });

// AFTER
import { createLoggerConfig } from '@battlescope/shared';
const app = Fastify({ logger: createLoggerConfig() });
```

That's it! No other changes needed - the file/package tracking is automatic.
