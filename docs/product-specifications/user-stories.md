# User Stories and Use Cases

**Version**: 1.0
**Last Updated**: 2025-11-12
**Status**: Production

---

## Overview

This document consolidates user stories and use cases from all feature specifications, organized by actor and workflow.

---

## Actor Definitions

| Actor | Description | Typical Permissions |
|-------|-------------|---------------------|
| **Anonymous User** | Unauthenticated visitor | None (redirected to login) |
| **Line Member** | Regular alliance member | Battle Reports: User<br>Battle Intel: User |
| **Fleet Commander (FC)** | Leads fleets, reviews battles | Battle Reports: FC<br>Battle Intel: User |
| **Director** | Alliance leadership | All features: Director or Admin |
| **SuperAdmin** | Platform administrator | Full access to all features and admin functions |

---

## User Stories by Actor

### Anonymous User

**US-1.1**: As an anonymous user, I want to see a landing page that explains what BattleScope does, so I understand the value proposition before logging in.

**US-1.2**: As an anonymous user, I want to click "Login with EVE Online" and be redirected to EVE SSO, so I can authenticate securely.

**US-1.3**: As an anonymous user who is not in an allowed corporation/alliance, I want to see a clear message explaining why I cannot access the platform.

---

### Line Member

#### Battle Reports

**US-2.1**: As a line member, I want to view a list of recent battles in J-space, so I can see what's happening in wormhole space.
- **Acceptance Criteria**:
  - Battle list shows battles from last 7 days
  - Filter by "J-space" works correctly
  - Each battle shows system, time, participants, ISK destroyed
  - Click battle to see details

**US-2.2**: As a line member, I want to view detailed information about a specific battle, so I can understand what happened.
- **Acceptance Criteria**:
  - See all killmails in the battle
  - See all participants with ships and sides
  - See battle statistics (duration, ISK, etc.)
  - Link to zKillboard works

**US-2.3**: As a line member, I want to see a real-time feed of killmails, so I know what's happening right now.
- **Acceptance Criteria**:
  - Feed updates automatically with new killmails
  - Shows killmail time, system, victim, ship, ISK value
  - Click killmail to see details
  - Filter by space type works

**US-2.4**: As a line member, I want to search for battles involving my alliance, so I can review our recent activity.
- **Acceptance Criteria**:
  - Search autocomplete suggests my alliance
  - Results show all battles with my alliance
  - Can filter by date range
  - Pagination works

#### Battle Intel

**US-2.5**: As a line member, I want to view statistics for my alliance, so I can see our overall performance.
- **Acceptance Criteria**:
  - See total battles, kills, losses
  - See ISK efficiency
  - See top opponents
  - See most used ships
  - See geographic activity

**US-2.6**: As a line member, I want to compare my character's stats with corp mates, so I can see how I'm performing.
- **Acceptance Criteria**:
  - View my own character stats
  - See most used ships
  - See battle participation count
  - See ISK destroyed/lost

#### User Profile

**US-2.7**: As a line member, I want to view my profile and see all my linked characters, so I know which alts are connected to my account.
- **Acceptance Criteria**:
  - See primary character
  - See all linked alts grouped by corp/alliance
  - See token expiration status
  - See my feature roles

**US-2.8**: As a line member, I want to add a new character to my account, so I can track all my alts.
- **Acceptance Criteria**:
  - Click "Add Character" button
  - Redirected to EVE SSO
  - After authentication, new character appears in profile
  - Can set as primary character

---

### Fleet Commander

**US-3.1**: As a fleet commander, I want to review battles my fleet participated in, so I can provide after-action reports.
- **Acceptance Criteria**:
  - Filter battles by specific system
  - Filter battles by time range
  - See battle statistics (kills, losses, ISK efficiency)
  - Export battle summary

**US-3.2**: As a fleet commander, I want to see ship composition in battles, so I can understand enemy doctrines.
- **Acceptance Criteria**:
  - See ship types by side
  - See count of each ship type
  - Identify common fleet compositions
  - Compare our composition vs enemy

