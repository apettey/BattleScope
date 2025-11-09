# User Profile - User Flows

_Last Updated: 2025-11-09_

## Overview

This document describes the key user flows for the User Profile feature, including happy paths, error scenarios, and edge cases.

---

## Flow 1: View Profile

**Goal**: User wants to view their profile information

### Happy Path

1. User clicks "Profile" link in sidebar navigation
2. Page loads with skeleton UI showing loading state
3. API call to `GET /me/profile` fetches user data
4. Page renders with:
   - Account header (avatar, name, email, last login)
   - Account statistics (character counts)
   - Characters grouped by alliance and corporation
   - Feature roles and permissions
5. User can scroll through all sections

**Expected Outcome**: User sees all their account information clearly displayed

### Error Scenarios

**Scenario A: API Call Fails**
1. User navigates to profile page
2. API call fails (network error, server error)
3. Error state displayed: "Failed to Load Profile"
4. User clicks [Retry] button
5. Page attempts to reload data

**Scenario B: Session Expired**
1. User navigates to profile page while logged out
2. Auth middleware detects no valid session
3. User redirected to `/auth/login?redirect=/profile`
4. After successful login, user redirected back to profile

---

## Flow 2: Add Character

**Goal**: User wants to add a new EVE character to their account

### Happy Path

1. User on profile page
2. User clicks [Add Character] button in header
3. Modal appears: "Add Character"
4. User reads explanation about EVE SSO
5. User clicks [Continue with EVE SSO]
6. Redirect to EVE SSO login page (`/auth/login?add_character=true`)
7. User logs in with EVE character credentials
8. EVE SSO redirects back to BattleScope
9. Backend:
   - Fetches character info from ESI
   - Checks corporation/alliance against auth_config
   - Adds character to user's account
   - Creates audit log entry
10. User redirected to `/profile?character_added=true`
11. Success toast notification: "Character added successfully"
12. New character appears in character list
13. Token status shows "Token valid"

**Expected Outcome**: New character added to account and visible in profile

### Error Scenarios

**Scenario A: Corporation Not Approved**
1. User completes EVE SSO
2. Backend checks corporation against allow/deny lists
3. Corporation is not approved
4. User redirected to `/profile?character_added=false&reason=org_not_approved`
5. Error toast: "Your corporation is not approved for access. Contact an administrator."
6. Character NOT added to account

**Scenario B: Character Already Exists**
1. User completes EVE SSO
2. Backend checks if character exists on another account
3. Character found on different account
4. User redirected to `/profile?character_added=false&reason=character_exists`
5. Error toast: "This character already belongs to another account."
6. Character NOT added to account

**Scenario C: EVE SSO Cancelled**
1. User clicks [Continue with EVE SSO]
2. User cancels on EVE login page
3. Redirect back with error: `/profile?error=access_denied`
4. Info toast: "Character addition cancelled"

---

## Flow 3: Change Primary Character

**Goal**: User wants to change which character is their primary

### Happy Path

1. User on profile page
2. User finds character they want to set as primary
3. User clicks [Set as Primary] button on character card
4. Confirmation modal appears showing:
   - Current primary character
   - New primary character
5. User clicks [Change Primary]
6. API call: `POST /me/profile/primary-character` with `characterId`
7. Backend:
   - Updates account primary_character_id
   - Creates audit log entry
8. Modal closes
9. Success toast: "Primary character changed to [Character Name]"
10. UI updates:
    - Gold star (⭐) moves to new primary character
    - Old primary loses star
    - Account header updates with new primary

**Expected Outcome**: Primary character successfully changed, UI reflects the change

### Edge Cases

**Scenario A: Already Primary**
1. User clicks [Set as Primary] on their current primary character
2. Button is disabled (grayed out)
3. Tooltip on hover: "This is already your primary character"

**Scenario B: API Call Fails**
1. User clicks [Change Primary]
2. API call fails (network error)
3. Modal stays open
4. Error toast: "Failed to change primary character. Please try again."
5. User can retry or cancel

