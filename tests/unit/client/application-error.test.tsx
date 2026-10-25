import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { ApplicationError } from '../../../src/client/ApplicationError.js';

function FailingScreen() {
  const [fail, setFail] = useState(false);
  if (fail) throw new Error('Synthetic private error details');
  return (
    <button type="button" onClick={() => setFail(true)}>
      Trigger rendering failure
    </button>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('a rendering failure shows Swedish recovery guidance and moves keyboard focus into the fallback', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const router = createMemoryRouter([
    { path: '*', element: <FailingScreen />, ErrorBoundary: ApplicationError },
  ]);
  try {
    render(<RouterProvider router={router} />);
    await userEvent.click(screen.getByRole('button', { name: 'Trigger rendering failure' }));
    const heading = await screen.findByRole('heading', { name: 'Något gick fel i Skyttel' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByRole('main').textContent).toContain('Ladda om sidan för att försöka igen.');
    expect(document.body.textContent).not.toMatch(
      /Synthetic private error details|ErrorBoundary|errorElement|Unexpected Application Error|at FailingScreen/,
    );
    expect(screen.queryByRole('button', { name: 'Trigger rendering failure' })).toBeNull();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ladda om Skyttel' }));
  } finally {
    router.dispose();
  }
});
