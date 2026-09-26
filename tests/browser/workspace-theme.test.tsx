import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import { useWorkspaceTheme, WorkspaceTheme } from '../../src/client/WorkspaceTheme.js';
import '../../src/client/styles.css';

function ThemeWorkbench() {
  const theme = useWorkspaceTheme();
  return (
    <section aria-label="Arbetsyta" data-theme={theme.theme}>
      <WorkspaceTheme mode={theme.mode} onChange={theme.changeMode} />
      <button type="button">Fortsätt arbeta</button>
    </section>
  );
}

afterEach(async () => {
  cleanup();
  localStorage.removeItem('skyttel-theme');
  await cdp().send('Emulation.setEmulatedMedia', { features: [] });
});

test('theme preferences persist and System follows a changed device preference', async () => {
  const device = cdp();
  await device.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }],
  });
  render(<ThemeWorkbench />);
  const workspace = page.getByRole('region', { name: 'Arbetsyta', exact: true });
  const button = page.getByRole('button', { name: /^Tema:/ });
  await expect.element(workspace).toHaveAttribute('data-theme', 'light');
  await button.click();
  await page.getByRole('radio', { name: 'Mörkt', exact: true }).click();
  await expect.element(button).toHaveFocus();
  await expect.element(workspace).toHaveAttribute('data-theme', 'dark');
  cleanup();
  render(<ThemeWorkbench />);
  await expect.element(button).toHaveAccessibleName('Tema: Mörkt. Byt tema');
  await expect.element(workspace).toHaveAttribute('data-theme', 'dark');
  await button.click();
  await page.getByRole('radio', { name: 'Ljust', exact: true }).click();
  await expect.element(workspace).toHaveAttribute('data-theme', 'light');
  cleanup();
  render(<ThemeWorkbench />);
  await expect.element(button).toHaveAccessibleName('Tema: Ljust. Byt tema');
  await button.click();
  await page.getByRole('radio', { name: 'System', exact: true }).click();
  await device.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'dark' }],
  });
  await expect.element(workspace).toHaveAttribute('data-theme', 'dark');
  await device.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'light' }],
  });
  await expect.element(workspace).toHaveAttribute('data-theme', 'light');
});

test('theme choice and Escape restore focus while Tab and pointer can leave the popup', async () => {
  render(<ThemeWorkbench />);
  const button = page.getByRole('button', { name: /^Tema:/ });
  const popup = page.getByRole('dialog', { name: 'Tema', exact: true });
  await button.click();
  await expect.element(page.getByRole('radio', { name: 'System', exact: true })).toHaveFocus();
  await userEvent.keyboard('{Escape}');
  await expect.element(popup).not.toBeInTheDocument();
  await expect.element(button).toHaveFocus();
  await button.click();
  await page.getByRole('radio', { name: 'System', exact: true }).click();
  await expect.element(popup).not.toBeInTheDocument();
  await expect.element(button).toHaveFocus();
  await button.click();
  await userEvent.keyboard('{Tab}');
  await expect.element(page.getByRole('button', { name: 'Fortsätt arbeta' })).toHaveFocus();
  await expect.element(popup).not.toBeInTheDocument();
  await button.click();
  await page
    .getByRole('region', { name: 'Arbetsyta', exact: true })
    .click({ position: { x: 1, y: 1 } });
  await expect.element(popup).not.toBeInTheDocument();
});
