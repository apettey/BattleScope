# OpenAPI Specification Generation

This document describes how to automatically generate the OpenAPI specification from the BattleScope API codebase.

## Overview

BattleScope uses **Fastify** with **Zod schemas** to automatically generate OpenAPI 3.1.0 specifications. This approach ensures that the API documentation is always in sync with the actual implementation.

## Architecture

### Stack
- **Fastify**: Web framework with built-in OpenAPI support
- **@fastify/swagger**: Plugin for OpenAPI generation
- **@fastify/swagger-ui**: Interactive API documentation UI
- **fastify-type-provider-zod**: Zod integration for type-safe schemas
- **Zod**: Schema validation and TypeScript type inference

### Key Files

| File | Purpose |
|------|---------|
| `backend/api/src/schemas.ts` | Centralized Zod schemas for all API types |
| `backend/api/src/server.ts` | Fastify server with Swagger plugins configured |
| `backend/api/src/routes/*.ts` | Route handlers with schema definitions |
| `backend/api/src/generate-openapi.ts` | CLI script to export OpenAPI spec |
| `docs/openapi.json` | Generated JSON specification |
| `docs/openapi-generated.yaml` | Generated YAML specification |

## How It Works

### 1. Schema Definitions

All API request/response schemas are defined in `schemas.ts` using Zod:

```typescript
import { z } from 'zod';

export const BattleSummarySchema = z.object({
  id: z.string().uuid(),
  systemId: z.string(),
  systemName: z.string().nullable(),
  spaceType: z.enum(['kspace', 'jspace', 'pochven']),
  // ... more fields
});

export type BattleSummary = z.infer<typeof BattleSummarySchema>;
```

### 2. Route Documentation

Each route handler includes schema metadata:

```typescript
app.get('/battles', {
  schema: {
    tags: ['Battles'],
    summary: 'List battles',
    description: 'Returns a paginated list of battles...',
    querystring: BattleListQuerySchema,
    response: {
      200: BattleListResponseSchema,
      400: ErrorResponseSchema,
      500: ErrorResponseSchema,
    },
  },
  handler: async (request, reply) => {
    // Implementation
  },
});
```

### 3. OpenAPI Generation

The schemas are automatically converted to JSON Schema and included in the OpenAPI spec through the `@fastify/swagger` plugin configured in `server.ts`.

## Generating the Specification

### Method 1: Using the Generation Script

Run the generation script to export the OpenAPI spec as JSON and YAML:

```bash
cd backend/api
pnpm run generate-openapi
```

This will:
1. Build a Fastify server instance
2. Load all routes with their schemas
3. Generate the OpenAPI specification
4. Export to:
   - `docs/openapi.json` (JSON format)
   - `docs/openapi-generated.yaml` (YAML format)

### Method 2: Via Interactive Swagger UI

When the API server is running, you can:

1. Start the development server:
   ```bash
   cd backend/api
   pnpm run dev
   ```

2. Open your browser to:
   ```
   http://localhost:3000/docs
   ```

3. The Swagger UI will display the interactive API documentation

4. To download the spec:
   - Visit `http://localhost:3000/docs/json` for JSON
   - Visit `http://localhost:3000/docs/yaml` for YAML

## Adding Documentation to New Routes

When creating a new route, follow this pattern:

### 1. Define Schemas

Add request/response schemas to `schemas.ts`:

```typescript
export const MyRequestSchema = z.object({
  param: z.string(),
});

export const MyResponseSchema = z.object({
  result: z.string(),
});
```

### 2. Document the Route

Include schema metadata in the route definition:

```typescript
app.post('/my-endpoint', {
  schema: {
    tags: ['MyFeature'],
    summary: 'Brief description',
    description: 'Detailed explanation of what this endpoint does',
    body: MyRequestSchema,
    response: {
      200: MyResponseSchema,
      400: ErrorResponseSchema,
      500: ErrorResponseSchema,
    },
  },
  handler: async (request, reply) => {
    // Your implementation
  },
});
```

### 3. Use Type Safety

Leverage TypeScript inference from Zod schemas:

```typescript
const body = MyRequestSchema.parse(request.body);
// TypeScript knows the exact type of `body`
```

## Schema Best Practices

### 1. String IDs for BigInt

