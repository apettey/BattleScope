/**
 * Auth API client for EVE SSO authentication and user management
 */

import { z } from 'zod';
import { buildUrl, resolveBaseUrl } from '../api/http.js';

// ============================================================================
// Schemas
// ============================================================================

export const CharacterSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  eveCharacterId: z.string(),
  eveCharacterName: z.string(),
  corpId: z.string(),
  corpName: z.string(),
  allianceId: z.string().nullable(),
  allianceName: z.string().nullable(),
  portraitUrl: z.string().url(),
  scopes: z.array(z.string()),
  tokenStatus: z.enum(['valid', 'expiring', 'invalid']),
  lastVerifiedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type Character = z.infer<typeof CharacterSchema>;

export const FeatureRoleSchema = z.object({
  featureKey: z.string(),
  roleKey: z.enum(['user', 'fc', 'director', 'admin']),
  roleRank: z.number(),
});

export type FeatureRole = z.infer<typeof FeatureRoleSchema>;

export const MeResponseSchema = z.object({
  accountId: z.string().uuid(),
  displayName: z.string(),
  email: z.string().email().nullable(),
  isSuperAdmin: z.boolean(),
  primaryCharacter: CharacterSchema.nullable(),
  characters: z.array(CharacterSchema),
  featureRoles: z.array(FeatureRoleSchema),
});

export type MeResponse = z.infer<typeof MeResponseSchema>;

export const AccountSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  email: z.string().email().nullable(),
  isBlocked: z.boolean(),
  isSuperAdmin: z.boolean(),
  lastLoginAt: z.string().datetime().nullable(),
});

export type Account = z.infer<typeof AccountSchema>;

export const AccountDetailSchema = AccountSchema.extend({
  featureRoles: z.array(
    FeatureRoleSchema.extend({
      featureName: z.string(),
      roleName: z.string(),
    }),
  ),
});

export type AccountDetail = z.infer<typeof AccountDetailSchema>;

