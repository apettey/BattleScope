# Admin Panel OpenAPI Specification

**Feature Key**: `admin-panel`
**Last Updated**: 2025-11-10

---

## Overview

This document defines the OpenAPI/REST API specification for the Admin Panel feature.

For the general feature specification, see [feature-spec.md](./feature-spec.md).

---

## Base Path

All admin endpoints are prefixed with `/api/admin`

---

## Authentication

All endpoints require authentication via session cookie or API key.

Authorization: SuperAdmin only (`is_super_admin = true`)

---

## Endpoints

_TODO: Define Admin Panel API endpoints based on feature-spec.md Section 8.1_

### User Management

```yaml
GET /admin/accounts
GET /admin/accounts/{id}
PATCH /admin/accounts/{id}
POST /admin/accounts/{id}/block
POST /admin/accounts/{id}/unblock
POST /admin/accounts/{id}/superadmin
DELETE /admin/accounts/{id}/superadmin
DELETE /admin/accounts/{id}
```

### Role Management

```yaml
PUT /admin/accounts/{id}/roles
DELETE /admin/accounts/{id}/roles/{featureKey}
GET /admin/roles/matrix
POST /admin/roles/bulk-assign
```

### Feature Management

```yaml
GET /admin/features
GET /admin/features/{key}
POST /admin/features
PATCH /admin/features/{key}
GET /admin/features/{key}/settings
PUT /admin/features/{key}/settings
GET /admin/features/{key}/config
PUT /admin/features/{key}/config
GET /admin/features/{key}/role-distribution
```

### Organization Gating

```yaml
GET /admin/auth-config
PUT /admin/auth-config
POST /admin/auth-config/check
```

### Audit Logs

```yaml
GET /admin/audit-logs
GET /admin/audit-logs/{id}
GET /admin/audit-logs/export
```

### Analytics

```yaml
GET /admin/analytics/user-activity
GET /admin/analytics/feature-adoption
GET /admin/analytics/system-health
```

---

## Data Models

_TODO: Define TypeScript interfaces for Admin Panel API requests/responses_

---

## Security

- All endpoints require SuperAdmin access
- All actions are logged to audit trail
- Rate limiting applies
- Input validation via Zod schemas
