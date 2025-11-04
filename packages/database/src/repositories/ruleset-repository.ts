import type { DatabaseClient } from '../client.js';
import {
  RulesetSchema,
  RulesetUpdateSchema,
  type RulesetRecord,
  type RulesetUpdate,
} from '../types.js';
import { serializeBigIntArray, toBigIntArray } from './utils.js';

const ACTIVE_RULESET_ID = '00000000-0000-0000-0000-000000000001';

const mapRow = (row: {
  id: string;
  minPilots: number;
  trackedAllianceIds: readonly (bigint | number | string | null | undefined)[];
  trackedCorpIds: readonly (bigint | number | string | null | undefined)[];
  ignoreUnlisted: boolean;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RulesetRecord =>
  RulesetSchema.parse({
    id: row.id,
    minPilots: row.minPilots,
    trackedAllianceIds: toBigIntArray(row.trackedAllianceIds ?? []),
    trackedCorpIds: toBigIntArray(row.trackedCorpIds ?? []),
    ignoreUnlisted: row.ignoreUnlisted,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const defaultRuleset = (): RulesetRecord => ({
  id: ACTIVE_RULESET_ID,
  minPilots: 1,
  trackedAllianceIds: [],
  trackedCorpIds: [],
  ignoreUnlisted: false,
  updatedBy: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

export class RulesetRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getActiveRuleset(): Promise<RulesetRecord> {
    const row = await this.db
      .selectFrom('rulesets')
      .selectAll()
      .where('id', '=', ACTIVE_RULESET_ID)
      .executeTakeFirst();

    if (!row) {
      return defaultRuleset();
    }

    return mapRow(row);
  }

  async updateActiveRuleset(input: RulesetUpdate): Promise<RulesetRecord> {
    const payload = RulesetUpdateSchema.parse(input);
    const now = new Date();

    const updated = await this.db
      .updateTable('rulesets')
      .set({
        minPilots: payload.minPilots,
        trackedAllianceIds: serializeBigIntArray(payload.trackedAllianceIds),
        trackedCorpIds: serializeBigIntArray(payload.trackedCorpIds),
        ignoreUnlisted: payload.ignoreUnlisted,
        updatedBy: payload.updatedBy ?? null,
        updatedAt: now,
      })
      .where('id', '=', ACTIVE_RULESET_ID)
      .returningAll()
      .executeTakeFirst();

    if (updated) {
      return mapRow(updated);
    }

    const inserted = await this.db
      .insertInto('rulesets')
      .values({
        id: ACTIVE_RULESET_ID,
        minPilots: payload.minPilots,
        trackedAllianceIds: serializeBigIntArray(payload.trackedAllianceIds),
        trackedCorpIds: serializeBigIntArray(payload.trackedCorpIds),
        ignoreUnlisted: payload.ignoreUnlisted,
        updatedBy: payload.updatedBy ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return mapRow(inserted);
  }
}
