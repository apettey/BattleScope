# Product Requirements Specification

**Version**: 1.0
**Last Updated**: 2025-11-12
**Status**: Production

---

## Overview

This document outlines the functional and non-functional requirements for the BattleScope platform, extracted from feature specifications and architectural documentation.

---

## Functional Requirements

### F1: Data Ingestion

**F1.1**: The system SHALL continuously poll zKillboard RedisQ for new killmails at configurable intervals (default: 5 seconds).

**F1.2**: The system SHALL apply configurable rulesets to filter killmails before storage based on:
- Minimum pilot count
- Alliance/corporation/character whitelist
- System whitelist
- Space type (K-space, J-space, Pochven)
- Security level (high-sec, low-sec, null-sec)

**F1.3**: The system SHALL store only minimal killmail metadata (ID, timestamp, system, participants) to minimize storage footprint.

**F1.4**: The system SHALL queue accepted killmails for asynchronous enrichment.

**F1.5**: The system SHALL fetch full killmail details from zKillboard API respecting rate limits (configurable throttle).

### F2: Battle Reconstruction

**F2.1**: The system SHALL cluster related killmails into battles using temporal and spatial proximity:
- Time window: 30 minutes (configurable)
- Max gap between kills: 15 minutes (configurable)
- Same solar system
- Participant overlap (shared alliances/corps)

**F2.2**: The system SHALL require minimum 2 killmails to create a battle (configurable).

**F2.3**: The system SHALL compute battle statistics:
- Start/end time
- Duration
- Total kills
- Total ISK destroyed
- Participant count by side
- Space type classification

**F2.4**: The system SHALL generate zKillboard "related kills" URLs for each battle.

**F2.5**: The system SHALL process unprocessed killmails every 5 minutes (configurable).

### F3: Battle Viewing

**F3.1**: Users SHALL be able to list battles with filtering by:
- Space type
- Time range
- Alliance/corporation/character participation
- Solar system
- ISK destroyed range
- Participant count range

**F3.2**: Users SHALL be able to view detailed battle information including:
- All associated killmails
- All participants with ship types
- Side determination (if applicable)
- Battle statistics
- Links to zKillboard for verification

**F3.3**: Users SHALL be able to view a real-time killmail feed via Server-Sent Events (SSE).

**F3.4**: The system SHALL support pagination for battle lists (default: 20 per page, max: 100).

### F4: Intelligence Analytics

**F4.1**: The system SHALL compute aggregate statistics for entities (alliances, corporations, characters):
- Total battles participated
- Total kills and losses
- ISK destroyed vs ISK lost
- ISK efficiency percentage
- Average battle size
- Most used ships
- Top opponents
- Geographic activity distribution

**F4.2**: The system SHALL provide opponent analysis showing:
- Top opponents by battle count
- Kills vs losses against each opponent
- ISK destroyed vs lost
- Win rate percentage
- Last engagement timestamp

**F4.3**: The system SHALL analyze ship composition:
- Most used ships by entity
- Usage count and percentage
- Kill/loss ratio per ship type
- Average ISK value

**F4.4**: The system SHALL identify geographic activity hotspots:
- Systems with most battles
- Regions with most activity
- Activity breakdown by space type

**F4.5**: Statistics SHALL be cached with configurable TTL (default: 1 hour) for performance.

### F5: Search

**F5.1**: The system SHALL provide autocomplete for:
- Alliance names
- Corporation names
- Character names
- Solar system names

**F5.2**: Autocomplete SHALL respond within 100ms (p95).

**F5.3**: The system SHALL support fuzzy matching with 1-2 typo tolerance.

**F5.4**: The system SHALL provide full-text search across battles with filtering.

**F5.5**: Search results SHALL be ranked by relevance and activity.

**F5.6**: The system SHALL index battles, entities, and systems in Typesense within 5 minutes of creation.

### F6: Authentication

**F6.1**: Users SHALL authenticate via EVE Online SSO using OAuth2/OIDC.

**F6.2**: The system SHALL support multi-character accounts (multiple EVE characters per account).

**F6.3**: Users SHALL be able to designate one character as "primary".

**F6.4**: The system SHALL enforce organization gating based on corporation/alliance membership (configurable).

**F6.5**: The system SHALL create HTTP-only, secure session cookies with 30-day expiration.

**F6.6**: The system SHALL encrypt ESI access/refresh tokens at rest using AES-256-GCM.

**F6.7**: The system SHALL automatically refresh ESI tokens before expiration.

### F7: Authorization

**F7.1**: The system SHALL implement feature-scoped RBAC with four roles per feature:
- User (rank 10): View access
- Fleet Commander (rank 20): Create access
- Director (rank 30): Edit and settings access
- Admin (rank 40): Full feature management

