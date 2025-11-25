# Frontend Application Proposal

## Overview

A Next.js-based web application that provides the user interface for BattleScope V3. The frontend communicates with backend services via the BFF (Backend for Frontend) layer.

## Technology Stack

- **Framework**: Next.js 15 (App Router)
- **UI Library**: React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: Cookie-based sessions (managed by auth service)
- **State Management**: Zustand
- **HTTP Client**: Axios
- **Charts**: Recharts
- **Icons**: Lucide React
- **Date Handling**: date-fns

## Architecture Breakdown

### 1. Authentication Module

**Purpose**: Handle user authentication and session management

**Components**:
- Login page with "Login with EVE Online" button
- Session context provider
- Protected route wrapper
- Account settings page

**Routes**:
```
/                           - Landing/Login page
/auth/callback              - OAuth callback handler (redirects to dashboard)
/logout                     - Logout handler
```

**Key Features**:
- EVE SSO login flow
- Session persistence via HTTP-only cookies
- Automatic session validation
- Display current character info

**Integration**:
- Redirects to `/api/auth/login` (proxied by BFF to auth service)
- Receives `battlescope_session` cookie
- All subsequent requests include session cookie automatically

---

### 2. Character Management Module

**Purpose**: Manage multiple EVE characters and set primary character

**Components**:
- Character list with portraits
- Primary character selector
- "Link Another Character" flow
- Character unlink confirmation

**Routes**:
```
/characters                 - Character management page
/characters/link            - Initiate character linking
```

**Key Features**:
- Display all linked characters with portraits
- Show corp/alliance for each character
- Mark primary character
- Add new characters via EVE SSO
- Remove characters from account

**Integration**:
- `GET /api/me/characters` - List characters
- `POST /api/me/characters/link` - Link new character
- `POST /api/me/characters/primary` - Set primary
- `DELETE /api/me/characters/:id` - Unlink

---

### 3. Dashboard Module

**Purpose**: Overview of system status and recent activity

**Components**:
- Service health cards
- Quick stats (battles, characters, activity)
- Recent events feed
- Navigation to other modules

**Routes**:
```
/dashboard                  - Main dashboard
```

**Key Features**:
- Real-time service health indicators
- System statistics
- Recent battle notifications
- Quick links to features

**Integration**:
- `GET /api/health` - Service health
- `GET /api/stats/summary` - Dashboard stats
- `GET /api/activity/recent` - Recent events

---

### 4. Battle Reports Module

**Purpose**: View and analyze battle reconstructions

**Components**:
- Battle list with filters
- Battle detail view with timeline
- Participant lists by alliance/corp
- Ship type breakdowns
- ISK value charts

**Routes**:
```
/battles                    - Battle list
/battles/:id                - Battle detail view
/battles/:id/timeline       - Interactive timeline
/battles/:id/participants   - Participant breakdown
```

**Key Features**:
- Filter battles by date, region, participants
- Search battles by system name
- View battle progression over time
- Analyze ship compositions
- Export battle reports

**Integration**:
- `GET /api/battles` - List battles (paginated)
- `GET /api/battles/:id` - Battle details
- `GET /api/battles/:id/timeline` - Timeline data
- `GET /api/battles/:id/participants` - Participant data

---

### 5. Battle Intel Module

**Purpose**: Real-time killmail feed and intelligence gathering

**Components**:
- Live killmail feed
- Killmail detail modal
- Filters by ship type, value, region
- Notification settings
- Watchlist management

**Routes**:
```
/intel                      - Intel dashboard
/intel/killmail/:id         - Killmail detail
/intel/watchlist            - Manage watchlists
/intel/notifications        - Notification settings
```

**Key Features**:
- Real-time killmail stream
- Filter by ISK value, ship type, region
- Click for detailed killmail info
- Set up custom alerts
- Watch specific characters/corps/alliances

**Integration**:
- `GET /api/intel/killmails` - Recent killmails (paginated)
- `GET /api/intel/killmail/:id` - Killmail details
- `WebSocket /api/intel/stream` - Real-time feed
- `GET /api/intel/watchlist` - User watchlists
- `POST /api/intel/watchlist` - Create watchlist

---

### 6. Search Module

**Purpose**: Search for characters, corps, alliances, systems

**Components**:
- Universal search bar
- Search results with type filtering
- Entity detail pages
- Related entity links

**Routes**:
```
/search                     - Search page
/search?q=:query&type=:type - Search with filters
/entity/:type/:id           - Entity detail page
```

**Key Features**:
- Autocomplete search
- Filter by entity type
- View entity details
- See related entities
- Recent searches

**Integration**:
- `GET /api/search?q=:query&type=:type` - Search
- `GET /api/entity/:type/:id` - Entity details

---

### 7. Notifications Module

**Purpose**: View and manage system notifications

**Components**:
- Notification list
- Notification detail view
- Mark as read/unread
- Notification settings

**Routes**:
```
/notifications              - Notification list
/notifications/settings     - Notification preferences
```

**Key Features**:
- List all notifications
- Filter by read/unread
- Mark as read individually or in bulk
- Delete notifications
- Configure notification preferences

