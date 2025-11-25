# User Profile - Frontend UI Specification

_Last Updated: 2025-11-09_

## Page Structure

**Route**: `/profile`

**Authentication**: Required (redirects to login if not authenticated)

**Layout**: Main application layout with sidebar navigation

## Page Sections

### 1. Account Header

**Location**: Top of page

**Components**:
```
┌─────────────────────────────────────────────────────────────┐
│  [Avatar]  Display Name                          Last Login  │
│            Primary Character Name                 2 hours ago │
│            user@example.com                                   │
│                                                               │
│            [Add Character Button]                             │
└─────────────────────────────────────────────────────────────┘
```

**Data Displayed**:
- **Avatar**: Primary character portrait (128x128)
- **Display Name**: User's account display name
- **Primary Character**: Current primary character name with corp ticker
- **Email**: User's email (if set, otherwise "No email set")
- **Last Login**: Relative timestamp (e.g., "2 hours ago", "Yesterday")

**Actions**:
- **Add Character**: Button that triggers EVE SSO flow to add another character

---

### 2. Account Statistics

**Location**: Below header, horizontal cards

**Components**:
```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Total          │  │  Alliances      │  │  Corporations   │
│  Characters     │  │  Represented    │  │  Represented    │
│                 │  │                 │  │                 │
│      3          │  │       1         │  │       2         │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

**Metrics**:
- **Total Characters**: Count of all characters on account
- **Alliances Represented**: Unique alliance count
- **Corporations Represented**: Unique corporation count

---

### 3. Characters Section

**Location**: Main content area

**Title**: "My Characters"

**Description**: "Characters are grouped by alliance and corporation. Your primary character is used for authentication and is marked with a star."

#### 3.1 Alliance Group

```
┌─────────────────────────────────────────────────────────────┐
│  [Alliance Logo]  Alliance Name (3 characters)               │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  [Corp Logo]  Corporation Name (2 characters)          │  │
│  │                                                         │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │ [Portrait] Character Name                  ⭐     │  │  │
│  │  │            Corp Ticker                            │  │  │
│  │  │            Token expires in 2 days     [Refresh]  │  │  │
│  │  │            Last verified: 10 minutes ago          │  │  │
│  │  │                                                    │  │  │
│  │  │            [Set as Primary] [Remove Character]    │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  │                                                         │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │ [Portrait] Character Name 2                       │  │  │
│  │  │            ...                                     │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  [Corp Logo]  Corporation Name 2 (1 character)        │  │
│  │  ...                                                   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Character Card Details**:
- **Portrait**: 64x64 character portrait
- **Character Name**: EVE character name
- **Corp Ticker**: Corporation ticker in brackets [TICKER]
- **Primary Indicator**: Gold star (⭐) if primary character
- **Token Status**:
  - Green badge: "Token valid" (>7 days until expiration)
  - Yellow badge: "Token expires in X days" (1-7 days)
  - Red badge: "Token expired" (requires refresh)
- **Last Verified**: Timestamp of last background verification
- **Actions**:
  - **Refresh Token**: Button to re-authenticate and refresh ESI token
  - **Set as Primary**: Button to make this the primary character (disabled if already primary)
  - **Remove Character**: Button to remove character from account (with confirmation)

**Empty State**:
```
┌─────────────────────────────────────────────────────────────┐
│                  No Characters Added                         │
│                                                               │
│  You haven't added any characters to your account yet.       │
│                                                               │
│              [Add Your First Character]                       │
└─────────────────────────────────────────────────────────────┘
```

---

### 4. Feature Roles Section

**Location**: Below characters section

**Title**: "Feature Permissions"

**Description**: "Your assigned roles and permissions across BattleScope features."

**Components**:
```
┌─────────────────────────────────────────────────────────────┐
│  Feature Permissions                                         │
│  ─────────────────────────────────────────────────────────  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Battles & Killmails                                   │  │
│  │  Role: FC                                              │  │
│  │                                                         │  │
│  │  You can view battles, killmails, and create battle   │  │
│  │  reports. You cannot manage rulesets or access admin  │  │
│  │  features.                                             │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Admin                                                 │  │
│  │  Role: Admin                                           │  │
│  │                                                         │  │
│  │  You can manage users, view audit logs, and configure │  │
│  │  system settings.                                      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Feature Role Card**:
- **Feature Name**: Name of the feature (e.g., "Battles & Killmails", "Admin")
- **Role**: User's role for this feature (User, FC, Director, Admin)
- **Description**: Brief description of what this role can do
- **Badge Color**:
  - User: Gray
  - FC: Blue
  - Director: Purple
  - Admin: Red

**Empty State**:
```
┌─────────────────────────────────────────────────────────────┐
│  No Feature Roles Assigned                                   │
│                                                               │
│  You don't have any feature roles assigned yet. Contact     │
│  an administrator to request access.                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Modals & Dialogs

### 1. Add Character Modal

**Trigger**: Click "Add Character" button

**Content**:
```
┌─────────────────────────────────────────────────┐
│  Add Character                               [X] │
│  ───────────────────────────────────────────────│
│                                                  │
│  Link a new EVE Online character to your        │
│  BattleScope account via EVE SSO.               │
│                                                  │
│  Your character's corporation and alliance      │
│  must be approved to gain access.               │
│                                                  │
│            [Cancel]  [Continue with EVE SSO]    │
└─────────────────────────────────────────────────┘
```

