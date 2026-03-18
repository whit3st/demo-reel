import { test } from '@playwright/test';
import { runE2E } from './e2e.adapter';
import { e2eConfig } from './e2e.config';

test('config-driven e2e', async ({ page }) => {
  await runE2E(page, e2eConfig);
});
