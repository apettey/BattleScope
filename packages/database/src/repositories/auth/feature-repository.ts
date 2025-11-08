import type { Kysely } from 'kysely';
import type { Database } from '../../schema.js';

export interface FeatureRecord {
  id: string;
  key: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleRecord {
  id: string;
  key: string;
  name: string;
  rank: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountFeatureRoleRecord {
  id: string;
  accountId: string;
  featureId: string;
  roleId: string;
  grantedBy: string | null;
  createdAt: Date;
}

export interface FeatureRoleInfo {
  featureKey: string;
  featureName: string;
  roleKey: string;
  roleName: string;
  roleRank: number;
}

export interface AssignRoleInput {
  accountId: string;
  featureKey: string;
  roleKey: string;
  grantedBy: string | null;
}

export interface FeatureSettingRecord {
  id: string;
  featureId: string;
  key: string;
  value: Record<string, unknown>;
  updatedBy: string | null;
  updatedAt: Date;
  createdAt: Date;
}

/**
 * Repository for managing features, roles, and feature settings
 */
export class FeatureRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Get all features
   */
  async getAllFeatures(): Promise<FeatureRecord[]> {
    return this.db.selectFrom('features').selectAll().orderBy('name', 'asc').execute();
  }

  /**
   * Get feature by key
   */
  async getFeatureByKey(key: string): Promise<FeatureRecord | null> {
    const result = await this.db
      .selectFrom('features')
      .selectAll()
      .where('key', '=', key)
      .executeTakeFirst();
    return result ?? null;
  }

  /**
   * Get all roles
   */
  async getAllRoles(): Promise<RoleRecord[]> {
    return this.db.selectFrom('roles').selectAll().orderBy('rank', 'asc').execute();
  }

  /**
   * Get role by key
   */
  async getRoleByKey(key: string): Promise<RoleRecord | null> {
    const result = await this.db
      .selectFrom('roles')
      .selectAll()
      .where('key', '=', key)
      .executeTakeFirst();
    return result ?? null;
  }

  /**
   * Get all feature roles for an account
   */
  async getAccountFeatureRoles(accountId: string): Promise<FeatureRoleInfo[]> {
    const results = await this.db
      .selectFrom('account_feature_roles as afr')
      .innerJoin('features as f', 'f.id', 'afr.featureId')
      .innerJoin('roles as r', 'r.id', 'afr.roleId')
      .select([
        'f.key as featureKey',
        'f.name as featureName',
        'r.key as roleKey',
        'r.name as roleName',
        'r.rank as roleRank',
      ])
      .where('afr.accountId', '=', accountId)
      .execute();

    return results;
  }

  /**
   * Assign a role to an account for a feature
   */
  async assignRole(input: AssignRoleInput): Promise<void> {
    // Get feature and role IDs
    const feature = await this.getFeatureByKey(input.featureKey);
    const role = await this.getRoleByKey(input.roleKey);

    if (!feature) {
      throw new Error(`Feature not found: ${input.featureKey}`);
    }

    if (!role) {
      throw new Error(`Role not found: ${input.roleKey}`);
    }

    // Upsert the role assignment
    await this.db
      .insertInto('account_feature_roles')
      .values({
        accountId: input.accountId,
        featureId: feature.id,
        roleId: role.id,
        grantedBy: input.grantedBy,
      })
      .onConflict((oc) =>
        oc.columns(['accountId', 'featureId']).doUpdateSet({
          roleId: role.id,
          grantedBy: input.grantedBy,
        }),
      )
      .execute();
  }

  /**
   * Remove a role assignment
   */
  async removeRole(accountId: string, featureKey: string): Promise<void> {
    const feature = await this.getFeatureByKey(featureKey);

    if (!feature) {
      throw new Error(`Feature not found: ${featureKey}`);
    }

    await this.db
      .deleteFrom('account_feature_roles')
      .where('accountId', '=', accountId)
      .where('featureId', '=', feature.id)
      .execute();
  }

  /**
   * Get account's role for a specific feature
   */
  async getAccountRoleForFeature(
    accountId: string,
    featureKey: string,
  ): Promise<FeatureRoleInfo | null> {
    const result = await this.db
      .selectFrom('account_feature_roles as afr')
      .innerJoin('features as f', 'f.id', 'afr.featureId')
      .innerJoin('roles as r', 'r.id', 'afr.roleId')
      .select([
        'f.key as featureKey',
        'f.name as featureName',
        'r.key as roleKey',
        'r.name as roleName',
        'r.rank as roleRank',
      ])
      .where('afr.accountId', '=', accountId)
      .where('f.key', '=', featureKey)
      .executeTakeFirst();

    return result ?? null;
  }

  /**
   * Get all feature settings for a feature
   */
  async getFeatureSettings(featureKey: string): Promise<Record<string, unknown>> {
    const feature = await this.getFeatureByKey(featureKey);

    if (!feature) {
      throw new Error(`Feature not found: ${featureKey}`);
    }

    const results = await this.db
      .selectFrom('feature_settings')
      .selectAll()
      .where('featureId', '=', feature.id)
      .execute();

    const settings: Record<string, unknown> = {};
    for (const result of results) {
      settings[result.key] = result.value;
    }

    return settings;
  }

  /**
   * Update a feature setting
   */
  async updateFeatureSetting(
    featureKey: string,
    key: string,
    value: Record<string, unknown>,
    updatedBy: string,
  ): Promise<void> {
    const feature = await this.getFeatureByKey(featureKey);

    if (!feature) {
      throw new Error(`Feature not found: ${featureKey}`);
    }

    await this.db
      .insertInto('feature_settings')
      .values({
        featureId: feature.id,
        key,
        value,
        updatedBy,
      })
      .onConflict((oc) =>
        oc.columns(['featureId', 'key']).doUpdateSet({
          value,
          updatedBy,
        }),
      )
      .execute();
  }

  /**
   * Delete a feature setting
   */
  async deleteFeatureSetting(featureKey: string, key: string): Promise<void> {
    const feature = await this.getFeatureByKey(featureKey);

    if (!feature) {
      throw new Error(`Feature not found: ${featureKey}`);
    }

    await this.db
      .deleteFrom('feature_settings')
      .where('featureId', '=', feature.id)
      .where('key', '=', key)
      .execute();
  }

  /**
   * Get all accounts with a specific role for a feature
   */
  async getAccountsByFeatureRole(featureKey: string, roleKey: string): Promise<string[]> {
    const feature = await this.getFeatureByKey(featureKey);
    const role = await this.getRoleByKey(roleKey);

    if (!feature || !role) {
      return [];
    }

    const results = await this.db
      .selectFrom('account_feature_roles')
      .select('accountId')
      .where('featureId', '=', feature.id)
      .where('roleId', '=', role.id)
      .execute();

    return results.map((r) => r.accountId);
  }

  /**
   * Bulk assign roles for an account
   */
  async bulkAssignRoles(
    accountId: string,
    assignments: Array<{ featureKey: string; roleKey: string }>,
    grantedBy: string | null,
  ): Promise<void> {
    // Remove all existing roles for the account
    await this.db.deleteFrom('account_feature_roles').where('accountId', '=', accountId).execute();

    // Assign new roles
    for (const assignment of assignments) {
      await this.assignRole({
        accountId,
        featureKey: assignment.featureKey,
        roleKey: assignment.roleKey,
        grantedBy,
      });
    }
  }
}
