import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * End-to-end checks for the calling screen at 3440×1440 (docs/call-view-prompt.md).
 *
 * Runs `next start` against a throwaway JSON store: Supabase credentials are
 * blanked so the app can never touch live data, and PPC_DATA_DIR points at a
 * fresh temp directory so data/db.json is never touched either. Build first:
 *
 *   npm run build && npm run test:e2e
 */
const PORT = 3010;
const dataDir = process.env.PPC_E2E_DATA_DIR ?? mkdtempSync(join(tmpdir(), 'ppc-e2e-'));

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 3440, height: 1440 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/unlock`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', PPC_DATA_DIR: dataDir },
  },
});
