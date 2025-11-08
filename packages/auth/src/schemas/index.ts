import { z } from 'zod';

// ============================================================================
// Account Schemas
// ============================================================================

export const AccountSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  displayName: z.string(),
  primaryCharacterId: z.string().uuid().nullable(),
  isBlocked: z.boolean(),
  isSuperAdmin: z.boolean(),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Account = z.infer<typeof AccountSchema>;

export const AccountSummarySchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  isBlocked: z.boolean(),
  isSuperAdmin: z.boolean(),
  lastLoginAt: z.string().datetime().nullable(),
});

export type AccountSummary = z.infer<typeof AccountSummarySchema>;

// ============================================================================
// Character Schemas
// ============================================================================

export const CharacterSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  eveCharacterId: z.string(), // bigint as string
  eveCharacterName: z.string(),
  corpId: z.string(), // bigint as string
  corpName: z.string(),
  allianceId: z.string().nullable(), // bigint as string
  allianceName: z.string().nullable(),
  portraitUrl: z.string().url(),
  scopes: z.array(z.string()),
  tokenStatus: z.enum(['valid', 'expiring', 'invalid']),
  lastVerifiedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type Character = z.infer<typeof CharacterSchema>;

// ============================================================================
// Role Schemas
// ============================================================================

export const RoleKeySchema = z.enum(['user', 'fc', 'director', 'admin']);
export type RoleKey = z.infer<typeof RoleKeySchema>;

export const RoleSchema = z.object({
  id: z.string().uuid(),
  key: RoleKeySchema,
  name: z.string(),
  rank: z.number().int().positive(),
});

export type Role = z.infer<typeof RoleSchema>;

export const FeatureRoleSchema = z.object({
  featureKey: z.string(),
  roleKey: RoleKeySchema,
  roleRank: z.number().int().positive(),
});

export type FeatureRole = z.infer<typeof FeatureRoleSchema>;

export const FeatureRoleAssignmentSchema = z.object({
  featureKey: z.string(),
  roleKey: RoleKeySchema,
});

export type FeatureRoleAssignment = z.infer<typeof FeatureRoleAssignmentSchema>;

// ============================================================================
// Feature Schemas
// ============================================================================

export const FeatureSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string(),
});

export type Feature = z.infer<typeof FeatureSchema>;

export const FeatureSettingSchema = z.object({
  key: z.string(),
  value: z.record(z.unknown()),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().uuid(),
});

export type FeatureSetting = z.infer<typeof FeatureSettingSchema>;

export const FeatureSettingWriteSchema = z.object({
  key: z.string(),
  value: z.record(z.unknown()),
});

export type FeatureSettingWrite = z.infer<typeof FeatureSettingWriteSchema>;

// ============================================================================
// Auth Config Schemas
// ============================================================================

export const AuthConfigSchema = z.object({
  requireMembership: z.boolean(),
  allowedCorpIds: z.array(z.string()), // bigint as string
  allowedAllianceIds: z.array(z.string()), // bigint as string
  deniedCorpIds: z.array(z.string()), // bigint as string
  deniedAllianceIds: z.array(z.string()), // bigint as string
});

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

// ============================================================================
// Session Schemas
// ============================================================================

export const SessionSchema = z.object({
  accountId: z.string().uuid(),
  isSuperAdmin: z.boolean(),
  roles: z.record(z.number()), // featureKey -> rank
  expiresAt: z.number(), // Unix timestamp
});

export type Session = z.infer<typeof SessionSchema>;

// ============================================================================
// Auth Flow Schemas
// ============================================================================

export const AuthCallbackQuerySchema = z.object({
  code: z.string(),
  state: z.string(),
});

export type AuthCallbackQuery = z.infer<typeof AuthCallbackQuerySchema>;

export const AuthLoginQuerySchema = z.object({
  redirectUri: z.string().url().optional(),
});

export type AuthLoginQuery = z.infer<typeof AuthLoginQuerySchema>;

// ============================================================================
// Me Endpoint Schemas
// ============================================================================

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

// ============================================================================
// Authorization Schemas
// ============================================================================

export const AuthzRequestSchema = z.object({
  subject: z.object({
    accountId: z.string().uuid(),
    superAdmin: z.boolean(),
  }),
  action: z.string(),
  resource: z.object({
    featureKey: z.string().optional(),
    resourceId: z.string().optional(),
  }),
  context: z
    .object({
      requestIp: z.string().optional(),
      org: z
        .object({
          corpId: z.string().optional(), // bigint as string
          allianceId: z.string().optional(), // bigint as string
        })
        .optional(),
    })
    .optional(),
});

export type AuthzRequest = z.infer<typeof AuthzRequestSchema>;

export const AuthzResponseSchema = z.object({
  allow: z.boolean(),
  reason: z.string(),
  cacheTtlSeconds: z.number().int().optional(),
});

export type AuthzResponse = z.infer<typeof AuthzResponseSchema>;

// ============================================================================
// Audit Log Schemas
// ============================================================================

export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  actorAccountId: z.string().uuid().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  metadata: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});

export type AuditLog = z.infer<typeof AuditLogSchema>;

export const AuditLogCreateSchema = z.object({
  actorAccountId: z.string().uuid().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type AuditLogCreate = z.infer<typeof AuditLogCreateSchema>;

// ============================================================================
// EVE SSO Schemas
// ============================================================================

export const EVESSOTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
});

export type EVESSOTokenResponse = z.infer<typeof EVESSOTokenResponseSchema>;

export const EVESSOCharacterSchema = z.object({
  CharacterID: z.number(),
  CharacterName: z.string(),
  ExpiresOn: z.string(),
  Scopes: z.string(),
  TokenType: z.string(),
  CharacterOwnerHash: z.string(),
  IntellectualProperty: z.string(),
});

export type EVESSOCharacter = z.infer<typeof EVESSOCharacterSchema>;

// ============================================================================
// Admin Schemas
// ============================================================================

export const AccountListQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

export type AccountListQuery = z.infer<typeof AccountListQuerySchema>;

export const AccountListResponseSchema = z.object({
  accounts: z.array(AccountSummarySchema),
  total: z.number().int(),
});

export type AccountListResponse = z.infer<typeof AccountListResponseSchema>;

// ============================================================================
// Constants
// ============================================================================

export const ROLE_RANKS = {
  user: 10,
  fc: 20,
  director: 30,
  admin: 40,
} as const;

export const ROLE_NAMES = {
  user: 'User',
  fc: 'Fleet Commander',
  director: 'Director',
  admin: 'Admin',
} as const;

export const FEATURE_KEYS = {
  battleReports: 'battle-reports',
  battleIntel: 'battle-intel',
} as const;

export const AUTH_ACTIONS = {
  // Feature-scoped actions
  featureView: 'feature.view',
  featureCreate: 'feature.create',
  featureEditAny: 'feature.edit.any',
  featureSettingsRead: 'feature.settings.read',
  featureSettingsUpdate: 'feature.settings.update',
  featureRolesManage: 'feature.roles.manage',
  // Global actions
  userManage: 'user.manage',
  userBlock: 'user.block',
  authConfigUpdate: 'auth.config.update',
} as const;

export type AuthAction = (typeof AUTH_ACTIONS)[keyof typeof AUTH_ACTIONS];
