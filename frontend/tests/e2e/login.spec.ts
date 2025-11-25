import { test, expect } from '@playwright/test';
import { mockUnauthenticated, mockAuthSession } from './helpers/auth';

test.describe('Login Page', () => {
  test('should display login page when not authenticated', async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto('/');

    // Check that the page displays BattleScope branding
    await expect(page.getByRole('heading', { name: 'BattleScope V3' })).toBeVisible();
    await expect(page.getByText('EVE Online Battle Intelligence')).toBeVisible();

    // Check for login button
    const loginButton = page.getByRole('button', { name: /Login with EVE Online/i });
    await expect(loginButton).toBeVisible();
  });

  test('should display feature list on login page', async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto('/');

    // Check for feature descriptions
    await expect(page.getByText('Real-time killmail feed and battle clustering')).toBeVisible();
    await expect(page.getByText('Detailed battle reports with timelines')).toBeVisible();
    await expect(page.getByText('Advanced search and filtering')).toBeVisible();
    await expect(page.getByText('Custom notifications and watchlists')).toBeVisible();
  });

  test('should redirect to /api/auth/login when clicking login button', async ({ page }) => {
    await mockUnauthenticated(page);

    // Mock the auth/login redirect
    await page.route('**/api/auth/login', async (route) => {
      // Simulate EVE SSO redirect
      await route.fulfill({
        status: 302,
        headers: {
          Location: 'https://login.eveonline.com/oauth/authorize?...',
        },
      });
    });

    await page.goto('/');

    const loginButton = page.getByRole('button', { name: /Login with EVE Online/i });

    // Intercept the navigation to verify it goes to the right URL
    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/api/auth/login')),
      loginButton.click(),
    ]);

    expect(request.url()).toContain('/api/auth/login');
  });

  test('should redirect to dashboard when already authenticated', async ({ page }) => {
    await mockAuthSession(page);

    // Navigation should automatically redirect to dashboard
    await page.goto('/');

    // Wait for redirect
    await page.waitForURL('**/dashboard');
    expect(page.url()).toContain('/dashboard');
  });

  test('should show loading spinner during authentication check', async ({ page }) => {
    // Delay the auth response to show loading state
    await page.route('**/api/me', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      });
    });

    await page.goto('/');

    // Loading spinner should be visible briefly
    const spinner = page.locator('[data-testid="loading-spinner"], .animate-spin').first();
    await expect(spinner).toBeVisible();

    // Then login page content should appear
    await expect(page.getByRole('heading', { name: 'BattleScope V3' })).toBeVisible();
  });

  test('should display security information footer', async ({ page }) => {
    await mockUnauthenticated(page);
    await page.goto('/');

    // Check for security/privacy information
    await expect(page.getByText(/BattleScope V3 uses EVE Online Single Sign-On/i)).toBeVisible();
    await expect(page.getByText(/No passwords are stored/i)).toBeVisible();
    await expect(page.getByText(/We only access public character information/i)).toBeVisible();
  });
});
