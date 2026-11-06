import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        // Test-only values; the real ones are secrets set with `wrangler secret put`.
        bindings: {
          SHARING_KEY: 'test-sharing-key',
          R2_ACCOUNT_ID: 'testaccount',
          R2_BUCKET_NAME: 'immersia-360-videos',
          R2_ACCESS_KEY_ID: 'AKIATESTKEY',
          R2_SECRET_ACCESS_KEY: 'test-secret-access-key',
        },
      },
    }),
  ],
});