**US-3.3**: As a fleet commander, I want to track ISK efficiency over time, so I can measure fleet performance improvement.
- **Acceptance Criteria**:
  - View ISK efficiency for specific alliance/corp
  - See trend over last 30 days
  - Compare different time periods
  - Filter by ship types or systems

**US-3.4**: As a fleet commander, I want to identify frequent opponents, so I can prepare for common enemies.
- **Acceptance Criteria**:
  - See list of top opponents
  - See engagement frequency
  - See win/loss ratio against each
  - See last engagement date

---

### Director

**US-4.1**: As a director, I want to configure which alliances are tracked by the ingestion system, so we only see relevant battles.
- **Acceptance Criteria**:
  - Access Battle Reports configuration page
  - Add/remove alliances from tracked list
  - Changes take effect on next ingestion cycle
  - View current ingestion statistics

**US-4.2**: As a director, I want to adjust battle clustering parameters, so we get accurate battle reconstruction.
- **Acceptance Criteria**:
  - Modify time window (default 30 min)
  - Modify maximum gap (default 15 min)
  - Modify minimum kills (default 2)
  - Changes apply to new battles only

**US-4.3**: As a director, I want to configure cache TTL for Battle Intel, so we balance freshness vs performance.
- **Acceptance Criteria**:
  - Access Battle Intel configuration page
  - Modify entity stats TTL
  - Modify cache warming settings
  - See current cache hit rate

**US-4.4**: As a director, I want to view all members of my corporation and their feature roles, so I can audit access.
- **Acceptance Criteria**:
  - Filter accounts by corporation
  - See feature roles for each member
  - See last login date
  - Identify inactive accounts

**US-4.5**: As a director, I want to request role changes for my corporation members from admins, so users get appropriate access.
- **Acceptance Criteria**: (Future feature - not implemented)
  - Submit role change request
  - Add justification
  - Admin receives notification
  - Status tracked

---

### SuperAdmin

#### User Management

**US-5.1**: As a SuperAdmin, I want to search for any user account, so I can provide support or investigate issues.
- **Acceptance Criteria**:
  - Search by display name, email, or character name
  - Filter by account status (active, blocked)
  - Filter by corporation/alliance
  - View results in paginated table

**US-5.2**: As a SuperAdmin, I want to view detailed information about a user's account, so I can troubleshoot issues.
- **Acceptance Criteria**:
  - See all linked characters grouped by corp/alliance
  - See character token status
  - See feature role assignments
  - See recent activity and audit log

**US-5.3**: As a SuperAdmin, I want to block a user account, so I can prevent access from malicious users.
- **Acceptance Criteria**:
  - Click "Block Account" button
  - Provide reason for blocking
  - User immediately logged out
  - Block recorded in audit log
  - User cannot log in until unblocked

**US-5.4**: As a SuperAdmin, I want to assign feature roles to users, so they can access appropriate features.
- **Acceptance Criteria**:
  - Select user account
  - Choose feature (e.g., Battle Reports)
  - Choose role (User, FC, Director, Admin)
  - Assignment recorded in audit log
  - User immediately gains access

**US-5.5**: As a SuperAdmin, I want to promote another user to SuperAdmin, so they can help with platform administration.
- **Acceptance Criteria**:
  - Click "Promote to SuperAdmin"
  - Confirmation dialog with warning
  - Promotion recorded in audit log
  - User immediately gains SuperAdmin access

#### Organization Gating

**US-5.6**: As a SuperAdmin, I want to configure which corporations/alliances can access the platform, so we control access.
- **Acceptance Criteria**:
  - Add corporations to allow list
  - Add alliances to allow list
  - Add corporations/alliances to deny list
  - Toggle "require membership" mode
  - Test character access with preview tool

**US-5.7**: As a SuperAdmin, I want to see why a character was denied access, so I can troubleshoot org gating issues.
- **Acceptance Criteria**:
  - Enter character ID in preview tool
  - See allowed/denied status
  - See detailed reason (e.g., "Corp in deny list")
  - See which rule applied

