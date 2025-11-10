# Admin Panel Specification

_Created: 2025-11-09_
_Status: Draft_

---

## 1. Overview

The Admin Panel is a privileged interface for **SuperAdmins** to manage users, roles, features, system configuration, and monitor platform activity across the entire BattleScope application.

### Purpose

Provide SuperAdmins with centralized tools to:
- Manage user accounts and access control
- Configure feature-scoped RBAC assignments
- Monitor system activity through audit logs
- Configure organization gating rules
- Manage feature settings and availability
- View platform analytics and health metrics

### Access Control

**Access Level**: SuperAdmin only (`is_super_admin = true`)

**Authorization Model**: See [Authentication & Authorization Spec](../authenication-authorization-spec/README.md)

- SuperAdmins bypass all feature-scoped role checks
- Access to admin panel is gated by `is_super_admin` flag on account
- All admin actions are logged to `audit_logs` table
- Admin panel is accessible at `/admin` route with dedicated UI

---

## 2. User Management

### 2.1 Account Directory

**Purpose**: Browse, search, and manage all user accounts in the system.

**Features**:
- Paginated list of all accounts (20 per page default)
- Search by:
  - Display name
  - Email
  - EVE character name
  - Corporation name
  - Alliance name
- Filter by:
  - Account status (active, blocked, deleted)
  - SuperAdmin status
  - Feature role (show users with specific role in any feature)
  - Corporation/Alliance membership
  - Last login date range
  - Account creation date range

**Account List Display**:
```typescript
interface AccountListItem {
  id: string;
  displayName: string;
  email: string | null;
  primaryCharacter: {
    eveCharacterId: string;
    eveCharacterName: string;
    portraitUrl: string;
    corpName: string;
    allianceName: string | null;
  } | null;
  isBlocked: boolean;
  isSuperAdmin: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  characterCount: number; // Number of linked characters
  rolesSummary: string; // e.g., "Admin (2 features), Director (1 feature)"
}
```

**UI Components**:
- Data table with sortable columns
- Quick action buttons per row:
  - View Details
  - Edit Roles
  - Block/Unblock
  - View Audit Log
- Bulk actions:
  - Export to CSV
  - Block selected accounts
  - Assign role to selected accounts

### 2.2 View User Page

**Purpose**: Dedicated page showing comprehensive user information including account summary, all linked characters (alts), their corporations and alliances, roles, and activity history.

**Route**: `/admin/accounts/:id`

**Layout**: Full-page view with tabbed sections

---

#### User Summary (Header Section)

Prominent header showing at-a-glance user information:

**Display Elements**:
- **Primary Character Portrait**: Large portrait (128x128px) of primary character
- **Account Display Name**: Large, editable heading
- **Primary Character Info**: EVE character name, corporation, alliance
- **Status Badges**: Visual badges for SuperAdmin, Blocked, Active/Inactive
- **Account Metadata**:
  - Account ID (copyable UUID with copy button)
  - Email address (editable, nullable)
  - Account created date
  - Last login date and time
  - Total characters linked (count)
- **Quick Action Buttons**:
  - Promote/Demote SuperAdmin
  - Block/Unblock Account
  - Delete Account
  - View Full Audit Log

**Visual Example**:
```
┌─────────────────────────────────────────────────────────────────┐
│  [Portrait]  Commander Smith                    [SuperAdmin] [Active] │
│              Caldari State • Goonswarm Federation                │
│                                                                   │
│  Account ID: 550e8400-e29b... [Copy]   Email: smith@example.com │
│  Created: 2024-01-15  •  Last Login: 2 hours ago  •  5 Alts    │
│                                                                   │
│  [Promote SuperAdmin] [Block Account] [Delete] [View Audit Log] │
└─────────────────────────────────────────────────────────────────┘
```

---

#### Characters & Corporations Tab

**Purpose**: Display all linked EVE characters (alts) with their corporation and alliance affiliations.

**Display Format**: Character cards grouped by corporation/alliance

```typescript
interface CharacterDetail {
  id: string;
  eveCharacterId: string;
  eveCharacterName: string;
  portraitUrl: string;
  corpId: string;
  corpName: string;
  corpTicker: string;
  allianceId: string | null;
  allianceName: string | null;
  allianceTicker: string | null;
  isPrimary: boolean;
  scopes: string[];
  tokenExpiresAt: Date;
  tokenStatus: 'valid' | 'expiring' | 'expired';
  lastVerifiedAt: Date;
  createdAt: Date;
}
```

