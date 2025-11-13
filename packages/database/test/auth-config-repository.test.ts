import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthConfigRepository } from '../src/repositories/auth/auth-config-repository.js';
import { createTestDatabase, type TestDatabase } from './test-db.js';

let testDb: TestDatabase | undefined;
let repository: AuthConfigRepository;

beforeAll(async () => {
  testDb = await createTestDatabase();
  repository = new AuthConfigRepository(testDb.db);
});

afterAll(async () => {
  if (testDb) {
    await testDb.destroy();
  }
});

beforeEach(async () => {
  // Reset to default state before each test
  await repository.update({
    requireMembership: false,
    allowedCorpIds: [],
    allowedAllianceIds: [],
    deniedCorpIds: [],
    deniedAllianceIds: [],
  });
});

describe('AuthConfigRepository - Character with Corp but No Alliance', () => {
  const corpIdWithNoAlliance = 98560621n;
  const characterWithNoAlliance = {
    corpId: corpIdWithNoAlliance,
    allianceId: null,
  };

  describe('when requireMembership is false (public access)', () => {
    it('should allow character with corp and no alliance', async () => {
      await repository.update({ requireMembership: false });

      const isAllowed = await repository.isCharacterAllowed(
        characterWithNoAlliance.corpId,
        characterWithNoAlliance.allianceId,
      );

      expect(isAllowed).toBe(true);
    });
  });

  describe('when requireMembership is true', () => {
    beforeEach(async () => {
      await repository.update({ requireMembership: true });
    });

    it('should deny character when corp is not in allowed list', async () => {
      const isAllowed = await repository.isCharacterAllowed(
        characterWithNoAlliance.corpId,
        characterWithNoAlliance.allianceId,
      );

      expect(isAllowed).toBe(false);
    });

    it('should allow character when corp is in allowed list', async () => {
      await repository.update({
        requireMembership: true,
        allowedCorpIds: [corpIdWithNoAlliance],
      });

      const isAllowed = await repository.isCharacterAllowed(
        characterWithNoAlliance.corpId,
        characterWithNoAlliance.allianceId,
      );

      expect(isAllowed).toBe(true);
    });

    it('should deny character when corp is in denied list', async () => {
      await repository.update({
        requireMembership: true,
        allowedCorpIds: [corpIdWithNoAlliance],
        deniedCorpIds: [corpIdWithNoAlliance],
      });

      const isAllowed = await repository.isCharacterAllowed(
        characterWithNoAlliance.corpId,
        characterWithNoAlliance.allianceId,
      );

      expect(isAllowed).toBe(false);
    });

    it('should not check alliance lists when character has no alliance', async () => {
      await repository.update({
        requireMembership: true,
        allowedCorpIds: [corpIdWithNoAlliance],
        allowedAllianceIds: [99999999n], // Some alliance ID that doesn't matter
      });

      const isAllowed = await repository.isCharacterAllowed(
        characterWithNoAlliance.corpId,
        characterWithNoAlliance.allianceId,
      );

      expect(isAllowed).toBe(true);
    });

    it('should handle multiple allowed corps including the character corp', async () => {
      await repository.update({
        requireMembership: true,
        allowedCorpIds: [11111111n, corpIdWithNoAlliance, 22222222n],
      });

      const isAllowed = await repository.isCharacterAllowed(
        characterWithNoAlliance.corpId,
        characterWithNoAlliance.allianceId,
      );

      expect(isAllowed).toBe(true);
    });
  });
});

describe('AuthConfigRepository - Character with Corp and Alliance', () => {
  const corpId = 12345678n;
  const allianceId = 99001234n;
  const characterWithAlliance = {
    corpId,
    allianceId,
  };

  beforeEach(async () => {
    await repository.update({ requireMembership: true });
  });

  it('should allow character when corp is in allowed list', async () => {
    await repository.update({
      requireMembership: true,
      allowedCorpIds: [corpId],
    });

    const isAllowed = await repository.isCharacterAllowed(
      characterWithAlliance.corpId,
      characterWithAlliance.allianceId,
    );

    expect(isAllowed).toBe(true);
  });

  it('should allow character when alliance is in allowed list', async () => {
    await repository.update({
      requireMembership: true,
      allowedAllianceIds: [allianceId],
    });

    const isAllowed = await repository.isCharacterAllowed(
      characterWithAlliance.corpId,
      characterWithAlliance.allianceId,
    );

    expect(isAllowed).toBe(true);
  });

  it('should allow character when either corp or alliance is in allowed list', async () => {
    await repository.update({
      requireMembership: true,
      allowedCorpIds: [corpId],
      allowedAllianceIds: [allianceId],
    });

    const isAllowed = await repository.isCharacterAllowed(
      characterWithAlliance.corpId,
      characterWithAlliance.allianceId,
    );

    expect(isAllowed).toBe(true);
  });

  it('should deny character when corp is in denied list even if alliance is allowed', async () => {
    await repository.update({
      requireMembership: true,
      allowedAllianceIds: [allianceId],
      deniedCorpIds: [corpId],
    });

    const isAllowed = await repository.isCharacterAllowed(
      characterWithAlliance.corpId,
      characterWithAlliance.allianceId,
    );

    expect(isAllowed).toBe(false);
  });

  it('should deny character when alliance is in denied list even if corp is allowed', async () => {
    await repository.update({
      requireMembership: true,
      allowedCorpIds: [corpId],
      deniedAllianceIds: [allianceId],
    });

    const isAllowed = await repository.isCharacterAllowed(
      characterWithAlliance.corpId,
      characterWithAlliance.allianceId,
    );

    expect(isAllowed).toBe(false);
  });

  it('should deny character when neither corp nor alliance is in allowed lists', async () => {
    await repository.update({
      requireMembership: true,
      allowedCorpIds: [11111111n],
      allowedAllianceIds: [99999999n],
    });

    const isAllowed = await repository.isCharacterAllowed(
      characterWithAlliance.corpId,
      characterWithAlliance.allianceId,
    );

    expect(isAllowed).toBe(false);
  });
});

