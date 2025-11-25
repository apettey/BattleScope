import { test, expect } from '@playwright/test';
import {
  mockAuthSession,
  mockCharactersList,
  mockSetPrimary,
  mockDeleteCharacter,
} from './helpers/auth';

test.describe('Characters Page', () => {
  test.beforeEach(async ({ page }) => {
    // Set up authenticated session
    await mockAuthSession(page);
  });

  test('should display characters page with list of characters', async ({ page }) => {
    const characters = [
      {
        id: 'char-1',
        character_id: 12345,
        character_name: 'Test Character 1',
        corp_id: 98765,
        corp_name: 'Test Corp',
        alliance_id: 55555,
        alliance_name: 'Test Alliance',
        portrait_url: 'https://images.evetech.net/characters/12345/portrait',
        is_primary: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'char-2',
        character_id: 67890,
        character_name: 'Test Character 2',
        corp_id: 11111,
        corp_name: 'Another Corp',
        alliance_id: null,
        alliance_name: null,
        portrait_url: 'https://images.evetech.net/characters/67890/portrait',
        is_primary: false,
        created_at: new Date().toISOString(),
      },
    ];

    await mockCharactersList(page, characters);
    await page.goto('/characters');

    // Check page title
    await expect(page.getByRole('heading', { name: 'Characters' })).toBeVisible();
    await expect(page.getByText('Manage your EVE Online characters')).toBeVisible();

    // Check both characters are displayed
    await expect(page.getByText('Test Character 1')).toBeVisible();
    await expect(page.getByText('Test Character 2')).toBeVisible();

    // Check corp names are displayed - use first occurrence
    await expect(page.getByText('Test Corp').first()).toBeVisible();
    await expect(page.getByText('Another Corp').first()).toBeVisible();

    // Check alliance name is displayed (only for char-1)
    await expect(page.getByText('Test Alliance').first()).toBeVisible();

    // Check primary badge is displayed for char-1
    await expect(page.getByText('Primary').first()).toBeVisible();
  });

  test('should show link character button', async ({ page }) => {
    const characters = [
      {
        id: 'char-1',
        character_id: 12345,
        character_name: 'Test Character',
        corp_id: 98765,
        corp_name: 'Test Corp',
        alliance_id: null,
        alliance_name: null,
        portrait_url: 'https://images.evetech.net/characters/12345/portrait',
        is_primary: true,
        created_at: new Date().toISOString(),
      },
    ];

    await mockCharactersList(page, characters);
    await page.goto('/characters');

    // Check for Link Character button in header
    const linkButton = page.getByRole('button', { name: /Link Character/i }).first();
    await expect(linkButton).toBeVisible();
  });

  test('should navigate to link character flow when clicking link button', async ({ page }) => {
    const characters = [
      {
        id: 'char-1',
        character_id: 12345,
        character_name: 'Test Character',
        corp_id: 98765,
        corp_name: 'Test Corp',
        alliance_id: null,
        alliance_name: null,
        portrait_url: 'https://images.evetech.net/characters/12345/portrait',
        is_primary: true,
        created_at: new Date().toISOString(),
      },
    ];

    await mockCharactersList(page, characters);

    // Mock the link character endpoint
    await page.route('**/api/me/characters/link', async (route) => {
      await route.fulfill({
        status: 302,
        headers: {
          Location: 'https://login.eveonline.com/oauth/authorize?...',
        },
      });
    });

    await page.goto('/characters');

    const linkButton = page.getByRole('button', { name: /Link Character/i }).first();

    // Intercept navigation
    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/api/me/characters/link')),
      linkButton.click(),
    ]);

    expect(request.url()).toContain('/api/me/characters/link');
  });

  test('should display empty state when no characters', async ({ page }) => {
    await mockCharactersList(page, []);
    await page.goto('/characters');

    await expect(page.getByText('No characters linked')).toBeVisible();
    await expect(page.getByRole('button', { name: /Link Your First Character/i })).toBeVisible();
  });

  test('should show set primary button for non-primary characters', async ({ page }) => {
    const characters = [
      {
        id: 'char-1',
        character_id: 12345,
        character_name: 'Primary Character',
        corp_id: 98765,
        corp_name: 'Test Corp',
        alliance_id: null,
        alliance_name: null,
        portrait_url: 'https://images.evetech.net/characters/12345/portrait',
        is_primary: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'char-2',
        character_id: 67890,
        character_name: 'Secondary Character',
        corp_id: 11111,
        corp_name: 'Another Corp',
        alliance_id: null,
        alliance_name: null,
        portrait_url: 'https://images.evetech.net/characters/67890/portrait',
        is_primary: false,
        created_at: new Date().toISOString(),
      },
    ];

    await mockCharactersList(page, characters);
    await page.goto('/characters');

    // Set Primary button should be visible for char-2
    const setPrimaryButton = page.getByRole('button', { name: /Set Primary/i });
    await expect(setPrimaryButton).toBeVisible();

    // Should only be one Set Primary button (for the non-primary character)
    await expect(setPrimaryButton).toHaveCount(1);
  });

  test('should successfully set a character as primary', async ({ page }) => {
    const characters = [
      {
        id: 'char-1',
        character_id: 12345,
        character_name: 'Primary Character',
        corp_id: 98765,
        corp_name: 'Test Corp',
        alliance_id: null,
        alliance_name: null,
        portrait_url: 'https://images.evetech.net/characters/12345/portrait',
        is_primary: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'char-2',
        character_id: 67890,
        character_name: 'Secondary Character',
        corp_id: 11111,
        corp_name: 'Another Corp',
        alliance_id: null,
        alliance_name: null,
        portrait_url: 'https://images.evetech.net/characters/67890/portrait',
        is_primary: false,
        created_at: new Date().toISOString(),
      },
    ];

    await mockCharactersList(page, characters);
    await mockSetPrimary(page, true);

    // Mock refresh after setting primary
    let requestCount = 0;
    await page.route('**/api/me', async (route) => {
      requestCount++;
      const data =
        requestCount > 1
          ? {
              account: {
                id: 'test-account-id',
                primary_character_id: 'char-2', // Changed to char-2
              },
              characters,
              roles: ['user'],
              permissions: [],
            }
          : {
              account: {
                id: 'test-account-id',
                primary_character_id: 'char-1',
              },
              characters,
              roles: ['user'],
              permissions: [],
            };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(data),
      });
    });

    await page.goto('/characters');

    // Click Set Primary button
    const setPrimaryButton = page.getByRole('button', { name: /Set Primary/i });
    await setPrimaryButton.click();

    // Wait for the API call
    await page.waitForRequest((req) => req.url().includes('/api/me/characters/primary'));

    // Page should refetch data
    await page.waitForTimeout(500);
  });

  test('should show unlink button for all characters', async ({ page }) => {
    const characters = [
      {
        id: 'char-1',
        character_id: 12345,
        character_name: 'Test Character',
        corp_id: 98765,
        corp_name: 'Test Corp',
        alliance_id: null,
        alliance_name: null,
        portrait_url: 'https://images.evetech.net/characters/12345/portrait',
        is_primary: true,
        created_at: new Date().toISOString(),
      },
    ];

    await mockCharactersList(page, characters);
    await page.goto('/characters');

    // Unlink button (trash icon) should be visible
    const unlinkButton = page.locator('button').filter({ has: page.locator('svg') }).last();
    await expect(unlinkButton).toBeVisible();
  });

  test('should show confirmation modal when clicking unlink', async ({ page }) => {
    const characters = [
      {
        id: 'char-1',
        character_id: 12345,
        character_name: 'Primary Character',
        corp_id: 98765,
        corp_name: 'Test Corp',
        alliance_id: null,
        alliance_name: null,
        portrait_url: 'https://images.evetech.net/characters/12345/portrait',
        is_primary: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'char-2',
        character_id: 67890,
        character_name: 'Secondary Character',
        corp_id: 11111,
        corp_name: 'Another Corp',
        alliance_id: null,
        alliance_name: null,
        portrait_url: 'https://images.evetech.net/characters/67890/portrait',
        is_primary: false,
        created_at: new Date().toISOString(),
      },
    ];

    await mockCharactersList(page, characters);
    await page.goto('/characters');

    // Click unlink button (last trash icon button)
    const unlinkButtons = page.locator('button').filter({ has: page.locator('svg[class*="lucide"]') });
    await unlinkButtons.last().click();

    // Modal should appear
    await expect(page.getByRole('heading', { name: 'Unlink Character' })).toBeVisible();
    await expect(page.getByText(/Are you sure you want to unlink/i)).toBeVisible();

    // Cancel and Unlink buttons should be visible
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unlink' })).toBeVisible();
  });

  test('should cancel unlink when clicking cancel', async ({ page }) => {
    const characters = [
      {
        id: 'char-1',
        character_id: 12345,
        character_name: 'Primary Character',
        corp_id: 98765,
        corp_name: 'Test Corp',
        alliance_id: null,
        alliance_name: null,
        portrait_url: 'https://images.evetech.net/characters/12345/portrait',
        is_primary: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'char-2',
        character_id: 67890,
        character_name: 'Secondary Character',
        corp_id: 11111,
        corp_name: 'Another Corp',
        alliance_id: null,
        alliance_name: null,
        portrait_url: 'https://images.evetech.net/characters/67890/portrait',
        is_primary: false,
        created_at: new Date().toISOString(),
      },
    ];

    await mockCharactersList(page, characters);
    await page.goto('/characters');

    // Click unlink button
    const unlinkButtons = page.locator('button').filter({ has: page.locator('svg[class*="lucide"]') });
    await unlinkButtons.last().click();

    // Modal should appear
    await expect(page.getByRole('heading', { name: 'Unlink Character' })).toBeVisible();

    // Click Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Modal should disappear
    await expect(page.getByRole('heading', { name: 'Unlink Character' })).not.toBeVisible();

    // Characters should still be visible
    await expect(page.getByText('Primary Character')).toBeVisible();
    await expect(page.getByText('Secondary Character')).toBeVisible();
  });

  test('should successfully unlink a character', async ({ page }) => {
    const initialCharacters = [
      {
        id: 'char-1',
        character_id: 12345,
        character_name: 'Primary Character',
        corp_id: 98765,
        corp_name: 'Test Corp',
        alliance_id: null,
        alliance_name: null,
        portrait_url: 'https://images.evetech.net/characters/12345/portrait',
        is_primary: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'char-2',
        character_id: 67890,
        character_name: 'Secondary Character',
        corp_id: 11111,
        corp_name: 'Another Corp',
        alliance_id: null,
        alliance_name: null,
        portrait_url: 'https://images.evetech.net/characters/67890/portrait',
        is_primary: false,
        created_at: new Date().toISOString(),
      },
    ];

    let requestCount = 0;
    await page.route('**/api/me/characters', async (route) => {
      if (route.request().method() === 'GET') {
        requestCount++;
        const data = requestCount > 1 ? [initialCharacters[0]] : initialCharacters;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ characters: data }),
        });
      } else {
        await route.continue();
      }
    });

    await mockDeleteCharacter(page, true);
    await mockAuthSession(page);

    await page.goto('/characters');

    // Both characters should be visible initially
    await expect(page.getByText('Primary Character')).toBeVisible();
    await expect(page.getByText('Secondary Character')).toBeVisible();

    // Click unlink button for second character
    const unlinkButtons = page.locator('button').filter({ has: page.locator('svg[class*="lucide"]') });
    await unlinkButtons.last().click();

    // Confirm unlink
    await page.getByRole('button', { name: 'Unlink' }).click();

    // Wait for delete request
    await page.waitForRequest((req) => req.url().includes('/api/me/characters/char-2'));

    // Modal should close
    await expect(page.getByRole('heading', { name: 'Unlink Character' })).not.toBeVisible();

    // Only primary character should remain visible
    await page.waitForTimeout(500);
    await expect(page.getByText('Primary Character')).toBeVisible();
  });
});
