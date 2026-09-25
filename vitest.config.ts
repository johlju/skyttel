import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'graphics',
          include: ['tests/browser/**/*.test.tsx'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['tests/unit/server/**/*.test.ts', 'tests/unit/shared/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['tests/unit/client/**/*.test.tsx'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { statements: 85, lines: 85, branches: 90, functions: 85 },
    },
  },
});
