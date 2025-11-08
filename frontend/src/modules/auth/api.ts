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
 * Get account details (Admin only)
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