**Visual Layout**:

Group characters by corporation, with alliance header if applicable:

```
┌─ Goonswarm Federation ─────────────────────────────────────┐
│                                                              │
│  ┌─ Amok. [AMOK] ─────────────────────────────────────┐  │
│  │                                                       │  │
│  │  [Portrait] Commander Smith (Primary)                │  │
│  │             Caldari State                            │  │
│  │             Token: Valid • Expires in 18 days        │  │
│  │             Scopes: publicData, killmails            │  │
│  │             [Set Primary] [Unlink] [Refresh Token]   │  │
│  │                                                       │  │
│  │  [Portrait] Alt Smith Two                            │  │
│  │             Caldari State                            │  │
│  │             Token: Expiring Soon • Expires in 2 days │  │
│  │             Scopes: publicData                       │  │
│  │             [Set Primary] [Unlink] [Refresh Token]   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ Karmafleet [KFLT] ────────────────────────────────┐  │
│  │                                                       │  │
│  │  [Portrait] Alt Smith Three                          │  │
│  │             Caldari State                            │  │
│  │             Token: Valid • Expires in 25 days        │  │
│  │             Scopes: publicData, read_corporation     │  │
│  │             [Set Primary] [Unlink] [Refresh Token]   │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

┌─ No Alliance ──────────────────────────────────────────────┐
│                                                              │
│  ┌─ Perkone [PRKN] ───────────────────────────────────┐  │
│  │                                                       │  │
│  │  [Portrait] Alt Smith NPC Corp                       │  │
│  │             Caldari State                            │  │
│  │             Token: Valid • Expires in 10 days        │  │
│  │             Scopes: publicData                       │  │
│  │             [Set Primary] [Unlink] [Refresh Token]   │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Corporation/Alliance Summary**:
- Show total character count per corporation
- Show alliance ticker and name above corp groups
- Highlight primary character with badge
- Color-code token status (green=valid, yellow=expiring, red=expired)

**Character Card Actions**:
- **Set as Primary**: Changes account's primary character (only if not already primary)
- **Unlink Character**: Removes character from account (requires confirmation)
- **Refresh Token**: Manually trigger ESI token refresh
- **View Scopes**: Modal showing all ESI scopes granted
- **Character Details**: Link to detailed character view (optional future feature)

**Corporation/Alliance Information**:
Each corporation group header shows:
- Corporation name and ticker
- Alliance name and ticker (if applicable)
- Corporation logo/icon (optional)
- Character count in this corp: "3 characters"

#### Feature Roles
Table showing role assignments across all features:
```typescript
interface FeatureRoleAssignment {
  featureId: string;
  featureKey: string;
  featureName: string;
  roleId: string;
  roleKey: 'user' | 'fc' | 'director' | 'admin';
  roleName: string;
  roleRank: number;
  grantedBy: {
    id: string;
    displayName: string;
  } | null;
  grantedAt: Date;
}
```

Actions:
- Assign New Role (feature + role selector)
- Change Role (dropdown)
- Remove Role (with confirmation)

#### Activity & Audit Log
Recent activity for this account:
- Login events
- Role changes
- Character linking/unlinking
- Settings changes
- Failed authorization attempts

Filterable by action type and date range.

### 2.3 Block/Unblock Accounts

**Purpose**: Prevent or restore account access.

**Blocking an Account**:
- Requires confirmation dialog with reason input
- Sets `is_blocked = true` on account
- Invalidates all active sessions immediately
- Creates audit log entry with reason
- Account cannot authenticate until unblocked
- Blocked accounts shown with red badge in account list

**Unblocking an Account**:
- Requires confirmation
- Sets `is_blocked = false`
- Creates audit log entry
- User can log in again on next authentication

**Implementation**:
```typescript
// Backend: packages/database/src/repositories/account-repository.ts
interface BlockAccountParams {
  accountId: string;
  reason: string;
  blockedBy: string; // SuperAdmin account ID
}

