# BattleScope Platform Specification (v3)

**Last Updated**: 2025-11-07

---

## 1. Product Overview

**BattleScope** is a modular data intelligence platform for *EVE Online* that provides two core features:

1. **Battle Reports**: Reconstructs and classifies battles by clustering related killmails from zKillboard
2. **Battle Intel**: Provides statistical analysis and intelligence about combat activities, participants, and trends

The platform is designed with:
- **Feature-based architecture**: Business logic separated at package level
- **Permission-based access**: Users can have access to one or both features independently
- **Reference-first storage**: Minimal data footprint by storing only essential metadata
- **EVE Online SSO authentication**: Secure multi-character support with feature-scoped RBAC

---

## 2. Platform Objectives

| Goal | Description |
|------|--------------|
| **1. Modular Features** | Separate business logic for Battle Reports and Battle Intel at the package level |
| **2. Feature-Scoped Permissions** | Users can access Battle Reports, Battle Intel, or both based on assigned roles |
| **3. Graceful UI Degradation** | UI adapts based on feature access without breaking when permissions are restricted |
| **4. Efficient Storage** | Store only essential metadata and references (not full killmail payloads) |
| **5. Extensible Architecture** | Easy to add new features (e.g., Fleet Tracking, Market Intel) without affecting existing features |
| **6. Authentication & Authorization** | EVE Online SSO with multi-character support and feature-scoped RBAC |

---

## 3. Feature Architecture

BattleScope is organized into distinct features, each with its own:
- Business logic package (`backend/{feature-name}/`)
- API routes (`backend/api/src/routes/{feature-name}.ts`)
- Permission requirements (feature roles: `user`, `fc`, `director`, `admin`)
- UI components (conditionally rendered based on access)

### 3.1 Available Features

| Feature Key | Feature Name | Description | Package |
|-------------|--------------|-------------|---------|
| `battle-reports` | Battle Reports | Killmail collection, clustering, and battle reconstruction | `@battlescope/battle-reports` |
| `battle-intel` | Battle Intel | Statistical analysis, opponent tracking, and combat intelligence | `@battlescope/battle-intel` |

**See Feature Specifications**:
- [Battle Reports Feature Spec](./features/battle-reports-spec.md)
- [Battle Intel Feature Spec](./features/battle-intel-spec.md)

---

## 4. Core Platform Concepts

| Concept | Description |
|----------|--------------|
| **Feature** | A distinct product capability with its own business logic, permissions, and UI |
| **Account** | User account authenticated via EVE Online SSO |
| **Character** | EVE character linked to an account (primary + alts) |
| **Feature Role** | Permission level for a feature: `user`, `fc`, `director`, `admin` |
| **Space Type** | K-space (known), J-space (wormhole), or Poch-space (Triglavian) |
| **Entity** | Alliance, corporation, or character in EVE Online |
| **Ruleset** | Database-stored configuration controlling which killmails the ingestion service accepts |

---

## 5. Feature-Based UI Navigation

### 5.1 Navigation Access Matrix

| Nav Item | Battle Reports Access | Battle Intel Access | No Access |
|----------|----------------------|---------------------|-----------|
| **Home** | Shows battle list preview | Shows intel summary | Shows welcome message |
| **Battles** | ✅ Visible | Hidden | Hidden |
| **Recent Kills** | ✅ Visible | Hidden | Hidden |
| **Intel** (future) | Hidden | ✅ Visible | Hidden |
| **Rules** | Admin only | Admin only | Hidden |

### 5.2 Entity Page Composition

Entity pages (Alliance, Corporation, Character) adapt based on feature access:

**With Both Features**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Pandemic Legion [PL]                                            │
├─────────────────────────────────────────────────────────────────┤
│ [Battle History]       ← Battle Reports feature                 │
│ [Intelligence Stats]   ← Battle Intel feature                   │
│ [Opponent Analysis]    ← Battle Intel feature                   │
│ [Ship Composition]     ← Battle Intel feature                   │
└─────────────────────────────────────────────────────────────────┘
```

**Battle Reports Only**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Pandemic Legion [PL]                                            │
├─────────────────────────────────────────────────────────────────┤
│ [Battle History]       ← Battle Reports feature                 │
│                                                                 │
│ ℹ️  Want to see intelligence statistics? Contact an admin       │
│    for Battle Intel feature access.                             │
└─────────────────────────────────────────────────────────────────┘
```

