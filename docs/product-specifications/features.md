# Product Features Catalog

**Version**: 1.0
**Last Updated**: 2025-11-12
**Status**: Production

---

## Overview

This document catalogs all features in the BattleScope platform, their current implementation status, user stories, and technical notes.

---

## Feature Index

1. [Battle Reports](#1-battle-reports)
2. [Battle Intel](#2-battle-intel)
3. [Search](#3-search)
4. [Admin Panel](#4-admin-panel)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [User Profile](#6-user-profile)

---

## 1. Battle Reports

**Feature Key**: `battle-reports`
**Status**: ✅ Implemented
**Reference**: `/docs/features/battle-reports/feature-spec.md`

### Description

Automated killmail ingestion, intelligent clustering into battles, and battle reconstruction with comprehensive statistics and participant details.

### User Stories

**As an Alliance Leader**, I want to:
- View all battles my alliance participated in
- Filter battles by space type (K-space, J-space, Pochven)
- See battle statistics (ISK destroyed, participants, duration)
- Access direct zKillboard links for verification

**As a Fleet Commander**, I want to:
- Review recent battles in specific systems
- Analyze participant composition by side
- Track ISK efficiency in engagements
- Share battle reports with my fleet

**As a Line Member**, I want to:
- See my character's battle participation history
- View battles I was involved in
- Check killmails associated with each battle
- Access real-time killmail feed

### Acceptance Criteria

- ✅ Killmails ingested from zKillboard RedisQ within 10 seconds
- ✅ Battles clustered within 5 minutes of killmail enrichment
- ✅ Battle list filterable by space type, time range, entities
- ✅ Battle detail pages show all killmails and participants
- ✅ Real-time killmail SSE stream functional
- ✅ zKillboard "related kills" URLs generated correctly

### Technical Components

**Backend Services**:
- Ingest Service: zKillboard RedisQ polling
- Enrichment Service: BullMQ worker for killmail enrichment
- Clusterer Service: Battle reconstruction algorithm
- API Service: REST endpoints for battles and killmails

**Database Tables**:
- `battles`: Battle records with metadata
- `battle_killmails`: Killmail references
- `battle_participants`: Character participation tracking
- `killmails`: Initial killmail ingestion
- `rulesets`: Ingestion filter configuration

**Configuration Options**:
- Minimum pilots threshold (default: 5)
- Tracked alliances/corporations/characters
- System whitelist
- Space type filters (K/J/Poch)
- Security level filters (high/low/null)
- Enrichment throttle (rate limiting)
- Clustering parameters (time window, min kills, max gap)

### Future Enhancements

- [ ] Battle notifications (Discord/Slack)
- [ ] Battle tagging/categorization
- [ ] Doctrine detection
- [ ] Battle timeline visualization
- [ ] Export to CSV/JSON
- [ ] Battle comparison tool

---

## 2. Battle Intel

**Feature Key**: `battle-intel`
**Status**: ✅ Implemented
**Reference**: `/docs/features/battle-intel/feature-spec.md`

### Description

Intelligence and statistical analysis about combat activities, tracking who fights whom, where battles occur, ship compositions, and performance metrics.

### User Stories

**As an Intel Analyst**, I want to:
- View statistics for any alliance/corporation/character
- See top opponents and engagement patterns
- Analyze ship composition trends
- Identify geographic activity hotspots
- Track ISK efficiency over time

**As a Director**, I want to:
- Monitor our alliance's combat performance
- Compare our stats with other alliances
- Identify most active members
- Track doctrine usage
- Understand where we're most active

**As a Recruiter**, I want to:
- View potential recruit combat statistics
- See their most used ships
- Check their participation frequency
- Verify their claimed experience

### Acceptance Criteria

- ✅ Entity statistics computed from battle data
- ✅ Opponent analysis shows top 10 opponents
- ✅ Ship composition breakdown by entity
- ✅ Geographic heatmap by system
- ✅ ISK efficiency calculations accurate
- ✅ Activity timeline displays correctly
- ✅ Statistics cache efficiently (< 500ms response time)

### Technical Components

**Backend Package**: `@battlescope/battle-intel`

**Key Modules**:
- Alliance/Corp/Character aggregators
- Opponent analyzer
- Ship analyzer
- Geographic analyzer
- Intel service (API integration)

**Data Sources**:
- All data computed from `battles`, `battle_killmails`, `battle_participants`
- No dedicated tables (computed views)

**Caching Strategy**:
- Entity stats: 1-hour TTL
- Global summary: 5-minute TTL
- Opponent analysis: 1-hour TTL
- Ship composition: 2-hour TTL

**Configuration Options**:
- Cache TTL values
- Cache warming enabled/disabled
- Cache warming interval
- Top entities to pre-compute
- Default time range
- Minimum battles threshold
- ISK display format

### Future Enhancements

- [ ] Doctrine detection and classification
- [ ] Time-based activity heatmaps
- [ ] Predictive analytics (where/when entities will fight)
- [ ] Custom intelligence reports
- [ ] Intelligence alerts (notify when opponents active)
- [ ] Comparative analysis (side-by-side)
- [ ] Export to PDF/CSV

---

## 3. Search

**Feature Key**: `search`
**Status**: ✅ Implemented
**Reference**: `/docs/features/search/feature-spec.md`

### Description

Fast, flexible full-text search across battles, entities, and systems using Typesense with autocomplete, fuzzy matching, and faceted filtering.

### User Stories

**As a User**, I want to:
- Quickly find battles by system name
- Search for alliances/corporations by partial name
- Find characters without remembering exact spelling
- Filter search results by space type, date, etc.
- Get autocomplete suggestions as I type

**As an Analyst**, I want to:
- Search battles involving specific entities
- Find battles in particular regions
- Use advanced filters for complex queries
- Export search results

### Acceptance Criteria

- ✅ Autocomplete responds in < 100ms (p95)
- ✅ Battle search responds in < 200ms (p95)
- ✅ Fuzzy matching tolerates 1-2 typos
- ✅ Search results ranked by relevance
- ✅ Faceted filters update dynamically
- ✅ Search indexes updated within 5 minutes

### Technical Components

**Search Engine**: Typesense 0.25

**Collections**:
- `battles`: Searchable battle records
- `entities`: Alliances, corporations, characters
- `systems`: EVE Online solar systems

**Indexing Strategy**:
- Real-time: Index battles on creation
- Daily sync: CronJob refreshes entity metadata
- Activity-based: Only index entities/systems with battles

**API Endpoints**:
- `GET /search/entities`: Autocomplete entities
- `GET /search/systems`: Autocomplete systems
- `GET /search/global`: Search across all collections
- `POST /search/battles`: Advanced battle search

### Future Enhancements

- [ ] Search analytics (popular queries, CTR)
- [ ] Saved searches
- [ ] "Did you mean..." suggestions
- [ ] Related searches
- [ ] Visual query builder
- [ ] Search alerts (notify on new matches)
- [ ] Personalized ranking
- [ ] Geospatial search

---

## 4. Admin Panel

**Feature Key**: `admin` (SuperAdmin only, not feature-scoped)
**Status**: ⚠️ Partially Implemented
**Reference**: `/docs/features/admin-panel/feature-spec.md`

### Description

Privileged interface for SuperAdmins to manage users, roles, features, system configuration, and monitor platform activity.

### User Stories

**As a SuperAdmin**, I want to:
- View and search all user accounts
- Assign/revoke feature roles
- Block/unblock user accounts
- Configure organization gating rules
- View audit logs of all system actions
- Monitor platform health and usage
- Configure feature settings

### Acceptance Criteria

- ✅ Account directory with search and filters
- ✅ Role assignment matrix
- ⚠️ Block/unblock functionality (partial)
- ⚠️ SuperAdmin promotion/demotion (partial)
- ❌ Feature configuration UI (missing)
- ❌ Org gating configuration UI (missing)
- ⚠️ Audit log viewer (basic implementation)
- ❌ Analytics dashboard (missing)

### Technical Components

**Backend Routes**:
- `GET /admin/accounts`: List accounts
- `GET /admin/accounts/:id`: View account details
- `PATCH /admin/accounts/:id`: Update account
- `POST /admin/accounts/:id/block`: Block account
- `POST /admin/accounts/:id/unblock`: Unblock account
- `POST /admin/accounts/:id/superadmin`: Promote to SuperAdmin
- `DELETE /admin/accounts/:id/superadmin`: Demote from SuperAdmin
- `PUT /admin/accounts/:id/roles`: Assign feature roles
- `GET /admin/features`: List features
- `PUT /admin/features/:key/config`: Update feature configuration
- `GET /admin/auth-config`: Get org gating config
- `PUT /admin/auth-config`: Update org gating rules
- `GET /admin/audit-logs`: View audit logs

**Frontend Routes**:
- `/admin`: Dashboard
- `/admin/accounts`: Account management
- `/admin/accounts/:id`: User detail view
- `/admin/roles`: Role management
- `/admin/features`: Feature configuration
- `/admin/org-gating`: Organization gating
- `/admin/audit-logs`: Audit log viewer
- `/admin/analytics`: Platform analytics

### Implementation Status

**✅ Completed**:
- Database schema for accounts, roles, features
- Backend API routes for user management
- Backend API routes for role assignment
- Audit logging infrastructure

**⚠️ In Progress**:
- Frontend admin UI components
- View User page with character grouping

**❌ Not Started**:
- Feature configuration UI (Battle Reports/Intel)
- Org gating configuration UI
- Advanced audit log filtering
- Analytics dashboard

### Future Enhancements

- [ ] Impersonation mode (support)
- [ ] Scheduled role changes
- [ ] Role approval workflow
- [ ] Advanced analytics (ML-based)
- [ ] API keys management
- [ ] Webhook configuration
- [ ] Custom audit alerts
- [ ] Bulk user import
- [ ] Corp/Alliance auto-sync from ESI

---

## 5. Authentication & Authorization

**Status**: ⚠️ Partially Implemented (Critical Gaps)
**Reference**: `/docs/authenication-authorization-spec/README.md`

### Description

EVE Online SSO authentication with multi-character support and feature-scoped RBAC.

### User Stories

**As a New User**, I want to:
- Log in with my EVE Online character
- Understand what permissions I have
- See which features I can access

**As an Existing User**, I want to:
- Stay logged in across sessions
- Add additional characters (alts) to my account
- Switch between my characters
- See my role assignments

**As an Admin**, I want to:
- Control who can access the platform (org gating)
- Assign roles to users
- Revoke access if needed

### Acceptance Criteria

- ✅ EVE SSO OAuth flow functional
- ❌ Session cookies set after OAuth callback (MISSING)
- ❌ Redis session storage implemented (MISSING)
- ❌ ESI tokens encrypted and stored (MISSING)
- ❌ Token refresh mechanism (MISSING)
- ✅ Organization gating rules applied
- ✅ Feature-scoped RBAC implemented
- ❌ Multi-character linking functional (INCOMPLETE)

### Critical Implementation Gaps

**⚠️ HIGH PRIORITY - BLOCKING PRODUCTION**:

1. **Session Cookie Not Set**: OAuth callback doesn't set `battlescope_session` cookie
2. **Session Storage Missing**: Redis session management not implemented
3. **Token Storage Missing**: ESI tokens not encrypted and stored in database
4. **Token Refresh Missing**: No automatic token refresh mechanism
5. **Multi-Character Incomplete**: Character linking flow not functional

**Impact**: Users can authenticate but cannot stay logged in; ESI API calls on behalf of users are not possible.

**Reference**: See `/docs/authenication-authorization-spec/session-management-spec.md` for complete requirements.

### Technical Components

**Database Tables**:
- `accounts`: User accounts
- `characters`: Linked EVE characters with ESI tokens
- `features`: Feature definitions
- `roles`: Role hierarchy
- `account_feature_roles`: Role assignments
- `auth_config`: Organization gating rules
- `audit_logs`: Authentication/authorization events

**Backend Services**:
- Auth routes: `/auth/login`, `/auth/callback`, `/auth/logout`
- Auth middleware: Session validation
- Authorization service: Feature-scoped permission checks

### Future Enhancements

- [ ] Complete session management implementation
- [ ] Implement token encryption/storage
- [ ] Build multi-character linking UI
- [ ] Add token refresh mechanism
- [ ] Background character verification
- [ ] 2FA (via EVE SSO)

---

## 6. User Profile

**Status**: ⚠️ Partially Implemented
**Reference**: `/docs/user-profile-spec/README.md`

### Description

Self-service account management for users to view and manage their characters, roles, and account information.

### User Stories

**As a User**, I want to:
- View all my linked characters
- See my characters organized by corporation/alliance
- Understand my feature roles and permissions
- Change my primary character
- Add new characters via EVE SSO
- Remove characters I no longer use
- See ESI token expiration status

### Acceptance Criteria

- ⚠️ View account details (partial)
- ⚠️ View all characters grouped by alliance/corp (UI needed)
- ⚠️ See feature roles and permissions (UI needed)
- ❌ Change primary character (not implemented)
- ❌ Add new characters (linking flow incomplete)
- ❌ Remove characters (not implemented)
- ❌ View ESI token status (not implemented)

### Technical Components

**Frontend Routes**:
- `/profile`: User profile page
- `/profile/characters`: Character management
- `/profile/permissions`: Role and permission view

**Backend API**:
- `GET /me`: Get current user account
- `GET /me/characters`: Get all linked characters
- `POST /me/characters/link`: Initiate character linking
- `DELETE /me/characters/:id`: Unlink character
- `PUT /me/primary-character`: Set primary character

### Implementation Status

**✅ Completed**:
- Backend API for fetching account data
- Database schema for characters

**⚠️ In Progress**:
- Frontend profile page UI

**❌ Not Started**:
- Character management UI
- Character linking workflow
- Primary character selection
- Token status display

---

## Feature Access Matrix

| Feature | User Role | FC Role | Director Role | Admin Role | SuperAdmin |
|---------|-----------|---------|---------------|------------|------------|
| **Battle Reports** | View | View | View | View + Config | Full |
| **Battle Intel** | View | View | View | View + Config | Full |
| **Search** | Use | Use | Use | Use | Full |
| **Admin Panel** | - | - | - | - | Full |
| **User Profile** | Own | Own | Own | Own | Full |

---

## Configuration Summary

### Battle Reports Configuration

**Ingestion Filters**:
- Minimum pilots: 5 (configurable)
- Tracked alliances/corps: Whitelist (configurable)
- Tracked systems: Optional whitelist
- Space types: K/J/Pochven (toggleable)
- Security levels: High/Low/Null (toggleable)

**Processing Settings**:
- Enrichment throttle: 1000ms (configurable)
- Clustering time window: 30 minutes (configurable)
- Clustering max gap: 15 minutes (configurable)
- Minimum kills per battle: 2 (configurable)

### Battle Intel Configuration

**Cache Settings**:
- Entity stats TTL: 3600s
- Global summary TTL: 300s
- Opponent analysis TTL: 3600s
- Ship composition TTL: 7200s
- Cache warming: Enabled
- Warming interval: 1800s
- Top entities to warm: 50

**Display Settings**:
- Default time range: 30 days
- Minimum battles to show: 3
- Top opponents list size: 10
- Top ships list size: 15
- ISK format: Abbreviated (3.6B)

### Search Configuration

**Typesense Settings**:
- Typo tolerance: 2 typos max
- Prefix search: Enabled
- Sampling: 100% (dev), 10% (prod)

---

## References

- [Battle Reports Feature Spec](/docs/features/battle-reports/feature-spec.md)
- [Battle Intel Feature Spec](/docs/features/battle-intel/feature-spec.md)
- [Search Feature Spec](/docs/features/search/feature-spec.md)
- [Admin Panel Spec](/docs/features/admin-panel/feature-spec.md)
- [Authentication Spec](/docs/authenication-authorization-spec/README.md)
- [User Profile Spec](/docs/user-profile-spec/README.md)