**F7.2**: The system SHALL support global SuperAdmin role that bypasses all checks.

**F7.3**: Authorization decisions SHALL be cached in Redis for 60 seconds.

**F7.4**: The system SHALL log all authorization decisions (allow/deny) to audit log.

### F8: Admin Management

**F8.1**: SuperAdmins SHALL be able to view and search all user accounts.

**F8.2**: SuperAdmins SHALL be able to assign/revoke feature roles.

**F8.3**: SuperAdmins SHALL be able to block/unblock user accounts.

**F8.4**: SuperAdmins SHALL be able to promote/demote other SuperAdmins.

**F8.5**: SuperAdmins SHALL be able to configure organization gating rules (allow/deny lists).

**F8.6**: SuperAdmins SHALL be able to configure feature settings (ingestion filters, cache TTLs, etc.).

**F8.7**: SuperAdmins SHALL be able to view audit logs with filtering and export.

### F9: User Profile

**F9.1**: Users SHALL be able to view their own account information:
- Display name
- Email address (if set)
- Primary character
- All linked characters
- Feature roles assigned
- Last login timestamp

**F9.2**: Users SHALL be able to add additional characters via EVE SSO.

**F9.3**: Users SHALL be able to remove characters from their account (with safeguards).

**F9.4**: Users SHALL be able to change their primary character.

**F9.5**: Users SHALL be able to view ESI token expiration status for each character.

---

## Non-Functional Requirements

### Performance

**NFR1.1**: API endpoints SHALL respond within 500ms (p95) under normal load.

**NFR1.2**: Battle detail pages SHALL load within 2 seconds (p95).

**NFR1.3**: Search autocomplete SHALL respond within 100ms (p95).

**NFR1.4**: The system SHALL support 1,000 concurrent users without degradation.

**NFR1.5**: The system SHALL ingest and process 500 battles per hour during peak activity.

**NFR1.6**: Database queries SHALL complete within 1 second (p95).

**NFR1.7**: Battle clustering SHALL complete within 5 minutes of killmail enrichment (p95).

### Scalability

**NFR2.1**: The system SHALL handle 100,000+ battles without performance degradation.

**NFR2.2**: The system SHALL scale horizontally by adding API replicas.

**NFR2.3**: The system SHALL support database read replicas for analytics queries.

**NFR2.4**: The system SHALL handle traffic spikes of 2x normal load for up to 1 hour.

### Availability

**NFR3.1**: The system SHALL maintain 99.5% uptime (monthly SLO).

**NFR3.2**: Planned maintenance windows SHALL be scheduled during low-traffic periods.

**NFR3.3**: The system SHALL gracefully degrade when non-critical components fail (enrichment, search).

**NFR3.4**: Critical components (API, database, Redis) SHALL have automated failover.

### Reliability

**NFR4.1**: The system SHALL maintain <1% error rate for user-facing requests.

**NFR4.2**: The system SHALL maintain <0.1% data loss rate for ingested killmails.

**NFR4.3**: The system SHALL verify data consistency every 6 hours.

**NFR4.4**: The system SHALL automatically retry failed operations with exponential backoff.

### Security

**NFR5.1**: All external traffic SHALL use TLS 1.2 or higher.

**NFR5.2**: Session cookies SHALL be HTTP-only and Secure.

**NFR5.3**: ESI tokens SHALL be encrypted at rest with AES-256-GCM.

**NFR5.4**: All user input SHALL be validated before processing.

**NFR5.5**: Database queries SHALL use parameterized statements to prevent SQL injection.

**NFR5.6**: The system SHALL enforce rate limiting (100 req/min per IP, 500 req/min per user).

**NFR5.7**: Failed authentication attempts SHALL be logged and trigger alerts after 10 failures.

**NFR5.8**: The system SHALL log all admin actions to immutable audit log.

### Usability

**NFR6.1**: The user interface SHALL be responsive and work on mobile devices (768px+).

**NFR6.2**: All user-facing errors SHALL provide clear, actionable messages.

**NFR6.3**: The system SHALL provide inline help and tooltips for configuration options.

**NFR6.4**: The admin interface SHALL group related functions logically.

**NFR6.5**: Search results SHALL be returned within 2 seconds (p95).

### Maintainability

**NFR7.1**: All services SHALL emit structured JSON logs with correlation IDs.

**NFR7.2**: All services SHALL expose health check endpoints.

**NFR7.3**: All services SHALL export OpenTelemetry metrics and traces.

**NFR7.4**: The system SHALL provide Grafana dashboards for all services.

**NFR7.5**: Code SHALL maintain >80% test coverage.

**NFR7.6**: Database migrations SHALL be reversible.

**NFR7.7**: The system SHALL support zero-downtime deployments.

### Observability

