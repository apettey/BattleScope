# BattleScope Documentation

This directory contains all documentation for the BattleScope project.

## Contents

### Product & Technical Specifications

- **[product_specs.md](./product_specs.md)** - Complete product specification including features, data model, API examples, and UI requirements
- **[technical_specs.md](./technical_specs.md)** - Technical architecture and implementation details

### API Documentation

- **[openapi.yaml](./openapi.yaml)** - Hand-crafted OpenAPI 3.1.0 specification (reference template)
- **[openapi.json](./openapi.json)** - Auto-generated JSON OpenAPI spec (generated from code)
- **[openapi-generated.yaml](./openapi-generated.yaml)** - Auto-generated YAML OpenAPI spec (generated from code)
- **[openapi-generation.md](./openapi-generation.md)** - Complete guide on how to generate and maintain OpenAPI specs

### Service Documentation

- **[esi-spec/](./esi-spec/)** - EVE Swagger Interface (ESI) client specifications
  - [esi-client-package.md](./esi-spec/esi-client-package.md) - ESI client package design

- **[config/](./config/)** - Service configuration documentation
  - [services.md](./config/services.md) - Service architecture and configuration

### Project Management

- **[linear_projects_issues.md](./linear_projects_issues.md)** - Linear project tracking and issue management

## Quick Start

### Generate OpenAPI Specification

To regenerate the API documentation from the codebase:

```bash
cd backend/api
pnpm run generate-openapi
```

This will update:
- `docs/openapi.json`
- `docs/openapi-generated.yaml`

### View Interactive API Docs

Start the API server and visit the Swagger UI:

```bash
cd backend/api
pnpm run dev
```

Then open: http://localhost:3000/docs

### API Specification Files

- **openapi.yaml**: Original hand-crafted specification (kept as reference/template)
- **openapi.json**: Auto-generated from code annotations (source of truth)
- **openapi-generated.yaml**: YAML version of auto-generated spec

**Recommendation**: Use `openapi.json` or `openapi-generated.yaml` as they reflect the actual implementation.

## Documentation Standards

### Product Specifications

- Use markdown format
- Include tables for structured data
- Provide code examples in JSON/YAML
- Reference actual implementation files with line numbers when possible

### API Documentation

- All routes must have schema definitions in code
- Use Zod schemas for type safety and validation
- Document both success and error responses
- Include detailed descriptions and examples
- Tag routes by functional area

### Code Documentation

- Use JSDoc comments for complex functions
- Document type parameters and return types
- Explain business logic and edge cases
- Link to relevant product spec sections

## Updating Documentation

### When Code Changes

1. Update route schemas in `backend/api/src/schemas.ts`
2. Update route handlers with new schema references
3. Run `pnpm run generate-openapi` to regenerate specs
4. Commit both code and generated specs

### When Requirements Change

1. Update `product_specs.md` with new requirements
2. Implement code changes
3. Update route schemas and handlers
4. Regenerate OpenAPI specs
5. Update any impacted technical documentation

### Adding New Features

1. Document feature in `product_specs.md`
2. Create new schemas in `schemas.ts`
3. Implement routes with proper schema annotations
4. Regenerate OpenAPI specs
5. Update this README if new doc files are added

## API Specification Details

### Key Changes from v1 to v2

1. **BigInt Support**: All entity IDs are now strings to support bigint values
2. **Entity Names**: All responses include both IDs and resolved names
3. **zKillboard Links**: Entity names link to zKillboard for verification
4. **Space Type Filtering**: Enhanced filtering by K-space, J-space, and Pochven
5. **Server-Sent Events**: Real-time killmail streaming support

### Response Format

All API responses follow these conventions:

- **IDs as Strings**: `"killmailId": "12345678"` (not numbers)
- **Nullable Names**: `"allianceName": "Pandemic Legion"` or `null`
- **ISO Timestamps**: `"2025-11-03T18:43:00Z"`
- **Consistent Errors**: `{ "message": "Error description" }`

### Authentication

Authentication is **not yet implemented** in v2. All endpoints are currently public.

Future versions will include:
- JWT-based authentication
- Role-based access control for Rules management
- API key support for external integrations

## Tools & Integrations

### Viewing Documentation

- **Swagger UI**: Built-in at `/docs` when server is running
- **Redoc**: `npx redoc-cli serve docs/openapi.json`
- **VS Code**: OpenAPI preview extensions

### Testing API

- **Postman**: Import `docs/openapi.json`
- **Insomnia**: Import OpenAPI spec
- **curl**: Copy examples from Swagger UI

### Generating Clients

```bash
# TypeScript client
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

## Contributing to Documentation

1. Keep documentation in sync with code
2. Use clear, concise language
3. Provide examples for complex concepts
4. Update the table of contents when adding files
5. Review generated specs before committing
6. Link related documentation sections

## Support

For questions or issues:
- Check existing documentation first
- Review API examples in product specs
- Consult OpenAPI generation guide
- Create a GitHub issue for documentation bugs
