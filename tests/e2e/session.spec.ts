import { expect, test } from '@playwright/test';
import { fakeMic, seedSamples } from './helpers';

test.use(fakeMic('stream-20.wav'));

test('counts 20 continuous chants, chimes at the target and saves history', async ({ page }) => {
  await page.goto('/');
  await seedSamples(page, ['sample-1.wav', 'sample-2.wav', 'sample-3.wav']);
  await expect(page.getByTestId('sample-row')).toHaveCount(3);
  await page.getByLabel('Target').fill('20');
  await page.getByRole('button', { name: 'Start' }).click();
  const session = page.getByTestId('session');
  await expect(session).toHaveAttribute('data-phase', 'live', { timeout: 15_000 });
  await expect(session).toHaveAttribute('data-phase', 'done', { timeout: 150_000 });
  await expect(session).toHaveAttribute('data-count', '20');
  await expect(session).toHaveAttribute('data-chimed', 'true');
  await expect(page.getByTestId('summary')).toContainText('20 chants');
  await page.keyboard.press('a');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText(/20 \/ 20/)).toBeVisible();
});
