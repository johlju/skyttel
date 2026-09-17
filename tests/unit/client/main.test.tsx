import { screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

test('the browser entry point mounts the application in its page root', async () => {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 'anonymous', providers: ['google', 'microsoft'] })),
  );
  await import('../../../src/client/main.js');
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeDefined(),
  );
  expect(screen.getByRole('button', { name: 'Fortsätt med Google' })).toBeDefined();
});