// Detailed character schema for View User Page
export const DetailedCharacterSchema = z.object({
  id: z.string().uuid(),
  eveCharacterId: z.string(),
  eveCharacterName: z.string(),
  portraitUrl: z.string().url(),
  corpId: z.string(),
  corpName: z.string(),
  allianceId: z.string().nullable(),
  allianceName: z.string().nullable(),
  isPrimary: z.boolean(),
  scopes: z.array(z.string()),
  tokenExpiresAt: z.string().datetime(),
  tokenStatus: z.enum(['valid', 'expiring', 'expired']),
  lastVerifiedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type DetailedCharacter = z.infer<typeof DetailedCharacterSchema>;

// Account detail with characters grouped by alliance/corporation
export const AccountDetailWithCharactersSchema = z.object({
  account: z.object({
    id: z.string().uuid(),
    displayName: z.string(),
    email: z.string().email().nullable(),
    isBlocked: z.boolean(),
    isSuperAdmin: z.boolean(),
    lastLoginAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
  }),
  primaryCharacter: z
    .object({
      id: z.string().uuid(),
      eveCharacterId: z.string(),
      eveCharacterName: z.string(),
      portraitUrl: z.string(),
      corpId: z.string(),
      corpName: z.string(),
      allianceId: z.string().nullable(),
      allianceName: z.string().nullable(),
      isPrimary: z.boolean(),
      tokenStatus: z.enum(['valid', 'expiring', 'expired']),
    })
    .nullable(),
  charactersGrouped: z.array(
    z.object({
      allianceId: z.string().nullable(),
      allianceName: z.string().nullable(),
      corporations: z.array(
        z.object({
          corpId: z.string(),
          corpName: z.string(),
          characters: z.array(DetailedCharacterSchema),
        }),
      ),
    }),
  ),
  featureRoles: z.array(
    FeatureRoleSchema.extend({
      featureName: z.string(),
      roleName: z.string(),
    }),
  ),
  stats: z.object({
    totalCharacters: z.number(),
  }),
});

export type AccountDetailWithCharacters = z.infer<typeof AccountDetailWithCharactersSchema>;

export const AccountListResponseSchema = z.object({
  accounts: z.array(AccountSchema),
  total: z.number(),
});

export type AccountListResponse = z.infer<typeof AccountListResponseSchema>;

// ============================================================================
// API Functions
// ============================================================================

export interface ApiOptions {
  signal?: AbortSignal;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

/**
 * Get current user profile
 */
export const fetchMe = async (options: ApiOptions = {}): Promise<MeResponse> => {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const url = buildUrl(`${baseUrl}/me`, {}, baseUrl);

  const response = await (options.fetchFn ?? fetch)(url, {
    method: 'GET',
    credentials: 'include',
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  const data = await response.json();
  return MeResponseSchema.parse(data);
};

/**
 * Logout current user
 */
export const logout = async (options: ApiOptions = {}): Promise<void> => {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const url = buildUrl(`${baseUrl}/auth/logout`, {}, baseUrl);

  await (options.fetchFn ?? fetch)(url, {
    method: 'POST',
    credentials: 'include',
    signal: options.signal,
  });
};

/**
 * Get login URL for EVE SSO
 */
export const getLoginUrl = (redirectUri?: string): string => {
  const baseUrl = resolveBaseUrl();
  return buildUrl(`${baseUrl}/auth/login`, { redirectUri: redirectUri ?? undefined }, baseUrl);
};

/**
 * List accounts (Admin only)
 */
export const fetchAccounts = async (
  params: { query?: string; limit?: number; offset?: number },
  options: ApiOptions = {},
): Promise<AccountListResponse> => {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const queryParams = {
    query: params.query,
    limit: params.limit?.toString(),
    offset: params.offset?.toString(),
  };
  const url = buildUrl(`${baseUrl}/admin/accounts`, queryParams, baseUrl);

  const response = await (options.fetchFn ?? fetch)(url, {
    method: 'GET',
    credentials: 'include',
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  const data = await response.json();
  return AccountListResponseSchema.parse(data);
};

/**
 * Get account details (Admin only) - DEPRECATED: Use fetchAccountDetailWithCharacters instead
 */
export const fetchAccountDetail = async (
  accountId: string,
  options: ApiOptions = {},
): Promise<AccountDetail> => {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const url = buildUrl(`${baseUrl}/admin/accounts/${accountId}`, {}, baseUrl);

  const response = await (options.fetchFn ?? fetch)(url, {
    method: 'GET',
    credentials: 'include',
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  const data = await response.json();
  return AccountDetailSchema.parse(data);
};

/**
 * Get account details with characters grouped by alliance/corporation (Admin only)
 */
export const fetchAccountDetailWithCharacters = async (
  accountId: string,
  options: ApiOptions = {},
): Promise<AccountDetailWithCharacters> => {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const url = buildUrl(`${baseUrl}/admin/accounts/${accountId}`, {}, baseUrl);

  const response = await (options.fetchFn ?? fetch)(url, {
    method: 'GET',
    credentials: 'include',
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  const data = await response.json();
  return AccountDetailWithCharactersSchema.parse(data);
};

/**
 * Block an account (Admin only)
 */
export const blockAccount = async (accountId: string, options: ApiOptions = {}): Promise<void> => {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const url = buildUrl(`${baseUrl}/admin/accounts/${accountId}/block`, {}, baseUrl);

  await (options.fetchFn ?? fetch)(url, {
    method: 'POST',
    credentials: 'include',
    signal: options.signal,
  });
};

/**
 * Unblock an account (Admin only)
 */
export const unblockAccount = async (
  accountId: string,
  options: ApiOptions = {},
): Promise<void> => {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const url = buildUrl(`${baseUrl}/admin/accounts/${accountId}/unblock`, {}, baseUrl);

  await (options.fetchFn ?? fetch)(url, {
    method: 'POST',
    credentials: 'include',
    signal: options.signal,
  });
};

/**
 * Assign feature roles to account (Admin only)
 */
export const assignRoles = async (
  accountId: string,
  roles: Array<{ featureKey: string; roleKey: 'user' | 'fc' | 'director' | 'admin' }>,
  options: ApiOptions = {},
): Promise<void> => {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const url = buildUrl(`${baseUrl}/admin/accounts/${accountId}/roles`, {}, baseUrl);

  await (options.fetchFn ?? fetch)(url, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles }),
    signal: options.signal,
  });
};

/**
 * Promote account to SuperAdmin (SuperAdmin only)
 */
export const promoteToSuperAdmin = async (
  accountId: string,
  options: ApiOptions = {},
): Promise<void> => {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const url = buildUrl(`${baseUrl}/admin/accounts/${accountId}/superadmin`, {}, baseUrl);

  const response = await (options.fetchFn ?? fetch)(url, {
    method: 'POST',
    credentials: 'include',
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to promote to SuperAdmin: ${errorText}`);
  }
};

/**
 * Demote account from SuperAdmin (SuperAdmin only)
 */
export const demoteFromSuperAdmin = async (
  accountId: string,
  options: ApiOptions = {},
): Promise<void> => {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const url = buildUrl(`${baseUrl}/admin/accounts/${accountId}/superadmin`, {}, baseUrl);

  const response = await (options.fetchFn ?? fetch)(url, {
    method: 'DELETE',
    credentials: 'include',
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to demote from SuperAdmin: ${errorText}`);
  }
};

/**
 * Delete account (soft delete, SuperAdmin only)
 */
export const deleteAccount = async (
  accountId: string,
  options: ApiOptions = {},
): Promise<void> => {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const url = buildUrl(`${baseUrl}/admin/accounts/${accountId}`, {}, baseUrl);

  const response = await (options.fetchFn ?? fetch)(url, {
    method: 'DELETE',
    credentials: 'include',
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to delete account: ${errorText}`);
  }
};

// ============================================================================
// Profile Management API (User Self-Service)
// ============================================================================

/**
 * Response schema for GET /me/profile
 */
export const ProfileResponseSchema = AccountDetailWithCharactersSchema.extend({
  stats: z.object({
    totalCharacters: z.number(),
    uniqueAlliances: z.number(),
    uniqueCorporations: z.number(),
  }),
});

export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;

/**
 * Get current user's profile with characters and roles
 */
export const fetchProfile = async (options: ApiOptions = {}): Promise<ProfileResponse> => {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const url = buildUrl(`${baseUrl}/me/profile`, {}, baseUrl);

  const response = await (options.fetchFn ?? fetch)(url, {
    method: 'GET',
    credentials: 'include',
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  const data = await response.json();
  return ProfileResponseSchema.parse(data);
};

/**
 * Set primary character for current user
 */
export const setPrimaryCharacter = async (
  characterId: string,
  options: ApiOptions = {},
): Promise<void> => {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const url = buildUrl(`${baseUrl}/me/profile/primary-character`, {}, baseUrl);

  const response = await (options.fetchFn ?? fetch)(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ characterId }),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to set primary character: ${errorText}`);
  }
};

/**
 * Remove a character from current user's account
 */
export const removeCharacter = async (
  characterId: string,
  options: ApiOptions = {},
): Promise<void> => {
  const baseUrl = options.baseUrl ?? resolveBaseUrl();
  const url = buildUrl(`${baseUrl}/me/profile/characters/${characterId}`, {}, baseUrl);

  const response = await (options.fetchFn ?? fetch)(url, {
    method: 'DELETE',
    credentials: 'include',
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to remove character: ${errorText}`);
  }
};

/**
 * Get URL to refresh character token via EVE SSO
 */
export const getRefreshTokenUrl = (characterId: string): string => {
  const baseUrl = resolveBaseUrl();
  return `${baseUrl}/me/profile/characters/${characterId}/refresh`;
};

/**
 * Get URL to add a new character via EVE SSO
 */
export const getAddCharacterUrl = (): string => {
  const baseUrl = resolveBaseUrl();
  return `${baseUrl}/auth/login?add_character=true`;
};
