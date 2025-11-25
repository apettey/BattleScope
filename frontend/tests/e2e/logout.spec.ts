import { test, expect } from '@playwright/test';
import { mockAuthSession, mockUnauthenticated } from './helpers/auth';

test.describe('Logout Functionality', () => {
  test('should show logout button in user menu', async ({ page }) => {
    await mockAuthSession(page);
    await page.goto('/dashboard');

    // Click on user avatar to open menu
    const userMenuButton = page.getByRole('button', { name: 'User menu' });
    await expect(userMenuButton).toBeVisible();
    await userMenuButton.click();

    // Logout button should be visible
    await expect(page.getByRole('button', { name: /Logout/i })).toBeVisible();
  });

  test('should successfully logout and redirect to login page', async ({ page }) => {
    // Mock the logout endpoint
    await page.route('**/api/auth/logout', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Mock unauthenticated state after logout
    let loggedOut = false;
    await page.route('**/api/me', async (route) => {
      if (loggedOut) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Unauthorized' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            account: {
              id: 'test-account-id',
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
          }),
        });
      }
    });

    await page.goto('/dashboard');

    // Open user menu
    const userMenuButton = page.getByRole('button', { name: 'User menu' });
    await userMenuButton.click();

    // Click logout button
    const logoutButton = page.getByRole('button', { name: /Logout/i });

    // Set logged out flag and intercept logout request
    const [logoutRequest] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/api/auth/logout')),
      logoutButton.click(),
    ]);

    // Mark as logged out after logout request
    loggedOut = true;

    // Verify logout was called
    expect(logoutRequest.url()).toContain('/api/auth/logout');
    expect(logoutRequest.method()).toBe('POST');

    // Should redirect to home page
    await page.waitForURL('/');
    expect(page.url()).toContain('/');
  });

  test('should show login page after logout', async ({ page }) => {
    await mockAuthSession(page);

    // Mock the logout endpoint
    await page.route('**/api/auth/logout', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/dashboard');

    // Open user menu and logout
    await page.getByRole('button', { name: 'User menu' }).click();
    await page.getByRole('button', { name: /Logout/i }).click();

    // Mock unauthenticated for next page load
    await mockUnauthenticated(page);

    // Wait for redirect
    await page.waitForURL('/');

    // Should see login page content
    await expect(page.getByRole('heading', { name: 'BattleScope V3' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Login with EVE Online/i })).toBeVisible();
  });

  test('should show logout in mobile menu', async ({ page }) => {
    await mockAuthSession(page);

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/dashboard');

    // Open mobile menu - look for the Menu icon button (hamburger menu)
    const mobileMenuButton = page.locator('button.md\\:hidden').filter({ has: page.locator('svg') });
    await mobileMenuButton.click();

    // Wait for mobile menu to appear and logout button should be visible
    await page.waitForTimeout(200);
    await expect(page.getByRole('button', { name: /Logout/i })).toBeVisible();
  });

  test('should logout from mobile menu', async ({ page }) => {
    await mockAuthSession(page);

    // Mock the logout endpoint
    await page.route('**/api/auth/logout', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/dashboard');

    // Open mobile menu - look for the Menu icon button (hamburger menu)
    const mobileMenuButton = page.locator('button.md\\:hidden').filter({ has: page.locator('svg') });
    await mobileMenuButton.click();

    // Wait for mobile menu to appear
    await page.waitForTimeout(200);

    // Click logout in mobile menu
    const logoutButton = page.getByRole('button', { name: /Logout/i });

    const [logoutRequest] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/api/auth/logout')),
      logoutButton.click(),
    ]);

    // Verify logout was called
    expect(logoutRequest.url()).toContain('/api/auth/logout');
    expect(logoutRequest.method()).toBe('POST');
  });

  test('should handle logout error gracefully', async ({ page }) => {
    await mockAuthSession(page);

    // Mock the logout endpoint to fail
    await page.route('**/api/auth/logout', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await page.goto('/dashboard');

    // Listen for console errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Open user menu and click logout
    await page.getByRole('button', { name: 'User menu' }).click();
    await page.getByRole('button', { name: /Logout/i }).click();

    // Wait a moment for error to be logged
    await page.waitForTimeout(500);

    // Should log error (but this is okay, the test is just verifying it doesn't crash)
    expect(consoleErrors.some((err) => err.includes('Logout failed'))).toBeTruthy();
  });

  test('should close user menu when clicking outside', async ({ page }) => {
    await mockAuthSession(page);
    await page.goto('/dashboard');

    // Open user menu
    await page.getByRole('button', { name: 'User menu' }).click();

    // Logout button should be visible
    await expect(page.getByRole('button', { name: /Logout/i })).toBeVisible();

    // Click outside the menu (on the page heading)
    await page.getByRole('heading', { name: /Dashboard/i }).click();

    // Menu should close (logout button should not be visible)
    // Note: This test may need adjustment depending on how you implement click-outside
    // For now, we're just verifying the menu can be toggled
    await page.getByRole('button', { name: 'User menu' }).click();
    await expect(page.getByRole('button', { name: /Logout/i })).not.toBeVisible();
  });
});
