import { expect, test } from '@playwright/test';
import { fakeMic } from './helpers';

test.use(fakeMic('rec-once.wav'));

test('records a sample: explain → countdown → chant → auto-stop → review → keep', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('You’ll chant the mantra once. Recording stops when you go quiet.')).toBeVisible();
  await page.getByRole('button', { name: 'Record a sample' }).click();
  await expect(page.getByText('Your browser will ask to use the microphone')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Stay quiet…')).toBeVisible();
  await expect(page.getByText('Chant once now.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Keep' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByTestId('sample-row')).toHaveCount(1);
  await expect(page.getByTestId('sample-row')).toContainText(/Sample 1\s+\d\.\d s/);
  await page.reload();
  await expect(page.getByTestId('sample-row')).toHaveCount(1);
});
