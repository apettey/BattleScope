import { Page } from '@playwright/test';

/**
 * Helper to create an authenticated session by mocking the API response
 */
export async function mockAuthSession(page: Page, accountData?: any) {
  const defaultAccountData = {
    account: {
      id: 'test-account-id',
      email: null,
      display_name: 'Test Character',
      is_super_admin: false,
      last_login_at: new Date().toISOString(),
      primary_character_id: 'char-1',
    },
    characters: [
      {
        id: 'char-1',
        character_id: 12345,
        character_name: 'Test Character',
        corp_id: 98765,
        corp_name: 'Test Corp',
        alliance_id: 55555,
        alliance_name: 'Test Alliance',
        portrait_url: 'https://images.evetech.net/characters/12345/portrait',
        is_primary: true,
        created_at: new Date().toISOString(),
      },
    ],
    primary_character: {
      id: 'char-1',
      character_id: 12345,
      character_name: 'Test Character',
      corp_id: 98765,
      corp_name: 'Test Corp',
      portrait_url: 'https://images.evetech.net/characters/12345/portrait',
      is_primary: true,
      created_at: new Date().toISOString(),
    },
    roles: ['user'],
    permissions: [],
  };

  const data = accountData || defaultAccountData;

  await page.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });
}

/**
 * Helper to mock unauthenticated state
 */
export async function mockUnauthenticated(page: Page) {
  await page.route('**/api/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unauthorized' }),
    });
  });
}

/**
 * Helper to mock character list API
 */
export async function mockCharactersList(page: Page, characters: any[]) {
  await page.route('**/api/me/characters', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ characters }),
    });
  });
}

/**
 * Helper to mock set primary character API
 */
export async function mockSetPrimary(page: Page, shouldSucceed = true) {
  await page.route('**/api/me/characters/primary', async (route) => {
    if (shouldSucceed) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Character not found' }),
      });
    }
  });
}

/**
 * Helper to mock delete character API
 */
export async function mockDeleteCharacter(page: Page, shouldSucceed = true) {
  await page.route('**/api/me/characters/*', async (route) => {
    if (route.request().method() === 'DELETE') {
      if (shouldSucceed) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Cannot remove primary character' }),
        });
      }
    } else {
      await route.continue();
    }
  });
}
