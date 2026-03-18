import { defineConfig } from '@playwright/test';
import { e2eConfig } from './tests/e2e.config';

const videoSetting = e2eConfig.video.enabled
  ? { mode: 'on', size: e2eConfig.video.size }
  : 'off';

export default defineConfig({
  testDir: './tests',
  reporter: 'list',
  outputDir: 'test-results',
  use: {
    viewport: e2eConfig.viewport,
    video: videoSetting
  }
});