async blockAccount(params: BlockAccountParams): Promise<void>;
async unblockAccount(accountId: string, unblockedBy: string): Promise<void>;
```

### 2.4 SuperAdmin Promotion/Demotion

**Purpose**: Grant or revoke global SuperAdmin privileges.

**Promoting to SuperAdmin**:
- Sets `is_super_admin = true`
- Requires confirmation with warning about elevated privileges
- Creates audit log entry
- SuperAdmin has unrestricted access to entire platform

**Demoting from SuperAdmin**:
- Sets `is_super_admin = false`
- Requires confirmation
- Cannot demote yourself (safety check)
- Creates audit log entry
- User retains feature-scoped roles but loses global admin access

**Safety Rules**:
- Cannot demote the last SuperAdmin (at least one must remain)
- Confirmation dialog shows impact of privilege change
- All SuperAdmin changes are prominently logged

---

## 3. Role Management

### 3.1 Feature Role Assignments

**Purpose**: Manage feature-scoped RBAC across the platform.

**Bulk Role Assignment**:
- Select multiple accounts
- Choose feature (battle-reports, battle-intel, etc.)
- Assign role (user, fc, director, admin)
- Confirmation shows impact preview

**Role Assignment Matrix View**:
Visual matrix showing which accounts have which roles in which features:

```
                      | Battle Reports | Battle Intel |
----------------------|----------------|--------------|
User A (Corp ABC)     | Admin          | Director     |
User B (Corp XYZ)     | FC             | User         |
User C (Corp ABC)     | Director       | -            |
```

Actions:
- Click cell to edit role for that user/feature combination
- Filter by corporation/alliance to manage groups
- Export matrix to CSV

### 3.2 Role Templates

**Purpose**: Quickly assign standard role combinations.

**Template Examples**:
- **Fleet Commander Package**: FC role in Battle Reports + User role in Battle Intel
- **Leadership Package**: Director role in all features
- **Read-Only Access**: User role in all features

**Template Management**:
- Create custom templates
- Name and describe template
- Select features and roles for each
- Apply template to one or many accounts
- Templates stored in `feature_settings` as admin configuration

---

## 4. Feature Management

### 4.1 Feature Configuration

**Purpose**: Manage features available in the platform.

**Feature List**:
Display all features with:
- Feature key (e.g., `battle-reports`)
- Feature name
- Description
- Enabled/Disabled status
- User count (accounts with access)
- Settings count

**Feature Detail View**:

#### Basic Information
- Feature key (read-only)
- Name (editable)
- Description (editable)
- Status toggle (enabled/disabled)

#### Role Distribution
Chart/table showing role distribution:
```typescript
interface FeatureRoleDistribution {
  roleKey: string;
  roleName: string;
  accountCount: number;
  percentage: number;
}

// Example:
// User: 150 accounts (75%)
// FC: 30 accounts (15%)
// Director: 15 accounts (7.5%)
// Admin: 5 accounts (2.5%)
```

#### Feature Configuration Pages

Each feature has its own dedicated configuration page accessible from the feature detail view:

**Available Feature Configuration Pages**:

- **Battle Reports** (`/admin/features/battle-reports/config`)
  - Ingestion filters:
    - Minimum pilot threshold
    - Tracked entities (alliances, corporations, characters)
    - Specific systems whitelist
    - Space types (K-Space, J-Space, Pochven)
    - K-Space security levels (high-sec, low-sec, null-sec)
  - Enrichment settings (auto-enrichment, API throttle)
  - Clustering settings (time windows, minimum kills per battle)
  - Current ingestion statistics
  - ⚠️ **Note**: This is the PRIMARY place where killmail data collection is configured
  - Changes here affect what data is available for Battle Intel analytics

- **Battle Intel** (`/admin/features/battle-intel/config`)
  - Cache settings (TTL for various stat types, cache warming)
  - Display settings (default time ranges, list sizes, ISK format)
  - Data availability statistics
  - 📝 **Note**: References Battle Reports configuration for data collection
  - Only manages caching and display preferences, NOT data ingestion

- **Other Features**: Similar dedicated configuration pages as needed

**Feature Settings (Legacy/Simple Features)**:
For features without dedicated configuration pages, display and edit settings from `feature_settings` table:
```typescript
interface FeatureSetting {
  id: string;
  key: string;
  value: unknown; // JSONB
  updatedBy: {
    id: string;
    displayName: string;
  } | null;
  updatedAt: Date;
}
```

Settings editor with:
- Key-value pairs
- JSON editor for complex values
- Validation based on feature requirements
- Change history (who changed what when)

**Configuration Page Links**:
Feature detail view shows a prominent link to the feature's configuration page:
```
┌─────────────────────────────────────────────────────────────┐
│ Battle Reports Feature                                       │
├─────────────────────────────────────────────────────────────┤
│ Status: Enabled                                              │
│ Users: 150 accounts                                          │
│                                                              │
│ [⚙️  Configure Feature Settings →]                          │
│                                                              │
│ ℹ️  This feature controls killmail ingestion and battle     │
│    clustering. Configuration affects Battle Intel analytics.│
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Create New Feature