#### Audit and Monitoring

**US-5.8**: As a SuperAdmin, I want to view audit logs of all platform actions, so I can track security and compliance.
- **Acceptance Criteria**:
  - View paginated audit log (50 per page)
  - Filter by action type
  - Filter by actor (who performed action)
  - Filter by date range
  - Export filtered logs to CSV

**US-5.9**: As a SuperAdmin, I want to see platform usage analytics, so I can understand growth and engagement.
- **Acceptance Criteria**:
  - View daily/weekly/monthly active users
  - View feature adoption rates
  - View top corporations by user count
  - View request rate and error rate trends

**US-5.10**: As a SuperAdmin, I want to be alerted when security events occur, so I can respond quickly.
- **Acceptance Criteria**:
  - Alert on high failed login rate
  - Alert on mass role changes
  - Alert on SuperAdmin promotion
  - Alert on org gating rule changes
  - Alerts sent to Slack/PagerDuty

---

## User Journeys

### Journey 1: New User Onboarding

**Actor**: Anonymous User → Line Member

**Steps**:
1. Visit battlescope.com
2. Read landing page explaining features
3. Click "Login with EVE Online"
4. Redirected to EVE SSO login page
5. Authenticate with EVE credentials
6. Consent to ESI scope access
7. Redirected back to BattleScope
8. Org gating check (corp/alliance membership)
9. If allowed: Account created, redirected to home dashboard
10. If denied: See error message explaining requirements

**Success Criteria**:
- User understands what BattleScope does before logging in
- Authentication completes in <30 seconds
- Clear error messages if access denied
- User lands on home dashboard with clear next steps

---

### Journey 2: Reviewing a Battle

**Actor**: Line Member

**Steps**:
1. Log in to BattleScope
2. Navigate to "Battles" page
3. Filter by space type "J-space"
4. Browse list of recent battles
5. Click on interesting battle (e.g., large ISK destroyed)
6. View battle detail page:
   - See battle summary (time, system, ISK, participants)
   - See list of killmails with timestamps
   - See list of participants by side
   - See ship composition breakdown
7. Click "View on zKillboard" to verify
8. Return to battle list to review more battles

**Success Criteria**:
- Battle list loads in <2 seconds
- Filters work correctly
- Battle detail page loads in <2 seconds
- All links work correctly
- User can easily understand battle outcome

---

### Journey 3: Analyzing Alliance Performance

**Actor**: Director

**Steps**:
1. Log in to BattleScope
2. Navigate to "Intel" or search for alliance
3. Select alliance from search results
4. View alliance intel page:
   - See overall statistics (battles, ISK efficiency)
   - See top opponents with engagement history
   - See ship composition trends
   - See geographic activity (top systems)
5. Click on opponent to see head-to-head comparison
6. Review recent battle history involving this opponent
7. Identify patterns (common doctrines, favorite systems)
8. Share findings with alliance leadership

**Success Criteria**:
- Intel page loads in <2 seconds
- Statistics are accurate and up-to-date
- Charts and graphs are clear and informative
- Can easily drill down into details
- Can share specific insights (copy link)

---

### Journey 4: Configuring Battle Reports

**Actor**: Director/Admin

**Steps**:
1. Log in as Director or Admin
2. Navigate to Admin Panel → Features → Battle Reports
3. Click "Configure Feature Settings"
4. Review current ingestion configuration
5. Add new alliances to tracked list:
   - Search for alliance by name
   - Select from autocomplete
   - Click "Add to tracked alliances"
6. Adjust clustering parameters:
   - Change time window from 30 to 45 minutes
   - Save changes
7. Review ingestion statistics to verify changes
8. Monitor battle creation rate over next hour

**Success Criteria**:
- Configuration page clearly shows current settings
- Can easily find and add entities to track
- Changes are saved and applied correctly
- Statistics update to reflect new configuration
- No battles missed due to configuration change