**Actions**:
- **Cancel**: Close modal
- **Continue with EVE SSO**: Redirect to EVE SSO OAuth flow

---

### 2. Remove Character Confirmation

**Trigger**: Click "Remove Character" button

**Content**:
```
┌─────────────────────────────────────────────────┐
│  Remove Character                            [X] │
│  ───────────────────────────────────────────────│
│                                                  │
│  [Character Portrait]                            │
│  Character Name                                  │
│  Corporation Name                                │
│                                                  │
│  Are you sure you want to remove this character │
│  from your account? This action cannot be       │
│  undone.                                         │
│                                                  │
│  ⚠️ Warning: This is your primary character.    │
│     You will need to set a new primary after    │
│     removal.                                     │
│                                                  │
│            [Cancel]  [Remove Character]         │
└─────────────────────────────────────────────────┘
```

**Validation**:
- If removing the only character: Show error "Cannot remove your only character"
- If removing primary character: Show warning (as above)

---

### 3. Set Primary Character Confirmation

**Trigger**: Click "Set as Primary" button

**Content**:
```
┌─────────────────────────────────────────────────┐
│  Change Primary Character                   [X] │
│  ───────────────────────────────────────────────│
│                                                  │
│  Current Primary:                                │
│  [Portrait] Character Name 1                     │
│                                                  │
│  New Primary:                                    │
│  [Portrait] Character Name 2                     │
│                                                  │
│  Your primary character is used for login and   │
│  authentication. You will remain logged in      │
│  after this change.                              │
│                                                  │
│            [Cancel]  [Change Primary]           │
└─────────────────────────────────────────────────┘
```

---

### 4. Refresh Token Modal

**Trigger**: Click "Refresh" button on expired/expiring token

**Content**:
```
┌─────────────────────────────────────────────────┐
│  Refresh ESI Token                           [X] │
│  ───────────────────────────────────────────────│
│                                                  │
│  [Character Portrait]                            │
│  Character Name                                  │
│                                                  │
│  Your ESI token for this character has expired  │
│  or will expire soon. Re-authenticate via EVE   │
│  SSO to refresh the token.                       │
│                                                  │
│  This will NOT log you out of BattleScope.      │
│                                                  │
│            [Cancel]  [Refresh via EVE SSO]      │
└─────────────────────────────────────────────────┘
```

---

## Responsive Design

### Desktop (>1024px)
- Full layout with sidebar
- Characters displayed in 2-column grid within corp groups
- Feature roles displayed in 2-column grid

### Tablet (768px - 1024px)
- Sidebar collapses to hamburger menu
- Characters displayed in 1-column grid
- Feature roles displayed in 1-column grid

### Mobile (<768px)
- Hamburger menu navigation
- Account statistics stacked vertically
- Characters displayed in single column
- Feature roles displayed in single column
- Action buttons stack vertically

---

## Loading States

### Initial Page Load
```
┌─────────────────────────────────────────────────┐
│  [Skeleton Avatar]  [Skeleton Text]              │
│                     [Skeleton Text]              │
│                                                  │
│  [Skeleton Card] [Skeleton Card] [Skeleton Card] │
│                                                  │
│  [Skeleton Alliance Group]                       │
│    [Skeleton Corp Group]                         │
│      [Skeleton Character Card]                   │
│      [Skeleton Character Card]                   │
└─────────────────────────────────────────────────┘
```

### Refreshing Token
- Show spinner overlay on character card
- Disable all actions on that card
- Show "Refreshing token..." text

### Removing Character
- Show spinner overlay on character card
- Fade out card after successful removal

---

## Error States

### Failed to Load Profile
```
┌─────────────────────────────────────────────────┐
│              Failed to Load Profile              │
│                                                  │
│  We couldn't load your profile. Please try      │
│  refreshing the page.                            │
│                                                  │
│  If the problem persists, contact support.      │
│                                                  │
│                   [Retry]                        │
└─────────────────────────────────────────────────┘
```

### Failed to Remove Character
```
┌─────────────────────────────────────────────────┐
│  Error                                       [X] │
│  ───────────────────────────────────────────────│
│                                                  │
│  Failed to remove character. Please try again.  │
│                                                  │
│                    [OK]                          │
└─────────────────────────────────────────────────┘
```

---

## Accessibility

- **Keyboard Navigation**: All interactive elements accessible via Tab
- **Screen Readers**: Proper ARIA labels on all controls
- **Focus Indicators**: Clear focus states on all interactive elements
- **Color Contrast**: WCAG AA compliant contrast ratios
- **Alt Text**: All images have descriptive alt text

---

## Animation & Transitions

- **Page Load**: Fade in (300ms)
- **Character Cards**: Slide in from bottom (staggered, 100ms delay each)
- **Modal Open/Close**: Fade + scale (200ms)
- **Button Hover**: Scale 1.02 (100ms)
- **Card Removal**: Fade out + collapse (300ms)
- **Primary Change**: Pulse animation on new primary card (500ms)

---

## Navigation

**Sidebar Link**: "Profile" (icon: user circle)

**Breadcrumbs**: Home > Profile

**Page Title**: "My Profile"