**Purpose**: Add new product features to the platform.

**Form Fields**:
- Feature key (slug format, immutable after creation)
- Feature name
- Description
- Initial settings (JSON object, optional)

**On Creation**:
- Inserts record into `features` table
- Creates audit log entry
- Feature is immediately available for role assignment
- No users have access by default (must assign roles)

---

## 5. Organization Gating

### 5.1 Corp/Alliance Configuration

**Purpose**: Configure which EVE Online corporations and alliances can access BattleScope.

**Reference**: `auth_config` table (singleton)

**Configuration UI**:

#### Membership Requirement
Toggle: `require_membership`
- **Enabled**: Only characters from allowed corps/alliances can authenticate
- **Disabled**: Any EVE character can authenticate (open access)

#### Allowed Corporations
- List of corporation IDs that are permitted access
- Add corporation by:
  - Corporation ID (bigint)
  - Corporation name search (ESI lookup)
- Shows corporation name + ticker (cached from ESI)
- Remove corporation from allow list

#### Allowed Alliances
- List of alliance IDs that are permitted access
- Add alliance by:
  - Alliance ID (bigint)
  - Alliance name search (ESI lookup)
- Shows alliance name + ticker
- Remove alliance from allow list

#### Denied Corporations
- List of corporation IDs explicitly denied access
- Takes precedence over allowed alliances (if corp is in denied list but alliance is allowed, corp is still denied)
- Add/remove corporations

#### Denied Alliances
- List of alliance IDs explicitly denied access
- Add/remove alliances