**NFR8.1**: Logs SHALL be retained for 7 days (application), 90 days (audit).

**NFR8.2**: Metrics SHALL be retained for 15 days.

**NFR8.3**: Traces SHALL be retained for 7 days.

**NFR8.4**: The system SHALL alert on SLO breaches within 5 minutes.

**NFR8.5**: Critical alerts SHALL page on-call engineer 24/7.

**NFR8.6**: Dashboard queries SHALL complete within 5 seconds.

### Compliance

**NFR9.1**: The system SHALL comply with GDPR requirements:
- Right to access (data export)
- Right to erasure (account deletion)
- Right to rectification (data updates)
- Data minimization (only necessary data collected)

**NFR9.2**: The system SHALL provide audit trail for all sensitive operations.

**NFR9.3**: The system SHALL anonymize deleted user data within 30 days.

**NFR9.4**: The system SHALL obtain user consent for ESI scope access.

---

## Data Requirements

### DR1: Battle Data

**DR1.1**: Each battle SHALL have unique identifier (UUID).

**DR1.2**: Battles SHALL store: system ID, space type, start/end time, total kills, total ISK destroyed, zKillboard URL.

**DR1.3**: Battle killmails SHALL reference external zKillboard IDs (not store full payloads).

**DR1.4**: Battle participants SHALL track: character, corporation, alliance, ship type, side, victim status.

### DR2: User Data

**DR2.1**: Each account SHALL have unique identifier (UUID).

**DR2.2**: Accounts SHALL store: email (optional), display name, primary character reference, block status, SuperAdmin flag.

**DR2.3**: Characters SHALL store: EVE character ID, name, portrait URL, corporation, alliance, ESI tokens (encrypted), scopes.

**DR2.4**: Session data SHALL be stored in Redis with 30-day TTL.

### DR3: Configuration Data

**DR3.1**: Feature configurations SHALL be stored as JSONB in `feature_config` table.

**DR3.2**: Organization gating rules SHALL be stored in singleton `auth_config` table.

**DR3.3**: Role assignments SHALL link accounts to features with specific roles.

### DR4: Audit Data

**DR4.1**: All authentication events SHALL be logged with timestamp, actor, action, target, metadata.

**DR4.2**: Audit logs SHALL be immutable (no updates/deletes).

**DR4.3**: Audit logs SHALL be retained for 90 days minimum.

---

## Integration Requirements

### INT1: zKillboard Integration

**INT1.1**: The system SHALL poll zKillboard RedisQ at configurable intervals (1-60 seconds).

**INT1.2**: The system SHALL fetch killmail details from zKillboard API.

**INT1.3**: The system SHALL respect zKillboard rate limits (configurable throttle).

**INT1.4**: The system SHALL handle zKillboard API failures gracefully with retries.

**INT1.5**: The system SHALL generate valid zKillboard "related kills" URLs.

### INT2: EVE ESI Integration

**INT2.1**: The system SHALL use EVE ESI API for:
- Character information
- Corporation information
- Alliance information
- Solar system information
- Ship type information

**INT2.2**: The system SHALL cache ESI responses according to cache headers.

**INT2.3**: The system SHALL handle ESI rate limiting with exponential backoff.

**INT2.4**: The system SHALL validate ESI responses before storing.

### INT3: EVE SSO Integration

**INT3.1**: The system SHALL implement OAuth2/OIDC flow for EVE authentication.

**INT3.2**: The system SHALL validate JWT signatures using EVE's JWKS endpoint.

**INT3.3**: The system SHALL handle OAuth errors gracefully.

**INT3.4**: The system SHALL request minimum necessary ESI scopes.

---

## User Interface Requirements

### UI1: Responsive Design

**UI1.1**: The interface SHALL be usable on screens 768px and wider.

**UI1.2**: The interface SHALL use mobile-first design principles.

**UI1.3**: Critical actions SHALL be accessible via keyboard navigation.

### UI2: Accessibility

**UI2.1**: The interface SHALL meet WCAG 2.1 Level AA standards.

**UI2.2**: All images SHALL have alt text.

**UI2.3**: Color SHALL not be the only means of conveying information.

**UI2.4**: Interactive elements SHALL have clear focus indicators.

### UI3: Performance

**UI3.1**: Initial page load SHALL complete within 3 seconds on 3G connection.

**UI3.2**: Time to interactive SHALL be within 5 seconds.

**UI3.3**: Images SHALL be optimized and lazy-loaded.

**UI3.4**: The interface SHALL use code splitting for routes.

---

## References

- [Product Features Catalog](/docs/product-specifications/features.md)
- [Architecture Documentation](/docs/architecture.md)
- [SLA/SLO Specification](/docs/technical-specifications/sla-slo.md)
- [Security Specification](/docs/technical-specifications/security.md)