All EVE Online entity IDs must be strings to support bigint values:

```typescript
export const EntityIdSchema = z.string().regex(/^\d+$/);
```

### 2. Nullable Fields

Use `.nullable()` for optional fields that can be `null`:

```typescript
export const OptionalFieldSchema = z.object({
  maybeValue: z.string().nullable(),
});
```

### 3. Enums for Constants

Use Zod enums for fixed value sets:

```typescript
export const SpaceTypeSchema = z.enum(['kspace', 'jspace', 'pochven']);
```

### 4. Date-Time Strings

Use ISO 8601 date-time strings:

```typescript
export const TimestampSchema = z.string().datetime();
```

### 5. Arrays

Define array item types:

```typescript
export const ItemListSchema = z.array(ItemSchema);
```

## OpenAPI Configuration

The OpenAPI metadata is configured in `server.ts`:

```typescript
void app.register(swagger, {
  openapi: {
    info: {
      title: 'BattleScope API',
      version: '2.0.0',
      description: 'API documentation...',
      contact: { name: 'BattleScope Support' },
      license: { name: 'MIT' },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local development' },
    ],
    tags: [
      { name: 'Battles', description: '...' },
      { name: 'Killmails', description: '...' },
      // ... more tags
    ],
  },
  transform: jsonSchemaTransform,
});
```

## Validation

The Zod schemas provide automatic request/response validation:

- **Request validation**: Invalid requests are rejected with 400 errors
- **Response validation**: Ensures responses match the documented schema
- **Type safety**: TypeScript types are inferred from schemas

## CI/CD Integration

### Automated Generation

Add to your CI pipeline:

```yaml
- name: Generate OpenAPI Spec
  run: |
    cd backend/api
    pnpm run generate-openapi
    
- name: Validate Spec
  run: |
    npx @redocly/cli lint docs/openapi.json
```

### Commit Generated Files

The generated spec files should be committed to version control:

```bash
git add docs/openapi.json docs/openapi-generated.yaml
git commit -m "chore: update OpenAPI specification"
```

## Troubleshooting

### Schema Not Appearing in Docs

**Cause**: Route missing schema definition

**Solution**: Add schema object to route configuration:
```typescript
app.get('/my-route', {
  schema: { /* add schema here */ },
  handler: async () => { /* ... */ }
});
```

### Type Mismatch Errors

**Cause**: Response doesn't match defined schema

**Solution**: Ensure your handler returns data matching the response schema

### Generation Script Fails

**Cause**: Missing dependencies or circular imports

**Solution**: 
1. Check that all dependencies are installed
2. Verify imports don't create circular dependencies
3. Ensure mock utilities properly stub all dependencies

## Tools and Ecosystem

### Compatible Tools

The generated OpenAPI spec works with:

- **Swagger UI**: Interactive API documentation (built-in at `/docs`)
- **Postman**: Import spec for API testing
- **Insomnia**: API client with OpenAPI support
- **OpenAPI Generator**: Generate client SDKs in multiple languages
- **Redoc**: Alternative documentation renderer
- **Spectral**: Linting and validation

### Client SDK Generation

Generate type-safe clients:

```bash
# TypeScript/JavaScript client
npx @openapitools/openapi-generator-cli generate \
  -i docs/openapi.json \
  -g typescript-axios \
  -o clients/typescript

# Python client
npx @openapitools/openapi-generator-cli generate \
  -i docs/openapi.json \
  -g python \
  -o clients/python
```

## Maintenance

### When to Regenerate

Regenerate the OpenAPI spec when:

- Adding new routes
- Modifying request/response schemas
- Changing route parameters or query strings
- Updating API descriptions
- Releasing a new API version

### Version Management

Update the version in `server.ts`:

```typescript
openapi: {
  info: {
    version: '2.1.0', // Increment version
    // ...
  }
}
```

Follow semantic versioning:
- **Major**: Breaking changes
- **Minor**: New features (backward compatible)
- **Patch**: Bug fixes

## Additional Resources

- [Fastify Documentation](https://www.fastify.io/)
- [Zod Documentation](https://zod.dev/)
- [OpenAPI 3.1 Specification](https://spec.openapis.org/oas/v3.1.0)
- [@fastify/swagger Documentation](https://github.com/fastify/fastify-swagger)
- [fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod)