**Battle Intel Only**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Pandemic Legion [PL]                                            │
├─────────────────────────────────────────────────────────────────┤
│ [Intelligence Stats]   ← Battle Intel feature                   │
│ [Opponent Analysis]    ← Battle Intel feature                   │
│ [Ship Composition]     ← Battle Intel feature                   │
│                                                                 │
│ ℹ️  Want to see detailed battle reports? Contact an admin       │
│    for Battle Reports feature access.                           │
└─────────────────────────────────────────────────────────────────┘
```

**No Access**:
- Redirect to home page with message: "This page requires feature access. Please contact an administrator."

### UI Layout & Navigation

**Global Header Bar**:

The application features a persistent header bar across all pages containing:

```
┌──────────────────────────────────────────────────────────────────────┐
│ [BattleScope Logo] Home  Battles  Recent Kills  Rules   [User Menu] │
└──────────────────────────────────────────────────────────────────────┘
```

**Header Components**:

1. **Product Branding** (Left)
   - Application name: "Battle Scope" (clickable, navigates to Home)
   - Optional logo/icon

2. **Primary Navigation** (Center-Left)
   - Home - Dashboard with statistics
   - Battles - Battle list and detail views
   - Recent Kills - Live killmail feed
   - Rules - Ruleset configuration (admin only when auth is enabled)

3. **User Menu** (Right)
   - **Unauthenticated State**: "Login with EVE Online" button
   - **Authenticated State**: User dropdown showing:
     - Primary character portrait (32x32px)
     - Primary character name
     - Current alliance/corporation ticker (if applicable)
     - Dropdown arrow indicator

**User Dropdown Menu** (when authenticated):

```
┌─────────────────────────────────────┐
│ [Portrait] John Doe                 │
│           Pandemic Legion [PL]      │
├─────────────────────────────────────┤
│ 👤 My Profile                       │
│ 👥 Manage Characters                │
│ 🔐 Permissions & Roles              │
├─────────────────────────────────────┤
│ 🚪 Logout                           │
└─────────────────────────────────────┘
```

Clicking "My Profile" or "Manage Characters" navigates to `/profile`.

---

### User Profile Page Specification

**Route**: `/profile`

**Access**: Authenticated users only (redirects to login if not authenticated)

**Layout**: Full-page view with tabbed interface

**Tabs**:
1. **Overview** - Account summary and primary character
2. **Characters** - Manage linked characters and alts
3. **Roles & Permissions** - View assigned roles (admin can manage)
4. **Account Settings** - Email, preferences, account deletion

---

#### Tab 1: Overview

**Purpose**: Display account summary and primary character information

**Content**:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Account Overview                                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Primary Character                                                   │
│ ┌───────────────────────────────────────────────────────────┐      │
│ │ [Portrait 128x128]  John Doe                              │      │
│ │                     Sniggerdly [SNGGR]                    │      │
│ │                     Pandemic Legion [PL]                  │      │
│ │                                                           │      │
│ │                     [View on zKillboard]                  │      │
│ └───────────────────────────────────────────────────────────┘      │
│                                                                     │
│ Account Details                                                     │
│ • Account ID: a1b2c3d4-...                                         │
│ • Email: user@example.com (optional)                                │
│ • Member Since: November 7, 2025                                    │
│ • Last Login: November 7, 2025 at 14:32 UTC                        │
│ • Linked Characters: 3                                              │
│                                                                     │
│ Assigned Roles                                                      │
│ • Battle Reports: Fleet Commander                                   │
│ • Battle Intel: User                                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Features**:
- Large primary character portrait (128x128px)
- Character name links to zKillboard character page
- Corporation and alliance names link to zKillboard pages
- Account metadata display
- Quick summary of assigned roles

---

#### Tab 2: Characters

**Purpose**: Manage linked characters (alts) and set primary character

**Content**:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Linked Characters                          [+ Link New Character]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────┐    │
│ │ [Portrait]  John Doe ⭐ PRIMARY                             │    │
│ │             Sniggerdly [SNGGR]                              │    │
│ │             Pandemic Legion [PL]                            │    │
│ │                                                             │    │
│ │             ESI Token: ✅ Valid (expires in 15 days)        │    │
│ │             Last Verified: November 7, 2025 at 14:30 UTC   │    │
│ │                                                             │    │
│ │             [View on zKillboard]  [Refresh Token]           │    │
│ └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────┐    │
│ │ [Portrait]  Jane Smith                                      │    │
│ │             KarmaFleet [GEWNS]                              │    │
│ │             Goonswarm Federation [CONDI]                    │    │
│ │                                                             │    │
│ │             ESI Token: ⚠️  Expired                          │    │
│ │             Last Verified: October 15, 2025 at 10:22 UTC   │    │
│ │                                                             │    │
│ │             [Set as Primary]  [Refresh Token]  [Unlink]     │    │
│ └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────┐    │
│ │ [Portrait]  Alt Character                                   │    │
│ │             NPC Corp [NPC]                                  │    │
│ │             No Alliance                                      │    │
│ │                                                             │    │
│ │             ESI Token: ✅ Valid (expires in 45 days)        │    │
│ │             Last Verified: November 6, 2025 at 18:45 UTC   │    │
│ │                                                             │    │
│ │             [Set as Primary]  [Refresh Token]  [Unlink]     │    │
│ └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Features**:

1. **Link New Character** (Button)
   - Initiates EVE SSO OAuth flow
   - Links additional character to existing account
   - Flow: Click → EVE SSO login → Callback → Character linked

2. **Character Cards** (One per linked character)
   - Portrait (64x64px)
   - Character name with PRIMARY indicator (⭐) for primary character
   - Corporation name and ticker
   - Alliance name and ticker (if applicable)
   - ESI token status indicator:
     - ✅ Valid - token active with expiry countdown
     - ⚠️ Expired - needs refresh
     - ❌ Invalid - requires re-authentication
   - Last verified timestamp

3. **Character Actions**:
   - **Set as Primary**: Makes this character the account's primary (disabled for current primary)
   - **Refresh Token**: Re-authenticate with EVE SSO to refresh ESI token
   - **Unlink**: Remove character from account (requires confirmation)
   - **View on zKillboard**: External link to character's zKillboard page

**Validation Rules**:
- Cannot unlink the primary character unless another character is set as primary first
- Cannot unlink if it's the only character (must have at least one)
- Setting a new primary character requires confirmation modal

**Confirmation Modal for Unlink**:

```
┌─────────────────────────────────────────────────────────┐
│ Unlink Character?                                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Are you sure you want to unlink John Doe from your     │
│ account?                                                │
│                                                         │
│ This action cannot be undone. You will need to         │
│ re-authenticate with EVE SSO to link this character    │
│ again.                                                  │
│                                                         │
│              [Cancel]  [Unlink Character]               │
└─────────────────────────────────────────────────────────┘
```

---

#### Tab 3: Roles & Permissions

**Purpose**: View assigned feature roles and request role changes

**Content**:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Roles & Permissions                                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Your Assigned Roles                                                 │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────┐    │
│ │ Battle Reports                                              │    │
│ │ Role: Fleet Commander                                       │    │
│ │ Granted: November 1, 2025 by Admin User                     │    │
│ │                                                             │    │
│ │ Permissions:                                                │    │
│ │ • ✅ View battle reports                                    │    │
│ │ • ✅ Create battle reports                                  │    │
│ │ • ❌ Edit any battle report                                │    │
│ │ • ❌ Manage feature settings                               │    │
│ │ • ❌ Manage user roles                                     │    │
│ └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────┐    │
│ │ Battle Intel                                                │    │
│ │ Role: User                                                  │    │
│ │ Granted: November 1, 2025 by Admin User                     │    │
│ │                                                             │    │
│ │ Permissions:                                                │    │
│ │ • ✅ View battle intelligence                               │    │
│ │ • ❌ Create intelligence reports                           │    │
│ │ • ❌ Edit any intelligence report                          │    │
│ │ • ❌ Manage feature settings                               │    │
│ │ • ❌ Manage user roles                                     │    │
│ └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│ ℹ️  Need different permissions? Contact an administrator.          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Role Hierarchy Display**:

Each feature shows the role hierarchy with the user's current level highlighted:

```
User → FC → Director → Admin
   ✓
