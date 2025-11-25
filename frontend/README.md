# BattleScope V3 Frontend

A Next.js 15 application providing the user interface for BattleScope V3 - EVE Online Battle Intelligence Platform.

## Features

### 8 Core Modules

1. **Authentication Module** - EVE SSO login and session management
2. **Character Management** - Multi-character linking and primary character selection
3. **Dashboard** - Service health, stats, and recent activity overview
4. **Battle Reports** - Browse and analyze battle reconstructions
5. **Battle Intel** - Live killmail feed with real-time updates
6. **Search** - Universal search across battles, characters, corps, and systems
7. **Notifications** - User notification management
8. **Admin Panel** - User management, roles, configuration, and audit logs

## Technology Stack

- **Framework**: Next.js 15 (App Router)
- **UI Library**: React 19
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **HTTP Client**: Axios
- **Icons**: Lucide React
- **Date Handling**: date-fns

## Project Structure

```
frontend/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx               # Root layout with auth provider
│   ├── page.tsx                 # Landing/login page
│   ├── auth/callback/           # OAuth callback handler
│   ├── dashboard/               # Dashboard page
│   ├── characters/              # Character management
│   ├── battles/                 # Battle list and detail pages
│   ├── intel/                   # Live killmail feed
│   ├── search/                  # Search interface
│   ├── notifications/           # Notification management
│   └── admin/                   # Admin panel pages
├── components/                   # Shared React components
│   ├── AuthProvider.tsx         # Authentication wrapper
│   ├── Navbar.tsx               # Top navigation
│   ├── Button.tsx               # Button component
│   ├── Card.tsx                 # Card component
│   ├── Input.tsx                # Input component
│   ├── Modal.tsx                # Modal dialog
│   ├── Table.tsx                # Data table
│   ├── Badge.tsx                # Badge component
│   ├── LoadingSpinner.tsx       # Loading indicator
│   ├── CharacterAvatar.tsx      # EVE character portrait
│   ├── SystemName.tsx           # EVE system name with security
│   ├── ShipIcon.tsx             # EVE ship icon
│   ├── CorpLogo.tsx             # Corporation logo
│   └── AllianceLogo.tsx         # Alliance logo
├── lib/                         # Utility libraries
│   ├── api.ts                   # Axios API client with interceptors
│   ├── types.ts                 # TypeScript type definitions
│   ├── store.ts                 # Zustand state store
│   └── utils.ts                 # Utility functions
├── public/                      # Static assets
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript configuration
├── tailwind.config.ts           # Tailwind CSS configuration
├── next.config.ts               # Next.js configuration
└── README.md                    # This file
```

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm (recommended) or npm

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local

# Start development server
pnpm dev
```

The application will be available at `http://localhost:3000`.

### Environment Variables

```bash
# BFF API URL (defaults to /api for same-origin requests)
NEXT_PUBLIC_API_URL=

# Feature Flags (optional)
NEXT_PUBLIC_ENABLE_INTEL=true
NEXT_PUBLIC_ENABLE_REPORTS=true
```

## Development

### Running the Development Server

```bash
pnpm dev
```

Hot reload is enabled - changes to files will automatically update in the browser.

### Building for Production

```bash
# Build the application
pnpm build

# Run production build locally
pnpm start
```

### Type Checking

```bash
pnpm type-check
```

### Linting

```bash
pnpm lint
```

## API Integration

All API calls go through `/api/*` which is rewritten to the BFF service URL.

### Key Endpoints

- `GET /api/me` - Get current user
- `GET /api/me/characters` - List user characters
- `GET /api/auth/login` - Initiate EVE SSO
- `POST /api/auth/logout` - Logout
- `GET /api/battles` - List battles
- `GET /api/battles/:id` - Battle details
- `GET /api/intel/live` - Live killmails
- `GET /api/search` - Search endpoint
- `GET /api/notifications` - User notifications
- `GET /api/admin/*` - Admin endpoints

## Authentication Flow

1. User clicks "Login with EVE Online" on landing page
2. Redirected to `/api/auth/login` (handled by BFF → Auth Service)
3. EVE SSO OAuth flow completes
4. Callback to `/auth/callback` with code and state
5. Auth service validates and sets `battlescope_session` cookie
6. Frontend fetches user data from `/api/me`
7. User redirected to `/dashboard`

All subsequent requests automatically include the session cookie.

## Component Library

### UI Components

- **Button** - Styled button with variants (primary, secondary, danger, ghost)
- **Card** - Content card with optional title and action
- **Input** - Form input with label and error states
- **Modal** - Modal dialog with backdrop
- **Table** - Data table with sorting and loading states
- **Badge** - Status badge with color variants
- **LoadingSpinner** - Animated loading indicator

### EVE-Specific Components

- **CharacterAvatar** - EVE character portrait from ESI
- **SystemName** - System name with security status color
- **ShipIcon** - Ship type icon
- **CorpLogo** - Corporation logo
- **AllianceLogo** - Alliance logo

All EVE images are loaded from `https://images.evetech.net`.

## Styling

The application uses Tailwind CSS with a custom EVE Online theme:

```javascript
colors: {
  'eve-blue': '#00a7e1',
  'eve-gold': '#d4af37',
  'eve-dark': '#0a0e27',
}
```

## State Management

Zustand is used for global state:

```typescript
// Auth store
const { user, setUser, logout } = useAuth();

// User data is fetched on initial load and stored globally
// Protected routes redirect to login if user is null
```

## Deployment

### Docker

```bash
# Build Docker image
docker build -t battlescope-frontend:v3.0.0 .

# Run container
docker run -p 3000:3000 -e BFF_URL=http://bff:3006 battlescope-frontend:v3.0.0
```

### Kubernetes

Deploy using the manifests in `/infra/k8s/services/`:

```bash
kubectl apply -f infra/k8s/services/frontend.yaml
```

The frontend is exposed via NodePort 30000.

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Performance

- Server-side rendering for initial page load
- Client-side navigation for subsequent pages
- Image optimization via Next.js Image component
- Code splitting for optimal bundle size

## Security

- HTTP-only cookies for session management
- No sensitive data stored in localStorage
- CSRF protection via SameSite cookies
- XSS prevention via React's built-in escaping

## Contributing

Follow the established patterns:

1. Use TypeScript strict mode
2. Follow existing component structure
3. Use Tailwind CSS for styling
4. Keep components small and focused
5. Add loading and error states
6. Test responsive design

## License

Copyright 2025 BattleScope V3
