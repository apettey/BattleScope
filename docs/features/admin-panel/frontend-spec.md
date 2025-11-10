# Admin Panel Frontend Specification

**Feature Key**: `admin-panel`
**Last Updated**: 2025-11-10

---

## Overview

This document defines the frontend implementation specification for the Admin Panel UI.

For the general feature specification, see [feature-spec.md](./feature-spec.md).

---

## Routes

All admin routes are prefixed with `/admin` and require SuperAdmin access.

### `/admin`
**Component**: `AdminDashboard`
**Access**: SuperAdmin only

### `/admin/accounts`
**Component**: `AccountManagementPage`
**Access**: SuperAdmin only

### `/admin/accounts/:id`
**Component**: `ViewUserPage`
**Access**: SuperAdmin only

### `/admin/roles`
**Component**: `RoleManagementPage`
**Access**: SuperAdmin only

### `/admin/features`
**Component**: `FeatureManagementPage`
**Access**: SuperAdmin only

### `/admin/org-gating`
**Component**: `OrgGatingPage`
**Access**: SuperAdmin only

### `/admin/audit-logs`
**Component**: `AuditLogsPage`
**Access**: SuperAdmin only

### `/admin/analytics`
**Component**: `AnalyticsPage`
**Access**: SuperAdmin only

---

## Component Structure

```
frontend/src/modules/admin/
├── AdminLayout.tsx
├── pages/
│   ├── AdminDashboard.tsx
│   ├── AccountManagementPage.tsx
│   ├── ViewUserPage.tsx
│   ├── RoleManagementPage.tsx
│   ├── FeatureManagementPage.tsx
│   ├── OrgGatingPage.tsx
│   ├── AuditLogsPage.tsx
│   └── AnalyticsPage.tsx
├── components/
│   ├── AdminSidebar.tsx
│   ├── AccountList.tsx
│   ├── AccountCard.tsx
│   ├── CharacterList.tsx
│   ├── RoleMatrix.tsx
│   ├── FeatureList.tsx
│   ├── OrgGatingConfig.tsx
│   ├── AuditLogViewer.tsx
│   └── ConfirmationDialog.tsx
├── hooks/
│   ├── useAccounts.ts
│   ├── useAccountDetail.ts
│   ├── useRoles.ts
│   ├── useFeatures.ts
│   ├── useAuditLogs.ts
│   └── useAnalytics.ts
├── api/
│   ├── accounts.ts
│   ├── roles.ts
│   ├── features.ts
│   ├── auth-config.ts
│   ├── audit-logs.ts
│   └── analytics.ts
└── types.ts
```

---

## Pages

_TODO: Define Admin Panel page components based on feature-spec.md Section 9_

---

## Components

_TODO: Define reusable Admin Panel UI components_

---

## Hooks

_TODO: Define data fetching and mutation hooks for Admin Panel_

---

## Access Control

All admin routes must check for SuperAdmin status:

```typescript
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

---

## Audit Trail

All admin actions must be logged:
- User blocks/unblocks
- Role changes
- SuperAdmin promotions/demotions
- Feature configuration updates
- Org gating rule changes

---

## Notes

- Admin panel is isolated from regular user UI
- Confirmation dialogs required for destructive actions
- All data mutations trigger audit log entries
- Real-time updates for activity monitoring