```

**Permissions Matrix**:

| Action | User | FC | Director | Admin |
|--------|------|----|----|-----|
| View content | ✅ | ✅ | ✅ | ✅ |
| Create content | ❌ | ✅ | ✅ | ✅ |
| Edit any content | ❌ | ❌ | ✅ | ✅ |
| Manage settings | ❌ | ❌ | ✅ | ✅ |
| Manage roles | ❌ | ❌ | ❌ | ✅ |

**Features**:
- Display all features user has access to
- Show current role for each feature
- Display who granted the role and when
- List specific permissions granted by the role
- Show role hierarchy visually
- Contact info for requesting role changes (until in-app requests are implemented)

---

#### Tab 4: Account Settings

**Purpose**: Manage account settings and delete account

**Content**:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Account Settings                                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Email Address                                                       │
│ ┌─────────────────────────────────────────────────────────────┐    │
│ │ user@example.com                              [Change Email] │    │
│ └─────────────────────────────────────────────────────────────┘    │
│ • Used for notifications and account recovery                       │
│ • Optional - you can remove your email if desired                   │
│                                                                     │
│ Display Name                                                        │
│ ┌─────────────────────────────────────────────────────────────┐    │
│ │ John Doe                                      [Change Name]  │    │
│ └─────────────────────────────────────────────────────────────┘    │
│ • How your name appears to administrators                          │
│                                                                     │
│ Privacy & Data                                                      │
│ • [Download My Data] - Export all your account data                │
│ • [View Audit Log] - See your account activity history             │
│                                                                     │
│ ─────────────────────────────────────────────────────────────      │
│                                                                     │
│ Danger Zone                                                         │
│ ┌─────────────────────────────────────────────────────────────┐    │
│ │ Delete Account                                              │    │
│ │                                                             │    │
│ │ Permanently delete your account and all associated data.    │    │
│ │ This action cannot be undone.                               │    │
│ │                                                             │    │
│ │                           [Delete My Account]               │    │
│ └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Account Deletion Flow**:

**Step 1: Confirmation Modal**

```
┌───────────────────────────────────────────────────────────────────┐
│ Delete Account?                                                   │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Are you sure you want to delete your account?                    │
│                                                                   │
│ This will permanently delete:                                     │
│ • Your account profile                                            │
│ • All linked characters                                           │
│ • All assigned roles and permissions                              │
│ • Your activity history                                           │
│                                                                   │
│ ⚠️  This action cannot be undone.                                 │
│                                                                   │
│ To confirm, type your primary character name: John Doe           │
│ ┌─────────────────────────────────────────────────────────┐      │
│ │                                                         │      │
│ └─────────────────────────────────────────────────────────┘      │
│                                                                   │
│                      [Cancel]  [Delete Account]                   │
│                                        ^^^^ disabled until typed   │
└───────────────────────────────────────────────────────────────────┘
```

**Step 2: Success Confirmation**

```
┌─────────────────────────────────────────────────────────────┐
│ Account Deleted                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Your account has been permanently deleted.                  │
│                                                             │
│ You will be logged out and redirected to the home page.     │
│                                                             │
│                           [OK]                              │
└─────────────────────────────────────────────────────────────┘
```

After clicking OK, user is logged out and redirected to `/` (home page).

**Features**:
- Email management (add, change, remove)
- Display name editing
- Data export (GDPR compliance)
- Audit log viewing (shows authentication events, role changes)
- Account deletion with strong confirmation (type character name)
- Clear warning about data loss
- Immediate logout after deletion

---

### UI Display Requirements (F14)

**Entity Name Display**: The UI must display human-readable names for all EVE Online entities instead of raw IDs.

| Entity Type | Display Format | Example | zKillboard Link |
|-------------|----------------|---------|-----------------|
| **Alliance** | Alliance name as clickable link | [Pandemic Legion](https://zkillboard.com/alliance/99001234/) | `https://zkillboard.com/alliance/{allianceId}/` |
| **Corporation** | Corporation name as clickable link | [Sniggerdly](https://zkillboard.com/corporation/98001234/) | `https://zkillboard.com/corporation/{corpId}/` |
| **Character** | Character name as clickable link | [John Doe](https://zkillboard.com/character/90012345/) | `https://zkillboard.com/character/{characterId}/` |
| **System** | System name with optional ID | J115422 (31000123) | N/A |
| **Ship Type** | Ship name | Loki | N/A |

**UI Implementation Rules**:

1. **Never display raw IDs**: All entity references must show names, not numeric IDs
2. **External links**: All alliances, corporations, and characters must link to their respective zKillboard pages
3. **Link styling**: Use visual indicators (color, underline, or icon) to distinguish external links
4. **Fallback handling**: If a name is unavailable, display "Unknown {EntityType} #{ID}" with tooltip
5. **Loading states**: Show skeleton loaders or placeholders while names are being fetched
6. **Multiple entities**: When displaying lists (e.g., attacker alliances), show all names separated by commas, each as a clickable link

**Screen-Specific Requirements**:

- **Home View**:
  - Top Alliances: Display alliance names with battle counts
  - Top Corporations: Display corporation names with battle counts
  - Each entry links to zKillboard entity page
  
- **Recent Kills View**:
  - Show victim alliance/corp/character names
  - Show attacker alliance/corp names (summarized if many)
  - System name with space type indicator
  - All entity names link to zKillboard
  
- **Battles View**:
  - Battle list: Show system name and space type
  - Battle detail: Show all participant names with roles (victim/attacker)
  - Killmail list: Show victim and attacker entity names
  - All entity names link to zKillboard

- **Entity Detail Pages (Alliance/Corporation/Character)**:
  - Header: Display entity name, icon/logo (if available), and basic statistics
  - Battle History: Paginated list of battles involving this entity
  - Battle Summary Cards: Each battle should show:
    - Battle date/time and duration
    - System name with space type indicator
    - Opposing alliances/corporations (those they fought against)
    - Participant count (total pilots involved)
    - Ship composition (breakdown by ship type/class)
    - ISK destroyed/lost ratio
    - Link to full battle report
  - Statistics Panel:
    - Total battles participated in
    - Win/loss ratio (based on ISK efficiency)
    - Most frequent opponents
    - Most used ship types
    - Top systems by battles (systems with most battle participation)
    - Top systems by kills (systems where entity gets most kills)
  - All entity names link to their respective detail pages or zKillboard

---

## 7. Non-Functional Requirements

| Category | Specification |
|-----------|----------------|
| **Storage Efficiency** | Average battle storage footprint < 10 KB |
| **Reliability** | Duplicate-safe ingestion with idempotent writes |
| **Performance** | Cluster detection for 10k+ kills/hour |
| **Scalability** | Stateless ingestion workers and async DB writes |
| **Transparency** | All data verifiable via zKillboard URLs |
| **Extensibility** | Easy to add optional enrichment jobs (ISK stats, doctrine tagging) |

---

## 8. Platform-Level Requirements

### 8.1 ID Type Requirements

**All EVE Online entity identifiers must use BIGINT (64-bit integers):**

- **Rationale**: EVE Online IDs can exceed JavaScript's `Number.MAX_SAFE_INTEGER` (2^53-1 = 9,007,199,254,740,991)
- **Affected entities**: killmail IDs, character IDs, corporation IDs, alliance IDs, system IDs, ship type IDs
- **API representation**: All IDs transmitted as strings in JSON to prevent precision loss
- **Database storage**: Native BIGINT columns for efficient indexing and filtering

### 8.2 Entity Name Resolution

**Display Requirement**: The UI must display human-readable names for all EVE Online entities instead of raw IDs.

| Entity Type | Display Format | zKillboard Link |
|-------------|----------------|-----------------|
| **Alliance** | Alliance name as clickable link | `https://zkillboard.com/alliance/{allianceId}/` |
| **Corporation** | Corporation name as clickable link | `https://zkillboard.com/corporation/{corpId}/` |
| **Character** | Character name as clickable link | `https://zkillboard.com/character/{characterId}/` |
| **System** | System name with optional ID | N/A |
| **Ship Type** | Ship name | N/A |

**UI Implementation Rules**:
1. **Never display raw IDs**: All entity references must show names, not numeric IDs
2. **External links**: All alliances, corporations, and characters must link to their respective zKillboard pages
3. **Link styling**: Use visual indicators (color, underline, or icon) to distinguish external links
4. **Fallback handling**: If a name is unavailable, display "Unknown {EntityType} #{ID}" with tooltip
5. **Loading states**: Show skeleton loaders or placeholders while names are being fetched

**Backend Resolution**:
- All API responses include both IDs (as strings) and human-readable names
- Names are resolved via ESI API during enrichment and cached for performance
- Cache invalidation on ESI version changes

---

## 9. Feature API Endpoints

Feature-specific API endpoints are documented in their respective feature specifications:

- **Battle Reports API**: See [Battle Reports Feature Spec](./features/battle-reports-spec.md#5-api-endpoints)
- **Battle Intel API**: See [Battle Intel Feature Spec](./features/battle-intel-spec.md#5-api-endpoints)

**Common Authentication Endpoints**:
- `GET /auth/login` - Initiate EVE SSO login
- `GET /auth/callback` - OAuth callback handler
- `GET /me` - Get current user profile
- `POST /auth/logout` - Logout
- See [Authentication Spec](./authenication-authorization-spec/README.md#7-api-surface-fastify-routes) for complete auth API

---

## 10. Platform MVP Scope

✅ **Core Platform**:
- EVE Online SSO authentication with multi-character support
- Feature-scoped RBAC (roles: user, fc, director, admin)
- Graceful UI degradation based on feature access
- Entity name resolution via ESI integration
- zKillboard data ingestion with ruleset filtering

✅ **Battle Reports Feature**:
- Killmail clustering and battle reconstruction
- Battle detail views with participants and killmails
- Real-time killmail feed (SSE)
- Battle filtering and search

✅ **Battle Intel Feature**:
- Alliance/Corporation/Character intelligence pages
- Opponent analysis and tracking
- Ship composition statistics
- Geographic activity heatmaps

⏳ **Future Enhancements**:
- Additional features (Fleet Tracking, Market Intel, etc.)
- Discord/Slack integrations
- Advanced analytics and predictions
- Map/timeline visualizations