describe('AuthConfigRepository - Deny List Priority', () => {
  const corpId = 12345678n;
  const allianceId = 99001234n;

  beforeEach(async () => {
    await repository.update({ requireMembership: true });
  });

  it('should prioritize deny list over allow list for corporations', async () => {
    await repository.update({
      requireMembership: true,
      allowedCorpIds: [corpId],
      deniedCorpIds: [corpId],
    });

    const isAllowed = await repository.isCharacterAllowed(corpId, allianceId);

    expect(isAllowed).toBe(false);
  });

  it('should prioritize deny list over allow list for alliances', async () => {
    await repository.update({
      requireMembership: true,
      allowedAllianceIds: [allianceId],
      deniedAllianceIds: [allianceId],
    });

    const isAllowed = await repository.isCharacterAllowed(corpId, allianceId);

    expect(isAllowed).toBe(false);
  });
});

describe('AuthConfigRepository - Add/Remove Operations', () => {
  const corpId = 12345678n;
  const allianceId = 99001234n;

  it('should add corporation to allowed list', async () => {
    await repository.addAllowedCorp(corpId);
    const config = await repository.get();

    // pg-mem returns numbers, not bigints in arrays
    const hasCorpId = config.allowedCorpIds.some((id) => BigInt(id) === corpId);
    expect(hasCorpId).toBe(true);
  });

  it('should not duplicate corporations in allowed list', async () => {
    await repository.addAllowedCorp(corpId);
    await repository.addAllowedCorp(corpId);
    const config = await repository.get();

    const count = config.allowedCorpIds.filter((id) => BigInt(id) === corpId).length;
    expect(count).toBe(1);
  });

  it('should remove corporation from allowed list', async () => {
    await repository.addAllowedCorp(corpId);
    await repository.removeAllowedCorp(corpId);
    const config = await repository.get();

    const hasCorpId = config.allowedCorpIds.some((id) => BigInt(id) === corpId);
    expect(hasCorpId).toBe(false);
  });

  it('should add alliance to allowed list', async () => {
    await repository.addAllowedAlliance(allianceId);
    const config = await repository.get();

    const hasAllianceId = config.allowedAllianceIds.some((id) => BigInt(id) === allianceId);
    expect(hasAllianceId).toBe(true);
  });

  it('should remove alliance from allowed list', async () => {
    await repository.addAllowedAlliance(allianceId);
    await repository.removeAllowedAlliance(allianceId);
    const config = await repository.get();

    const hasAllianceId = config.allowedAllianceIds.some((id) => BigInt(id) === allianceId);
    expect(hasAllianceId).toBe(false);
  });

  it('should handle string and number inputs for corp IDs', async () => {
    await repository.addAllowedCorp('12345678');
    await repository.addAllowedCorp(87654321);
    const config = await repository.get();

    const hasFirstCorp = config.allowedCorpIds.some((id) => BigInt(id) === 12345678n);
    const hasSecondCorp = config.allowedCorpIds.some((id) => BigInt(id) === 87654321n);
    expect(hasFirstCorp).toBe(true);
    expect(hasSecondCorp).toBe(true);
  });
});

describe('AuthConfigRepository - Real World Scenario', () => {
  // Based on the actual log showing Commander Tyrael trying to authenticate
  const commanderTyraelCorpId = 98560621n; // Violence is the Answer
  const commanderTyraelAllianceId = null; // No alliance

  it('should deny Commander Tyrael when requireMembership is true and corp not allowed', async () => {
    await repository.update({
      requireMembership: true,
      allowedCorpIds: [],
      allowedAllianceIds: [],
    });

    const isAllowed = await repository.isCharacterAllowed(
      commanderTyraelCorpId,
      commanderTyraelAllianceId,
    );

    expect(isAllowed).toBe(false);
  });

  it('should allow Commander Tyrael when requireMembership is false', async () => {
    await repository.update({
      requireMembership: false,
    });

    const isAllowed = await repository.isCharacterAllowed(
      commanderTyraelCorpId,
      commanderTyraelAllianceId,
    );

    expect(isAllowed).toBe(true);
  });

  it('should allow Commander Tyrael when corp is added to allowed list', async () => {
    await repository.update({
      requireMembership: true,
    });
    await repository.addAllowedCorp(commanderTyraelCorpId);

    const isAllowed = await repository.isCharacterAllowed(
      commanderTyraelCorpId,
      commanderTyraelAllianceId,
    );

    expect(isAllowed).toBe(true);
  });

  it('should deny Commander Tyrael when corp is in deny list', async () => {
    await repository.update({
      requireMembership: true,
      allowedCorpIds: [commanderTyraelCorpId],
      deniedCorpIds: [commanderTyraelCorpId],
    });

    const isAllowed = await repository.isCharacterAllowed(
      commanderTyraelCorpId,
      commanderTyraelAllianceId,
    );

    expect(isAllowed).toBe(false);
  });
});
