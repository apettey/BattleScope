# User Profile Specification

_Created: 2025-11-09_
_Status: Design Phase_

## Overview

The User Profile feature allows users to view and manage their own account information, characters, and permissions within BattleScope. This feature mirrors the admin user view but is self-service and focused on personal account management.

## Purpose

**User Goals:**
- View all characters associated with their account
- See character organization (corporation and alliance)
- Understand their assigned feature roles and permissions
- Manage primary character selection
- View ESI token status for each character
- Add new characters via EVE SSO
- Remove characters from their account

**Business Goals:**
- Reduce admin support burden for common account tasks
- Increase transparency around permissions
- Improve user engagement through self-service
- Ensure users maintain up-to-date character information

## Scope

### In Scope
- View account details (display name, email, login history)
- View all characters grouped by alliance and corporation
- See current feature roles and permissions
- Change primary character
- Add new characters via EVE SSO
- Remove characters (with safeguards)
- View ESI token expiration status
- Navigate to character refresh flow

### Out of Scope (for v1)
- Editing display name or email
- Requesting role changes (admin only)
- Viewing audit log of account changes
- Exporting account data
- Account deletion (must contact admin)

## Key Principles

1. **Self-Service**: Users should be able to manage basic account tasks without admin intervention
2. **Transparency**: Clear visibility into permissions and character status
3. **Safety**: Safeguards to prevent accidental data loss (e.g., removing primary character)
4. **Consistency**: UI/UX consistent with admin views
5. **Privacy**: Users can only see and modify their own data

## Related Documentation

- [Frontend UI Specification](./frontend-spec.md)
- [API Specification](./api-spec.md)
- [User Flows](./user-flows.md)
- [Admin User Management](../admin-user-management-spec.md) (reference)
- [Authentication & Authorization](../authenication-authorization-spec/README.md)