---

### Journey 5: Managing User Access (SuperAdmin)

**Actor**: SuperAdmin

**Steps**:
1. Log in as SuperAdmin
2. Navigate to Admin Panel → Accounts
3. Search for user by name or character
4. Click on user account to view details
5. Review user's characters, roles, and activity
6. Assign new feature role:
   - Select "Battle Intel" feature
   - Choose "Director" role
   - Confirm assignment
7. Verify role appears in user's profile
8. Review audit log to confirm action recorded
9. Notify user of new access via external channel

**Success Criteria**:
- Can quickly find any user account
- User detail page shows complete information
- Role assignment is immediate
- User can access feature right away
- All actions are audited

---

## Common Workflows

### Workflow: Adding a Character (Multi-Character Support)

**Actor**: Any authenticated user

**Current State**: ⚠️ Partially implemented

**Steps**:
1. Navigate to Profile page
2. Click "Add Character" button
3. Redirected to EVE SSO (state parameter includes return URL)
4. Authenticate with different EVE character
5. Consent to ESI scopes
6. Redirected back to BattleScope callback
7. System verifies user is already logged in
8. System links new character to existing account
9. System stores encrypted ESI tokens
10. User redirected to Profile page
11. New character appears in character list

**Success Criteria**:
- User can add multiple characters
- Each character has independent ESI tokens
- User can switch primary character
- Cannot add same character to multiple accounts

---

### Workflow: Token Refresh (Background)

**Current State**: ❌ Not implemented

**Steps**:
1. System checks character ESI token expiration every hour (CronJob)
2. For tokens expiring in <24 hours:
   - Use refresh token to get new access token
   - Encrypt and store new tokens
   - Update expiration timestamp
   - Log refresh attempt
3. If refresh fails:
   - Mark token as expired
   - User notified on next login
   - Prompt user to re-authenticate character

**Success Criteria**:
- Tokens refresh automatically before expiration
- User never experiences token expiration errors
- Failed refreshes are handled gracefully

---

## Pain Points Addressed

### Pain Point 1: Manual Battle Tracking

**Problem**: Players manually track battles by saving zKillboard links and checking multiple alliances.

**Solution**: BattleScope automatically clusters killmails into battles and tracks all configured entities.

**User Story**: "As a director, I want battles automatically tracked, so I don't have to manually search zKillboard for relevant fights."

### Pain Point 2: Incomplete Battle Context

**Problem**: zKillboard shows individual killmails but doesn't reconstruct full battles.

**Solution**: Clustering algorithm groups related killmails by time, location, and participants.

**User Story**: "As a fleet commander, I want to see all killmails from a fight in one place, so I understand the full battle."

### Pain Point 3: Lack of Opponent Intelligence

**Problem**: No easy way to track who you fight most often and win/loss ratios.

**Solution**: Battle Intel analyzes all battle data and computes opponent statistics.

**User Story**: "As an intel analyst, I want to see who we fight most often and our performance against them, so I can identify threats and opportunities."

### Pain Point 4: Limited Access Control

**Problem**: zKillboard is public; sensitive intel needs to be protected.

**Solution**: Organization gating and feature-scoped RBAC control access.

**User Story**: "As a director, I want to control who can see our battle data, so sensitive information stays within the alliance."

### Pain Point 5: No Historical Trends

**Problem**: Can't easily see performance trends over time.

**Solution**: Battle Intel stores historical data and computes trends.

**User Story**: "As a director, I want to see our ISK efficiency trend over the last 3 months, so I can measure improvement."

---

## References

- [Product Features Catalog](/docs/product-specifications/features.md)
- [Requirements Specification](/docs/product-specifications/requirements.md)
- [Battle Reports Feature Spec](/docs/features/battle-reports/feature-spec.md)
- [Battle Intel Feature Spec](/docs/features/battle-intel/feature-spec.md)
- [Admin Panel Spec](/docs/features/admin-panel/feature-spec.md)