**Integration**:
- `GET /api/notifications` - List notifications
- `POST /api/notifications/:id/read` - Mark as read
- `DELETE /api/notifications/:id` - Delete
- `GET /api/notifications/settings` - Get preferences
- `PUT /api/notifications/settings` - Update preferences

---

### 8. Admin Module

**Purpose**: System administration and user management

**Components**:
- User management table
- Role assignment interface
- Corp/Alliance config
- System settings
- Audit log viewer

**Routes**:
```
/admin                      - Admin dashboard
/admin/users                - User management
/admin/users/:id            - User detail/edit
/admin/roles                - Role management
/admin/config               - System configuration
/admin/audit                - Audit logs
```

**Key Features**:
- List all accounts
- Block/unblock users
- Assign roles per feature
- Configure corp/alliance allow/deny lists
- View audit trail
- System settings

**Integration**:
- `GET /api/admin/accounts` - List accounts
- `PUT /api/admin/accounts/:id` - Update account
- `POST /api/admin/roles/grant` - Grant role
- `GET /api/admin/config` - Get config
- `PUT /api/admin/config` - Update config
- `GET /api/admin/audit` - Audit logs

---

## Shared Components

### Layout Components
- `<RootLayout>` - HTML shell with session provider
- `<DashboardLayout>` - Navbar + sidebar for authenticated pages
- `<Navbar>` - Top navigation with user menu
- `<Sidebar>` - Feature navigation (collapsible)

### UI Components
- `<Button>` - Styled button variants
- `<Input>` - Form input with validation
- `<Modal>` - Modal dialog
- `<Card>` - Content card
- `<Table>` - Data table with sorting/filtering
- `<LoadingSpinner>` - Loading indicator
- `<ErrorBoundary>` - Error handling
- `<Toast>` - Toast notifications

### Data Components
- `<CharacterAvatar>` - EVE character portrait
- `<ShipIcon>` - Ship type icon
- `<CorpLogo>` - Corporation logo
- `<AllianceLogo>` - Alliance logo
- `<SystemName>` - System name with security status color

---

## State Management

### Global State (Zustand)

```typescript
// stores/authStore.ts
interface AuthStore {
  user: User | null;
  characters: Character[];
  primaryCharacter: Character | null;
  loading: boolean;
  fetchUser: () => Promise<void>;
  setSession: (user: User) => void;
  logout: () => Promise<void>;
}

// stores/notificationStore.ts
interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
}
```

### API Client

```typescript
// lib/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BFF_URL || '/api',
  withCredentials: true, // Include cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auto-retry on 401 (could try to refresh session)
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default api;
```

---

## Routing Structure

```
/                               Landing/Login (public)
├── /auth
│   └── /callback               OAuth callback handler
├── /dashboard                  Dashboard (protected)
├── /characters                 Character management (protected)
├── /battles                    Battle Reports module (protected, requires role)
│   ├── /:id
│   ├── /:id/timeline
│   └── /:id/participants
├── /intel                      Battle Intel module (protected, requires role)
│   ├── /killmail/:id
│   ├── /watchlist
│   └── /notifications
├── /search                     Search module (protected)
├── /notifications              Notifications (protected)
└── /admin                      Admin module (protected, admin only)
    ├── /users
    ├── /users/:id
    ├── /roles
    ├── /config
    └── /audit
```

---

## Environment Variables

```bash
# BFF URL
NEXT_PUBLIC_BFF_URL=http://10.0.1.5:30006

# Feature Flags (optional)
NEXT_PUBLIC_ENABLE_INTEL=true
NEXT_PUBLIC_ENABLE_REPORTS=true
```

---

## Build & Deployment

### Dockerfile

```dockerfile
FROM node:22-alpine AS builder
RUN npm install -g pnpm
WORKDIR /app
COPY frontend/package.json ./
RUN pnpm install
COPY frontend/ .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: battlescope
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    spec:
      containers:
        - name: frontend
          image: petdog/battlescope-frontend:v3.0.0
          ports:
            - containerPort: 3000
          env:
            - name: NEXT_PUBLIC_BFF_URL
              value: "http://bff-service:3006"
---
apiVersion: v1
kind: Service
metadata:
  name: frontend-service
spec:
  type: NodePort
  ports:
    - port: 3000
      nodePort: 30000
```

---

## Development Workflow

1. Run services locally or use K8s port forwarding
2. Start Next.js dev server: `pnpm dev`
3. Hot reload on file changes
4. Test authentication flow end-to-end
5. Build production bundle: `pnpm build`
6. Test production build locally: `pnpm start`
7. Build and push Docker image
8. Deploy to Kubernetes

---

## Success Criteria

- ✅ Users can log in with EVE Online SSO
- ✅ All linked characters displayed with portraits
- ✅ Dashboard shows real-time service health
- ✅ Battle Reports module displays battles
- ✅ Battle Intel shows live killmail feed
- ✅ Search works across all entity types
- ✅ Notifications display and can be managed
- ✅ Admin panel accessible to admins
- ✅ Responsive design works on mobile
- ✅ All pages load in < 2 seconds

---

## Next Steps

1. Implement authentication module first (blocking)
2. Build shared layout components
3. Implement dashboard module
4. Build feature modules (battles, intel, etc.)
5. Add admin module
6. Polish UI/UX
7. Performance optimization
8. Testing & deployment