**Validation Logic**:
See [Authentication & Authorization Spec](../authenication-authorization-spec/README.md#5-authentication-eve-online-sso) for org gating rules:
1. Check denied corp list → reject if found
2. Check denied alliance list → reject if found
3. If `require_membership = false` → allow
4. Check allowed corp list → allow if found
5. Check allowed alliance list → allow if found
6. Otherwise → reject

**UI Components**:
- Corp/Alliance search with autocomplete (ESI API)
- Drag-and-drop to reorder (visual only, order doesn't affect logic)
- Preview mode: "Check if character can access" tool
  - Enter character ID
  - Shows allowed/denied with reason

### 5.2 Org Gating Audit

**Purpose**: Track changes to organization access rules.

**Audit Log Display**:
- When rule was added/removed
- Who made the change (SuperAdmin)
- Corp/alliance affected
- Type of change (allowed, denied, removed)

---

## 6. Audit Logs

### 6.1 Audit Log Viewer

**Purpose**: Monitor all authentication and authorization events across the platform.

**Reference**: `audit_logs` table

**Display Features**:
- Paginated log entries (50 per page default)
- Real-time updates (WebSocket or polling)
- Filter by:
  - Action type (login, logout, role change, settings update, etc.)
  - Actor (who performed the action)
  - Target type (account, character, feature, etc.)
  - Date range
  - Target ID (specific account/character)
- Search by metadata (JSONB search)
- Export filtered logs to CSV

**Log Entry Display**:
```typescript
interface AuditLogEntry {
  id: string;
  actorAccountId: string | null;
  actorDisplayName: string | null; // Null for system actions
  action: string; // e.g., 'account.login', 'role.granted', 'settings.updated'
  targetType: string; // 'account', 'character', 'feature', 'auth_config'
  targetId: string;
  targetDisplayName?: string; // Resolved from target ID
  metadata: Record<string, unknown>; // Additional context
  createdAt: Date;
}
```

**Action Types** (see spec for full list):
- `account.login` - User logged in
- `account.logout` - User logged out
- `account.blocked` - Account was blocked
- `account.unblocked` - Account was unblocked
- `account.deleted` - Account was deleted
- `account.superadmin.promoted` - User promoted to SuperAdmin
- `account.superadmin.demoted` - User demoted from SuperAdmin
- `character.linked` - Character linked to account
- `character.unlinked` - Character unlinked from account
- `role.granted` - Feature role assigned
- `role.revoked` - Feature role removed
- `role.changed` - Feature role changed
- `settings.updated` - Feature settings modified
- `auth_config.updated` - Org gating rules changed
- `feature.created` - New feature created
- `authorization.denied` - Access denied (security event)

**Detailed View**:
Click log entry to see full metadata with formatted JSON.

### 6.2 Security Monitoring

**Purpose**: Identify suspicious activity and security events.

**Alert Triggers**:
- High number of failed logins from single account (possible brute force)
- Multiple authorization denials in short period
- SuperAdmin privilege changes
- Mass role changes
- Org gating rule changes

**Security Dashboard**:
- Failed login attempts (last 24h, 7d, 30d)
- Authorization denial rate
- Blocked accounts count
- Recent SuperAdmin actions
- Unusual activity detection (ML-based in future)

**Export & Compliance**:
- Export audit logs for compliance review
- GDPR data export per account
- Retention policy: 90 days default (configurable)

---

## 7. Platform Analytics

### 7.1 User Activity Metrics

**Purpose**: Monitor platform usage and engagement.

**Metrics Dashboard**:

#### Active Users
- Daily Active Users (DAU)
- Weekly Active Users (WAU)
- Monthly Active Users (MAU)
- Chart showing trend over time

#### Authentication Stats
- Total accounts
- Total linked characters
- Average characters per account
- Login success/failure rate
- Sessions created per day

#### Feature Adoption
Per feature:
- Total users with access
- Active users (used feature in last 7d)
- Role distribution
- Most active users (leaderboard)

#### Corporation/Alliance Breakdown
- Top corporations by user count
- Top alliances by user count
- Access requests denied (org gating)

### 7.2 System Health

**Purpose**: Monitor auth system performance and reliability.

**Health Metrics**:

#### Session Management
- Active sessions count
- Average session duration
- Session creation rate
- Session validation latency (p50, p95, p99)

#### Authorization Performance
- Authorization cache hit rate
- Authorization decision latency
- Cache invalidations per hour

#### ESI Token Health
- Tokens expiring soon (next 24h)
- Token refresh success rate
- Failed token refreshes (requires re-auth)

#### Database & Redis
- Query latency (auth-related queries)
- Redis connection pool status
- Database connection pool status

**Alerts**:
- Session validation latency > 100ms
- Authorization cache hit rate < 80%
- Token refresh failure rate > 5%
- Redis connection failures

---

## 8. API Surface

### 8.1 Admin API Routes

All routes require `authMiddleware` + `requireSuperAdmin` middleware.

```typescript
// Prefix: /api/admin
app.register(registerAdminRoutes, { prefix: '/api/admin' });
```

#### User Management

```typescript
// List accounts
GET /admin/accounts
Query: { query?, status?, role?, limit?, offset? }
Response: { accounts: Account[], total: number }

// Get account details (View User Page data)
GET /admin/accounts/:id
Response: AccountDetail

// Response structure includes full user summary with all characters grouped by corp/alliance
interface AccountDetail {
  account: {
    id: string;
    displayName: string;
    email: string | null;
    primaryCharacterId: string | null;
    isBlocked: boolean;
    isSuperAdmin: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  primaryCharacter: {
    id: string;
    eveCharacterId: string;
    eveCharacterName: string;
    portraitUrl: string;
    corpId: string;
    corpName: string;
    corpTicker: string;
    allianceId: string | null;
    allianceName: string | null;
    allianceTicker: string | null;
  } | null;
  charactersGrouped: {
    allianceId: string | null;
    allianceName: string | null;
    allianceTicker: string | null;
    corporations: {
      corpId: string;
      corpName: string;
      corpTicker: string;
      characters: CharacterDetail[];
    }[];
  }[];
  roles: FeatureRoleAssignment[];
  recentActivity: AuditLogEntry[];
  stats: {
    totalCharacters: number;
    totalFeatureRoles: number;
    totalLogins: number;
  };
}

// Example response showing characters grouped by alliance then corporation
{
  "account": { "id": "550e8400...", "displayName": "Commander Smith", ... },
  "primaryCharacter": { "eveCharacterName": "Commander Smith", ... },
  "charactersGrouped": [
    {
      "allianceId": "99000001",
      "allianceName": "Goonswarm Federation",
      "allianceTicker": "CONDI",
      "corporations": [
        {
          "corpId": "98000001",
          "corpName": "Amok.",
          "corpTicker": "AMOK",
          "characters": [
            { "eveCharacterName": "Commander Smith", "isPrimary": true, ... },
            { "eveCharacterName": "Alt Smith Two", "isPrimary": false, ... }
          ]
        },
        {
          "corpId": "98000002",
          "corpName": "Karmafleet",
          "corpTicker": "KFLT",
          "characters": [
            { "eveCharacterName": "Alt Smith Three", "isPrimary": false, ... }
          ]
        }
      ]
    },
    {
      "allianceId": null,
      "allianceName": null,
      "allianceTicker": null,
      "corporations": [
        {
          "corpId": "1000008",
          "corpName": "Perkone",
          "corpTicker": "PRKN",
          "characters": [
            { "eveCharacterName": "Alt Smith NPC Corp", "isPrimary": false, ... }
          ]
        }
      ]
    }
  ],
  "roles": [...],
  "recentActivity": [...],
  "stats": { "totalCharacters": 4, "totalFeatureRoles": 2, "totalLogins": 42 }
}

// Update account
PATCH /admin/accounts/:id
Body: { displayName?, email? }
Response: Account

// Block account
POST /admin/accounts/:id/block
Body: { reason: string }
Response: 204 No Content

// Unblock account
POST /admin/accounts/:id/unblock
Response: 204 No Content

// Promote to SuperAdmin
POST /admin/accounts/:id/superadmin
Response: 204 No Content

// Demote from SuperAdmin
DELETE /admin/accounts/:id/superadmin
Response: 204 No Content

// Delete account (soft delete)
DELETE /admin/accounts/:id
Response: 204 No Content
```

#### Role Management

```typescript
// Assign feature role
PUT /admin/accounts/:id/roles
Body: { featureKey: string, roleKey: string }
Response: 204 No Content

// Remove feature role
DELETE /admin/accounts/:id/roles/:featureKey
Response: 204 No Content

// Get role matrix
GET /admin/roles/matrix
Query: { featureKey?, corpId?, allianceId? }
Response: RoleMatrix

// Bulk assign roles
POST /admin/roles/bulk-assign
Body: { accountIds: string[], featureKey: string, roleKey: string }
Response: { updated: number }
```

#### Feature Management

```typescript
// List features
GET /admin/features
Response: Feature[]

// Get feature details
GET /admin/features/:key
Response: FeatureDetail

// Create feature
POST /admin/features
Body: { key: string, name: string, description: string }
Response: Feature

// Update feature
PATCH /admin/features/:key
Body: { name?, description?, enabled? }
Response: Feature

// Get feature settings
GET /admin/features/:key/settings
Response: Record<string, unknown>

// Update feature settings
PUT /admin/features/:key/settings
Body: Record<string, unknown>
Response: 204 No Content

// Get feature role distribution
GET /admin/features/:key/role-distribution
Response: FeatureRoleDistribution[]

// Get feature configuration
GET /admin/features/:key/config
Response: Record<string, unknown>

// Update feature configuration
PUT /admin/features/:key/config
Body: {
  configKey: string,     // e.g., 'ingestion', 'cache', 'display'
  configValue: Record<string, unknown>
}
Response: 204 No Content

// Examples:

// Battle Reports ingestion config
PUT /admin/features/battle-reports/config
Body: {
  configKey: 'ingestion',
  configValue: {
    minPilots: 5,
    trackedAlliances: [99001234, 99005678],
    trackedCorporations: [],
    trackedCharacters: [],
    ignoreUnlisted: false,
    trackedSystems: [],
    spaceTypes: ['kspace', 'jspace', 'pochven'],
    kspaceSecurityLevels: ['lowsec', 'nullsec'],
    enrichmentThrottle: 1000
  }
}

// Battle Intel cache config
PUT /admin/features/battle-intel/config
Body: {
  configKey: 'cache',
  configValue: {
    entityStatsTTL: 3600,
    globalSummaryTTL: 300,
    opponentAnalysisTTL: 3600,
    shipCompositionTTL: 7200,
    warmingEnabled: true,
    warmingInterval: 1800,
    topEntitiesToWarm: 50
  }
}
```

#### Organization Gating

```typescript
// Get auth config
GET /admin/auth-config
Response: AuthConfig

// Update auth config
PUT /admin/auth-config
Body: {
  requireMembership?: boolean,
  allowedCorpIds?: bigint[],
  allowedAllianceIds?: bigint[],
  deniedCorpIds?: bigint[],
  deniedAllianceIds?: bigint[]
}
Response: AuthConfig

// Check character access (preview)
POST /admin/auth-config/check
Body: { eveCharacterId: string }
Response: { allowed: boolean, reason: string }
```

#### Audit Logs

```typescript
// List audit logs
GET /admin/audit-logs
Query: { action?, actorAccountId?, targetType?, targetId?, startDate?, endDate?, limit?, offset? }
Response: { logs: AuditLogEntry[], total: number }

// Get audit log detail
GET /admin/audit-logs/:id
Response: AuditLogEntry

// Export audit logs
GET /admin/audit-logs/export
Query: { action?, startDate?, endDate?, format: 'csv' | 'json' }
Response: File download
```

#### Analytics

```typescript
// Get user activity metrics
GET /admin/analytics/user-activity
Query: { startDate?, endDate? }
Response: UserActivityMetrics

// Get feature adoption metrics
GET /admin/analytics/feature-adoption
Query: { featureKey? }
Response: FeatureAdoptionMetrics

// Get system health metrics
GET /admin/analytics/system-health
Response: SystemHealthMetrics
```

### 8.2 Middleware

```typescript
// backend/api/src/middleware/admin.ts

import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Requires authenticated user to be a SuperAdmin
 */
export const requireSuperAdmin = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  if (!request.account?.isSuperAdmin) {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'SuperAdmin access required',
    });
  }
};
```

---

## 9. Frontend Implementation

### 9.1 Admin Panel Layout

**Route**: `/admin`

**Access Control**:
```typescript
// frontend/src/modules/admin/AdminLayout.tsx

export const AdminLayout: FC = () => {
  const { user } = useAuth();

  if (!user?.isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
};
```

**Sidebar Navigation**:
- Dashboard (overview)
- User Management
  - Accounts
  - Roles
- Feature Management
- Organization Gating
- Audit Logs
- Analytics
- System Health

### 9.2 Page Components

**Admin Dashboard** (`/admin`)
- Quick stats cards (total users, active sessions, features)
- Recent activity feed (audit logs)
- System health status
- Shortcuts to common tasks

**Account Management** (`/admin/accounts`)
- Account list with search/filter
- Account detail modal
- Bulk action toolbar

**Role Management** (`/admin/roles`)
- Role matrix view
- Bulk assignment form
- Role templates

**Feature Management** (`/admin/features`)
- Feature list
- Feature detail with settings editor
- Create feature form

**Organization Gating** (`/admin/org-gating`)
- Corp/alliance allow/deny lists
- Access preview tool
- Audit log for gating changes

**Audit Logs** (`/admin/audit-logs`)
- Log viewer with filters
- Log detail modal
- Export controls

**Analytics** (`/admin/analytics`)
- User activity charts
- Feature adoption metrics
- System health dashboard

### 9.3 Shared Components

**Account Card**
Reusable card showing account summary with portrait, name, corp/alliance, roles

**Character List**
Reusable list of characters with actions

**Role Badge**
Visual badge for role display (color-coded by rank)

**Audit Log Entry**
Formatted audit log entry with icons and metadata

**Confirmation Dialog**
Reusable confirmation for destructive actions (block, delete, etc.)

---

## 10. Security Considerations

### 10.1 Access Control

- All admin routes require `authMiddleware` + `requireSuperAdmin`
- Frontend hides admin UI for non-SuperAdmins
- API returns 403 for unauthorized access attempts
- All admin actions are audited

### 10.2 Audit Trail

- Every admin action creates an audit log entry
- Actor ID (SuperAdmin account) always recorded
- Metadata includes relevant context (reason, changes, etc.)
- Audit logs are immutable (no DELETE, only INSERT)

### 10.3 Rate Limiting

- Admin routes have higher rate limits than public routes
- Bulk operations are paginated/throttled to prevent abuse
- Export operations are rate-limited per user

### 10.4 Input Validation

- All inputs validated with Zod schemas
- Corp/Alliance IDs validated against ESI
- Role assignments validated against existing features/roles
- Settings updates validated per feature schema

---

## 11. Implementation Plan

### Phase 1: Core Admin UI (Week 1-2)

- [ ] Create admin layout and routing
- [ ] Implement `requireSuperAdmin` middleware
- [ ] Build account list view with search/filter
- [ ] **Build View User Page** (`/admin/accounts/:id`)
  - [ ] Backend: Create `AccountRepository.getDetailWithCharactersGrouped()` method
    - Query to fetch account, all characters, and group by alliance/corporation
    - Include character token status and scopes
    - Include role assignments and recent activity
  - [ ] Frontend: User summary header component
  - [ ] Frontend: Characters grouped by corp/alliance display
  - [ ] Frontend: Character action buttons (set primary, unlink, refresh token)
- [ ] Add block/unblock functionality
- [ ] Create audit log viewer

### Phase 2: Role Management (Week 3)

- [ ] Build role assignment UI
- [ ] Implement role matrix view
- [ ] Add bulk role assignment
- [ ] Create role templates

### Phase 3: Feature & Org Management (Week 4)

- [ ] Build feature management UI
- [ ] Implement feature settings editor
- [ ] Create org gating configuration UI
- [ ] Add access preview tool

### Phase 4: Analytics & Monitoring (Week 5)

- [ ] Build analytics dashboard
- [ ] Implement system health monitoring
- [ ] Add security alerts
- [ ] Create export functionality

### Phase 5: Polish & Testing (Week 6)

- [ ] Add loading states and error handling
- [ ] Implement optimistic updates
- [ ] Write integration tests
- [ ] Performance optimization
- [ ] Documentation

---

## 12. Open Questions

1. **GDPR Compliance**: Should we add a "Data Export" feature per account for GDPR compliance?
2. **Account Deletion**: Should deletion be soft (flag) or hard (actual DELETE)? Current spec uses soft delete.
3. **Role Templates**: Should templates be shared across all SuperAdmins or per-admin?
4. **Audit Log Retention**: Default is 90 days - should this be configurable? Should old logs be archived?
5. **Multi-SuperAdmin Conflicts**: How to handle concurrent edits by multiple SuperAdmins?
6. **Character Auto-Verification**: Should we auto-refresh character corp/alliance data periodically?

---

## 13. Future Enhancements

### Phase 2 Features (Post-MVP)

- **Impersonation Mode**: SuperAdmin can view platform as another user (for support)
- **Scheduled Role Changes**: Assign roles with future effective date
- **Role Approval Workflow**: Director requests admin role, SuperAdmin approves
- **Advanced Analytics**: ML-based anomaly detection, cohort analysis
- **API Keys Management**: Create API keys for service accounts
- **Webhook Configuration**: Configure webhooks for auth events
- **Custom Audit Alerts**: Create custom alert rules based on audit log patterns
- **Bulk User Import**: CSV import for initial user setup
- **Corp/Alliance Sync**: Auto-update corp/alliance data from ESI

---

## 14. References

- [Authentication & Authorization Spec](../authenication-authorization-spec/README.md)
- [Session Management Spec](../authenication-authorization-spec/session-management-spec.md)
- [Auth Package README](../../packages/auth/README.md)
- [Database Migration 0007: Auth Tables](../../packages/database/migrations/0007_auth_tables.ts)

---

## Summary

This specification defines a comprehensive Admin Panel for BattleScope that enables SuperAdmins to:
- Manage the complete user lifecycle (accounts, characters, roles)
- Configure platform-wide access control (features, org gating)
- Monitor security and compliance (audit logs, analytics)
- Maintain system health (performance metrics, alerts)

The admin panel integrates seamlessly with the existing authentication and authorization system defined in the auth spec, leveraging the established database schema, RBAC model, and API patterns.

**Next Steps**:
1. Review spec with team
2. Create frontend route structure in `frontend/src/modules/admin/`
3. Implement admin API routes in `backend/api/src/routes/admin.ts`
4. Build reusable admin UI components
5. Add SuperAdmin middleware
6. Implement audit logging for all admin actions
7. Create analytics/metrics collection
8. Write integration tests