---

## Flow 4: Remove Character

**Goal**: User wants to remove a character from their account

### Happy Path

1. User on profile page
2. User finds character they want to remove (not their only character)
3. User clicks [Remove Character] button
4. Confirmation modal appears showing:
   - Character portrait and name
   - Warning if it's the primary character
5. User clicks [Remove Character]
6. API call: `DELETE /me/profile/characters/:characterId`
7. Backend:
   - Verifies character belongs to user
   - Ensures not the only character
   - If primary, sets oldest remaining character as new primary
   - Deletes character from database
   - Creates audit log entry
8. Modal closes with animation
9. Character card fades out and collapses
10. Success toast: "Character removed successfully"
11. If was primary: Info toast: "[New Character] is now your primary character"
12. Statistics update (character counts)

**Expected Outcome**: Character removed from account, UI updates accordingly

### Error Scenarios

**Scenario A: Only Character**
1. User has only one character
2. [Remove Character] button is disabled
3. Tooltip on hover: "Cannot remove your only character"

**Scenario B: Removing Primary Character**
1. User clicks [Remove Character] on primary character
2. Modal shows warning: "⚠️ This is your primary character"
3. User confirms removal
4. Character removed
5. Oldest remaining character auto-set as primary
6. Info toast shows who the new primary is

**Scenario C: API Call Fails**
1. User confirms character removal
2. API call fails
3. Modal closes
4. Error toast: "Failed to remove character. Please try again."
5. Character remains in list

---

## Flow 5: Refresh Expired Token

**Goal**: User wants to refresh an expired or expiring ESI token

### Happy Path

1. User on profile page
2. User sees character card with red badge: "Token expired"
3. User clicks [Refresh] button on character card
4. Modal appears: "Refresh ESI Token"
5. Modal shows character info and explanation
6. User clicks [Refresh via EVE SSO]
7. Redirect to EVE SSO: `/me/profile/characters/:characterId/refresh`
8. User logs in with EVE character
9. EVE SSO redirects back with new token
10. Backend:
    - Updates character's ESI tokens
    - Updates token_expires_at
    - Updates last_verified_at
11. User redirected to `/profile?token_refreshed=true&character_id=:id`
12. Success toast: "Token refreshed successfully"
13. Character card updates:
    - Badge changes to green: "Token valid"
    - Token expiration date updates

**Expected Outcome**: ESI token refreshed, character card shows valid status

### Warning Scenarios

**Scenario A: Token Expiring Soon (Yellow Badge)**
1. User sees character with yellow badge: "Token expires in 3 days"
2. User proactively clicks [Refresh]
3. Same flow as happy path
4. User avoids token expiration

**Scenario B: Multiple Expired Tokens**
1. User has multiple characters with expired tokens
2. User must refresh each one individually
3. Consider future enhancement: "Refresh All" button

---

## Flow 6: View Feature Roles

**Goal**: User wants to understand their permissions

### Happy Path

1. User on profile page
2. User scrolls to "Feature Permissions" section
3. User sees list of features they have access to
4. Each feature card shows:
   - Feature name
   - User's role
   - Role badge (colored by permission level)
   - Description of what they can do
5. User understands their access level

**Expected Outcome**: User clearly understands their permissions

### Edge Cases

**Scenario A: No Roles Assigned**
1. User has no feature roles
2. Empty state shown: "No Feature Roles Assigned"
3. Message: "Contact an administrator to request access"

**Scenario B: SuperAdmin**
1. User is a SuperAdmin
2. Special badge: "SuperAdmin" (gold/red)
3. Description: "Full administrative access to all features"
4. Individual feature roles also shown

---

## Flow 7: First-Time User

**Goal**: New user creates account and explores profile

### Happy Path

1. User completes initial EVE SSO login
2. Backend creates:
   - New account
   - First character (set as primary)
   - No feature roles assigned yet
