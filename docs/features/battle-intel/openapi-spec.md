# Battle Intel OpenAPI Specification

**Feature Key**: `battle-intel`
**Last Updated**: 2025-11-10

---

## Overview

This document defines the OpenAPI/REST API specification for the Battle Intel feature.

For the general feature specification, see [feature-spec.md](./feature-spec.md).

---

## Base Path

All battle intel endpoints are prefixed with `/api/intel`

---

## Authentication

All endpoints require authentication via session cookie or API key.

Feature-scoped authorization: Requires `battle-intel` feature access with minimum role `user`.

---

## Endpoints

_TODO: Define Battle Intel API endpoints based on feature-spec.md Section 5_

### Global Statistics Summary

```yaml
GET /intel/summary
```

### Alliance Intelligence

```yaml
GET /intel/alliances/{id}
```

### Corporation Intelligence

```yaml
GET /intel/corporations/{id}
```

### Character Intelligence

```yaml
GET /intel/characters/{id}
```

### Opponent Analysis

```yaml
GET /intel/alliances/{id}/opponents
```

### Ship Usage Analysis

```yaml
GET /intel/alliances/{id}/ships
```

---

## Feature Configuration API

### Get Battle Intel Configuration

```yaml
GET /admin/features/battle-intel/config
```

### Update Battle Intel Configuration

```yaml
PUT /admin/features/battle-intel/config
```

---

## Data Models

_TODO: Define TypeScript interfaces for Battle Intel API responses_

---

## Notes

- Battle Intel computes statistics from Battle Reports data
- Data availability depends on Battle Reports ingestion configuration
- Statistics are cached with configurable TTL
