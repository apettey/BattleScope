import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountRepository } from '../../src/repositories/auth/account-repository.js';
import { createTestDatabase, type TestDatabase } from '../test-db.js';

describe('AccountRepository - SuperAdmin Management', () => {
  let testDb: TestDatabase | undefined;
  let repository: AccountRepository;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    repository = new AccountRepository(testDb.db);
  });

  afterAll(async () => {
    if (testDb) {
      await testDb.destroy();
    }
  });
  let testAccountId: string;
  let superAdminId: string;

  beforeEach(async () => {
    // Create a regular account
    const account = await repository.create({
      displayName: 'Test User',
      email: 'test@example.com',
    });
    testAccountId = account.id;

    // Create a SuperAdmin account
    const superAdmin = await repository.create({
      displayName: 'Super Admin',
      email: 'admin@example.com',
      isSuperAdmin: true,
    });
    superAdminId = superAdmin.id;
  });

  describe('promoteToSuperAdmin', () => {
    it('should promote regular account to SuperAdmin', async () => {
      await repository.promoteToSuperAdmin(testAccountId);

      const account = await repository.getById(testAccountId);
      expect(account?.isSuperAdmin).toBe(true);
    });

    it('should be idempotent when promoting already SuperAdmin account', async () => {
      await repository.promoteToSuperAdmin(superAdminId);

      const account = await repository.getById(superAdminId);
      expect(account?.isSuperAdmin).toBe(true);
    });
  });

  describe('demoteFromSuperAdmin', () => {
    it('should demote SuperAdmin to regular account', async () => {
      await repository.demoteFromSuperAdmin(superAdminId);

      const account = await repository.getById(superAdminId);
      expect(account?.isSuperAdmin).toBe(false);
    });

    it('should be idempotent when demoting regular account', async () => {
      await repository.demoteFromSuperAdmin(testAccountId);

      const account = await repository.getById(testAccountId);
      expect(account?.isSuperAdmin).toBe(false);
    });
  });

  describe('countSuperAdmins', () => {
    it('should return correct count of SuperAdmins', async () => {
      const count = await repository.countSuperAdmins();
      expect(count).toBe(1); // Only the superAdmin created in beforeEach
    });

    it('should update count after promoting account', async () => {
      await repository.promoteToSuperAdmin(testAccountId);

      const count = await repository.countSuperAdmins();
      expect(count).toBe(2);
    });

    it('should update count after demoting account', async () => {
      await repository.demoteFromSuperAdmin(superAdminId);

      const count = await repository.countSuperAdmins();
      expect(count).toBe(0);
    });

    it('should not count deleted accounts', async () => {
      await repository.delete(superAdminId);

      const count = await repository.countSuperAdmins();
      expect(count).toBe(0);
    });
  });
});