3. User redirected to profile page (or onboarding flow)
4. Profile shows:
   - Account header with their info
   - Single character in list (marked primary)
   - "No Feature Roles Assigned" empty state
5. User clicks [Add Character] to add more
6. User follows add character flow

**Expected Outcome**: New user understands their account structure

---

## Flow 8: Navigation and Return

**Goal**: User navigates away and returns to profile

### Happy Path

1. User on profile page
2. User clicks "Battles" in sidebar
3. User navigates to battles page
4. User clicks "Profile" in sidebar again
5. Profile page loads from cache (if <5 min since last load)
6. If stale, revalidates in background
7. If data changed, UI updates seamlessly

**Expected Outcome**: Fast page load with fresh data

---

## Mobile-Specific Flows

### Flow 9: Mobile Profile View

**Goal**: User views profile on mobile device

1. User opens BattleScope on phone
2. User taps hamburger menu icon
3. Sidebar slides in from left
4. User taps "Profile"
5. Profile page loads:
   - Full-width layout
   - Statistics cards stacked vertically
   - Characters in single column
   - Tap character card to expand details
6. User scrolls smoothly through all sections

**Mobile Interactions**:
- **Tap to Expand**: Character cards expand to show all details
- **Swipe to Remove**: Swipe left on character card to reveal [Remove] button
- **Pull to Refresh**: Pull down on page to refresh data

---

## Error Recovery Patterns

### Pattern 1: Automatic Retry

**Scenario**: Transient network error

1. API call fails with 5xx error or network timeout
2. System automatically retries up to 3 times with exponential backoff
3. If succeeds on retry, user sees no error
4. If all retries fail, show error state with manual [Retry] button

### Pattern 2: Optimistic Update

**Scenario**: Set primary character

1. User clicks [Change Primary]
2. UI immediately updates (optimistic)
3. API call executes in background
4. If succeeds: No further action
5. If fails: Revert UI change, show error toast

### Pattern 3: Graceful Degradation

**Scenario**: Feature roles API fails but profile loads

1. Profile API succeeds
2. Feature roles API fails
3. Show profile with all sections
4. Feature roles section shows error: "Failed to load roles. [Retry]"
5. User can still use other profile features

---

## Accessibility Flows

### Flow 10: Keyboard Navigation

**Goal**: User navigates profile using only keyboard

1. User tabs through page
2. Focus moves between:
   - [Add Character] button
   - Character cards (Tab stops on each)
   - [Set as Primary] button
   - [Refresh] button
   - [Remove Character] button
   - Feature role cards (Tab stops on each)
3. Enter/Space activates focused button
4. Escape closes any open modal

**Keyboard Shortcuts**:
- `Tab`: Next focusable element
- `Shift+Tab`: Previous focusable element
- `Enter`/`Space`: Activate button
- `Escape`: Close modal

### Flow 11: Screen Reader

**Goal**: Visually impaired user understands profile

1. Screen reader announces page title: "My Profile"
2. Navigates through sections:
   - "Account header, Display name: Commander Tyrael"
   - "Primary character: Commander Tyrael, State War Academy"
   - "Last login: 2 hours ago"
   - "Statistics: Total characters: 3"
3. Character cards announced with all details
4. Buttons have clear labels: "Set Commander Tyrael as primary character"
5. Token status announced: "Token expires in 3 days, Warning"

---

## Performance Considerations

### Fast Initial Load
- **Target**: < 2 seconds for profile page to be interactive
- **Strategy**:
  - Lazy load character portraits
  - Render skeleton UI immediately
  - Stream data as it arrives

### Smooth Transitions
- **Target**: 60 FPS animations
- **Strategy**:
  - Use CSS transforms (not position/width)
  - Hardware accelerate animations
  - Debounce user inputs

### Efficient Updates
- **Strategy**:
  - Use React Query for smart caching
  - Optimistic updates for mutations
  - Invalidate only affected queries
