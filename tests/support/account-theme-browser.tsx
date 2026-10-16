import type { ReactNode } from 'react';
import { useAccountTheme, WorkspaceThemeContext } from '../../src/client/WorkspaceTheme.js';
import type { ThemeMode } from '../../src/shared/theme-preference.js';

/** Exercise the real account-theme hook against a controlled HTTP boundary.
 * This supports browser presentation checks, never durable server storage. */
export function createAccountThemeFixture(userId: string) {
  let mode: ThemeMode = 'system';
  return {
    Boundary({ children }: { children: ReactNode }) {
      const theme = useAccountTheme(userId);
      return <WorkspaceThemeContext value={theme}>{children}</WorkspaceThemeContext>;
    },
    respond(init?: RequestInit) {
      if (init?.method === 'POST') mode = JSON.parse(String(init.body)).mode;
      return Response.json({ userId, mode });
    },
  };
}
