# @battlescope/esi-client

A TypeScript client for the EVE Online ESI (EVE Swagger Interface) API.

## Features

- **Type-safe API**: Full TypeScript types for all ESI endpoints
- **Built-in caching**: Redis or in-memory caching with TTL
- **OpenTelemetry**: Instrumentation for tracing and metrics
- **Rate limiting**: Automatic batching for bulk requests
- **Error handling**: Typed errors for ESI HTTP errors
- **Authentication**: Optional OAuth2 token support

## Installation

```bash
pnpm install @battlescope/esi-client
```

## Usage

### Basic Usage

```typescript
import { createEsiClient } from '@battlescope/esi-client';

const esiClient = createEsiClient({
  baseUrl: 'https://esi.evetech.net/latest/',
  datasource: 'tranquility',
  compatibilityDate: '2025-09-30',
  timeoutMs: 10000,
});

// Get character information
const character = await esiClient.getCharacterInfo(123456789);
console.log(character.name);

// Get corporation information
const corporation = await esiClient.getCorporationInfo(character.corporation_id);
console.log(corporation.name, corporation.ticker);

// Get alliance information (if character is in an alliance)
if (character.alliance_id) {
  const alliance = await esiClient.getAllianceInfo(character.alliance_id);
  console.log(alliance.name, alliance.ticker);
}
```

### With Redis Caching

```typescript
import { createEsiClient } from '@battlescope/esi-client';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

const esiClient = createEsiClient({
  cache: {
    get: async (key) => {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : undefined;
    },
    set: async (key, value, ttlMs) => {
      await redis.setex(key, Math.floor(ttlMs / 1000), JSON.stringify(value));
    },
  },
  cacheTtlMs: 300000, // 5 minutes
});
```

### With Authentication

```typescript
const esiClient = createEsiClient({
  getAccessToken: async () => {
    // Return ESI access token for authenticated requests
    return getUserAccessToken();
  },
});

// Now authenticated endpoints work
const characterInfo = await esiClient.getCharacterInfo(123456789);
```

## API Reference

### Character Methods

#### `getCharacterInfo(characterId: number): Promise<CharacterInfo>`

Get public information about a character.

```typescript
const character = await esiClient.getCharacterInfo(123456789);
// {
//   character_id: 123456789,
//   name: "Character Name",
//   corporation_id: 98765432,
//   alliance_id: 99999999, // optional
//   birthday: "2010-01-01T00:00:00Z",
//   gender: "male",
//   race_id: 1,
//   bloodline_id: 3,
//   security_status: 5.0,
// }
```

#### `getCharacterPortraitUrl(characterId: number, size?: 32 | 64 | 128 | 256 | 512): string`

Get the URL for a character's portrait image.

```typescript
const portraitUrl = esiClient.getCharacterPortraitUrl(123456789, 128);
// "https://images.evetech.net/characters/123456789/portrait?size=128"
```

### Corporation Methods

#### `getCorporationInfo(corporationId: number): Promise<CorporationInfo>`

Get public information about a corporation.

```typescript
const corporation = await esiClient.getCorporationInfo(98765432);
// {
//   corporation_id: 98765432,
//   name: "Corporation Name",
//   ticker: "CORP",
//   member_count: 150,
//   alliance_id: 99999999, // optional
//   ceo_id: 123456789,
//   tax_rate: 0.1,
// }
```

#### `getCorporationLogoUrl(corporationId: number, size?: 32 | 64 | 128 | 256): string`

Get the URL for a corporation's logo.

```typescript
const logoUrl = esiClient.getCorporationLogoUrl(98765432, 128);
// "https://images.evetech.net/corporations/98765432/logo?size=128"
```

### Alliance Methods

#### `getAllianceInfo(allianceId: number): Promise<AllianceInfo>`

Get public information about an alliance.

```typescript
const alliance = await esiClient.getAllianceInfo(99999999);
// {
//   alliance_id: 99999999,
//   name: "Alliance Name",
//   ticker: "ALLI",
//   creator_id: 123456789,
//   creator_corporation_id: 98765432,
//   date_founded: "2015-01-01T00:00:00Z",
// }
```

#### `getAllianceLogoUrl(allianceId: number, size?: 32 | 64 | 128 | 256): string`

Get the URL for an alliance's logo.

```typescript
const logoUrl = esiClient.getAllianceLogoUrl(99999999, 128);
// "https://images.evetech.net/alliances/99999999/logo?size=128"
```

### Universe Methods

#### `getUniverseNames(ids: readonly number[]): Promise<Map<number, UniverseName>>`

Resolve entity IDs to names. Automatically batches requests in chunks of 1000.

```typescript
const names = await esiClient.getUniverseNames([30000142, 98000001, 123456789]);
// Map {
//   30000142 => { id: 30000142, name: "Jita", category: "solar_system" },
//   98000001 => { id: 98000001, name: "Doomheim", category: "corporation" },
//   123456789 => { id: 123456789, name: "Character Name", category: "character" }
// }
```

#### `getSystemInfo(systemId: number): Promise<UniverseSystemInfo>`

Get information about a solar system.

```typescript
const system = await esiClient.getSystemInfo(30000142);
// {
//   system_id: 30000142,
//   name: "Jita",
//   security_status: 0.9459,
//   constellation_id: 20000020,
//   stargates: [50000342, 50000343, ...],
//   stations: [60003760, 60003763, ...]
// }
```

## Configuration

### EsiClientConfig

```typescript
interface EsiClientConfig {
  baseUrl?: string; // Default: 'https://esi.evetech.net/latest/'
  datasource?: string; // Default: 'tranquility'
  compatibilityDate?: string; // Default: '2025-09-30'
  timeoutMs?: number; // Default: 10000 (10 seconds)
  getAccessToken?: () => Promise<string | undefined> | string | undefined;
  cache?: CacheAdapter<unknown>;
  cacheTtlMs?: number; // Default: 300000 (5 minutes)
}
```

### CacheAdapter

```typescript
interface CacheAdapter<T> {
  get(key: string): Promise<T | undefined> | T | undefined;
  set(key: string, value: T, ttlMs: number): Promise<void> | void;
}
```

## Error Handling

The client throws typed errors for ESI API failures:

```typescript
import { EsiHttpError, UnauthorizedAPIToken } from '@battlescope/esi-client';

try {
  const character = await esiClient.getCharacterInfo(123456789);
} catch (error) {
  if (error instanceof UnauthorizedAPIToken) {
    console.error('Authentication required:', error.statusCode);
  } else if (error instanceof EsiHttpError) {
    console.error('ESI API error:', error.statusCode, error.responseBody);
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Telemetry

The client automatically emits OpenTelemetry metrics and traces:

**Metrics:**

- `esi.request.count` - Total ESI requests
- `esi.request.duration` - Request duration histogram
- `esi.cache.hit` - Cache hit count
- `esi.cache.miss` - Cache miss count
- `esi.cache.degraded` - Cache error count

**Traces:**

- `esi.{operation_id}` - Span per ESI operation

## License

Private - BattleScope Internal