describe('AccountRepository - getDetailWithCharactersGrouped', () => {
  let testDb: TestDatabase | undefined;
  let repository: AccountRepository;
  let accountId: string;
  let char1Id: string;
  let char2Id: string;
  let char3Id: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    repository = new AccountRepository(testDb.db);
  });

  afterAll(async () => {
    if (testDb) {
      await testDb.destroy();
    }
  });

  beforeAll(async () => {
    // Create test account
    const account = await repository.create({
      displayName: 'Multi-Character User',
      email: 'multichar@example.com',
    });
    accountId = account.id;

    // Create characters in different corps/alliances
    // Character 1: Goonswarm Federation - Amok.
    const char1 = await testDb!.db
      .insertInto('characters')
      .values({
        accountId,
        eveCharacterId: 123456789n,
        eveCharacterName: 'Main Character',
        corpId: 98000001n,
        corpName: 'Amok.',
        allianceId: 99000001n,
        allianceName: 'Goonswarm Federation',
        portraitUrl: 'https://images.evetech.net/characters/123456789/portrait',
        esiAccessToken: Buffer.from('encrypted_token_1'),
        esiRefreshToken: Buffer.from('encrypted_refresh_1'),
        esiTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        scopes: ['publicData', 'esi-killmails.read_killmails.v1'],
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    char1Id = char1.id as unknown as string;

    // Set as primary character
    await repository.update(accountId, { primaryCharacterId: char1Id });

    // Character 2: Goonswarm Federation - Karmafleet
    const char2 = await testDb!.db
      .insertInto('characters')
      .values({
        accountId,
        eveCharacterId: 987654321n,
        eveCharacterName: 'Alt Character',
        corpId: 98000002n,
        corpName: 'Karmafleet',
        allianceId: 99000001n,
        allianceName: 'Goonswarm Federation',
        portraitUrl: 'https://images.evetech.net/characters/987654321/portrait',
        esiAccessToken: Buffer.from('encrypted_token_2'),
        esiRefreshToken: Buffer.from('encrypted_refresh_2'),
        esiTokenExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days (expiring)
        scopes: ['publicData'],
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    char2Id = char2.id as unknown as string;

    // Character 3: No alliance - NPC corp
    const char3 = await testDb!.db
      .insertInto('characters')
      .values({
        accountId,
        eveCharacterId: 111222333n,
        eveCharacterName: 'NPC Corp Alt',
        corpId: 1000008n,
        corpName: 'Perkone',
        allianceId: null,
        allianceName: null,
        portraitUrl: 'https://images.evetech.net/characters/111222333/portrait',
        esiAccessToken: Buffer.from('encrypted_token_3'),
        esiRefreshToken: Buffer.from('encrypted_refresh_3'),
        esiTokenExpiresAt: new Date(Date.now() - 1000), // Expired
        scopes: ['publicData'],
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    char3Id = char3.id as unknown as string;
  });

  it('should return null for non-existent account', async () => {
    const result = await repository.getDetailWithCharactersGrouped('00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });

  it('should return account with no characters', async () => {
    const emptyAccount = await repository.create({
      displayName: 'Empty Account',
      email: 'empty@example.com',
    });

    const result = await repository.getDetailWithCharactersGrouped(emptyAccount.id);

    expect(result).not.toBeNull();
    expect(result!.account.id).toBe(emptyAccount.id);
    expect(result!.primaryCharacter).toBeNull();
    expect(result!.charactersGrouped).toHaveLength(0);
    expect(result!.stats.totalCharacters).toBe(0);
  });

  it('should group characters by alliance and corporation', async () => {
    const result = await repository.getDetailWithCharactersGrouped(accountId);

    expect(result).not.toBeNull();
    expect(result!.account.id).toBe(accountId);
    expect(result!.stats.totalCharacters).toBe(3);

    // Should have 2 alliance groups (Goonswarm + null)
    expect(result!.charactersGrouped).toHaveLength(2);

    // Find Goonswarm alliance group
    const goonswarm = result!.charactersGrouped.find((a) => a.allianceName === 'Goonswarm Federation');
    expect(goonswarm).toBeDefined();
    expect(goonswarm!.corporations).toHaveLength(2); // Amok. and Karmafleet

    // Find Amok. corp
    const amok = goonswarm!.corporations.find((c) => c.corpName === 'Amok.');
    expect(amok).toBeDefined();
    expect(amok!.characters).toHaveLength(1);
    expect(amok!.characters[0].eveCharacterName).toBe('Main Character');
    expect(amok!.characters[0].isPrimary).toBe(true);

    // Find Karmafleet corp
    const kflt = goonswarm!.corporations.find((c) => c.corpName === 'Karmafleet');
    expect(kflt).toBeDefined();
    expect(kflt!.characters).toHaveLength(1);
    expect(kflt!.characters[0].eveCharacterName).toBe('Alt Character');
    expect(kflt!.characters[0].isPrimary).toBe(false);

    // Find no-alliance group
    const noAlliance = result!.charactersGrouped.find((a) => a.allianceId === null);
    expect(noAlliance).toBeDefined();
    expect(noAlliance!.corporations).toHaveLength(1);
    expect(noAlliance!.corporations[0].corpName).toBe('Perkone');
    expect(noAlliance!.corporations[0].characters).toHaveLength(1);
    expect(noAlliance!.corporations[0].characters[0].eveCharacterName).toBe('NPC Corp Alt');
  });

  it('should correctly identify primary character', async () => {
    const result = await repository.getDetailWithCharactersGrouped(accountId);

    expect(result!.primaryCharacter).not.toBeNull();
    expect(result!.primaryCharacter!.id).toBe(char1Id);
    expect(result!.primaryCharacter!.eveCharacterName).toBe('Main Character');
    expect(result!.primaryCharacter!.isPrimary).toBe(true);
  });

  it('should correctly determine token status', async () => {
    const result = await repository.getDetailWithCharactersGrouped(accountId);

    // Find characters by name
    const allCharacters = result!.charactersGrouped.flatMap((a) =>
      a.corporations.flatMap((c) => c.characters),
    );

    const mainChar = allCharacters.find((c) => c.eveCharacterName === 'Main Character');
    expect(mainChar!.tokenStatus).toBe('valid'); // 30 days

    const altChar = allCharacters.find((c) => c.eveCharacterName === 'Alt Character');
    expect(altChar!.tokenStatus).toBe('expiring'); // 5 days < 7

    const npcChar = allCharacters.find((c) => c.eveCharacterName === 'NPC Corp Alt');
    expect(npcChar!.tokenStatus).toBe('expired'); // Past expiry
  });

  it('should include character scopes', async () => {
    const result = await repository.getDetailWithCharactersGrouped(accountId);

    const mainChar = result!.charactersGrouped
      .flatMap((a) => a.corporations.flatMap((c) => c.characters))
      .find((c) => c.eveCharacterName === 'Main Character');

    expect(mainChar!.scopes).toEqual(['publicData', 'esi-killmails.read_killmails.v1']);
  });

  it('should return BigInt IDs as strings', async () => {
    const result = await repository.getDetailWithCharactersGrouped(accountId);

    const mainChar = result!.charactersGrouped
      .flatMap((a) => a.corporations.flatMap((c) => c.characters))
      .find((c) => c.eveCharacterName === 'Main Character');

    expect(typeof mainChar!.eveCharacterId).toBe('string');
    expect(mainChar!.eveCharacterId).toBe('123456789');
    expect(typeof mainChar!.corpId).toBe('string');
    expect(typeof mainChar!.allianceId).toBe('string');
  });
});
