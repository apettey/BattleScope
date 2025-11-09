# BattleScope Documentation

This directory contains all documentation for the BattleScope project.

## Contents

### Product & Technical Specifications

- **[product_specs.md](./product_specs.md)** - Platform-level product specification and feature overview
- **[technical_specs.md](./technical_specs.md)** - Technical architecture and implementation details including feature-based package structure
- **[ruleset_configuration_spec.md](./ruleset_configuration_spec.md)** - Ingestion ruleset configuration (systems, security types, alliances, corps)

#### Feature Specifications

- **[features/battle-reports-spec.md](./features/battle-reports-spec.md)** - Battle Reports feature: killmail clustering and battle reconstruction
- **[features/battle-intel-spec.md](./features/battle-intel-spec.md)** - Battle Intel feature: statistical analysis and combat intelligence

#### Authentication & Authorization

- **[authenication-authorization-spec/](./authenication-authorization-spec/)** - EVE Online SSO authentication and feature-scoped RBAC specification

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

## Architecture Overview

### Feature-Based Design

**Status**: ✅ **Implemented**

BattleScope is organized into two main features, each with its own package and business logic:

1. **Battle Reports** (`@battlescope/battle-reports`) - Killmail collection, clustering, and battle reconstruction
2. **Battle Intel** (`@battlescope/battle-intel`) - Statistical analysis, opponent tracking, and combat intelligence

Features are:

- **Separated at package level**: Each feature has its own directory in `packages/`
- **Permission-scoped**: Users can have access to one or both features independently (planned)
- **UI-adaptive**: Frontend gracefully degrades based on feature access (planned)

**Current Implementation**:

- ✅ `packages/battle-reports` - Contains clustering engine and clusterer service
- ✅ `packages/battle-intel` - Package structure created for future intelligence services
- ✅ `backend/clusterer` - Now uses `@battlescope/battle-reports` package
- ⏳ Permission-based access control - Planned (see Authentication & Authorization)

**See**:

- [features/battle-reports-spec.md](./features/battle-reports-spec.md) for Battle Reports details
- [features/battle-intel-spec.md](./features/battle-intel-spec.md) for Battle Intel details

### Ingestion Configuration

**Status**: ✅ **Implemented**

Ingestion ruleset configuration is now available via the Rules API:

- **GET /rulesets/current** - Get current ingestion configuration
- **PUT /rulesets/current** - Update ingestion filters

**Supported Filters**:

- Minimum pilots (e.g., only track battles with 5+ participants)
- Tracked alliances (allowlist of alliance IDs)
- Tracked corporations (allowlist of corporation IDs)
- Tracked systems (specific solar system IDs)
- Security types (highsec, lowsec, nullsec, wormhole, pochven)

Changes are immediately published to all ingestion service instances via Redis pub/sub.

**See**: [ruleset_configuration_spec.md](./ruleset_configuration_spec.md) for complete details.

---

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

### Authentication & Authorization

**Status**: ⏳ **Planned**

Authentication and authorization are fully specified but not yet implemented:

- **EVE Online SSO** - OAuth2/OIDC authentication
- **Multi-character support** - Link multiple EVE characters to one account
- **Feature-scoped RBAC** - Roles per feature: `user`, `fc`, `director`, `admin`, `superadmin`
- **Graceful UI degradation** - UI adapts based on feature access

**Current State**: All endpoints are currently public (no authentication required)

**See**: [authenication-authorization-spec/](./authenication-authorization-spec/) for complete specification

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
