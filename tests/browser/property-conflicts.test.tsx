import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { ConflictDialog, type ConflictResolution } from '../../src/client/ConflictDialog.js';
import type { MapState } from '../../src/shared/map.js';
import '../../src/client/styles.css';
import '../../src/client/workspace.css';

const type = { id: 'thing', householdId: 'home', revision: 1, name: 'Sak', description: '' };
const before = {
  id: 'bike',
  householdId: 'home',
  revision: 1,
  typeId: type.id,
  name: 'Cykeln',

  properties: [
    { id: 'a', label: 'Samma', kind: 'number' as const, value: 1 },
    { id: 'b', label: 'Samma', kind: 'text' as const, value: 'Tidigare' },
    { id: 'c', label: 'Samma', kind: 'boolean' as const, value: true },
  ],
};
const current = {
  ...before,
  revision: 2,
  properties: [
    { id: 'b', label: 'Samma', kind: 'text' as const, value: 'Sparad ändring' },
    { id: 'a', label: 'Samma', kind: 'boolean' as const, value: false },
    { id: 'c', label: 'Samma', kind: 'boolean' as const, value: false },
    { id: 'other', label: 'Annans tillägg' },
  ],
};
const state: MapState = {
  userId: 'alex',
  contentVersion: 1,
  types: [type],
  relationshipTypes: [],
  relationships: [],
  objects: [current],
  draft: {
    version: 3,
    changes: [
      {
        id: 'bike',
        before,
        type,
        after: {
          ...before,
          properties: [
            { id: 'a', label: 'Egen etikett', kind: 'number', value: 1 },
            before.properties[2],
            before.properties[1],
            { id: 'own', label: 'Eget tillägg' },
          ],
        },
      },
    ],
  },
};
afterEach(cleanup);

test('UTKAST-153: distinguish equal labels and combine property and order choices with a keyboard', async () => {
  await page.viewport(320, 900);
  const resolutions: ConflictResolution[] = [];
  let closed = false;
  render(
    <main className="household-map workspace-shell" data-theme="light">
      <ConflictDialog
        state={state}
        open
        disabled={false}
        onClose={() => {
          closed = true;
        }}
        onResolve={async (resolution) => {
          resolutions.push(resolution);
        }}
        onRefresh={async () => state}
      />
    </main>,
  );
  const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
  await expect
    .element(dialog.getByRole('heading', { name: 'Granska konflikter', exact: true }))
    .toHaveFocus();
  const apply = dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true });
  await expect.element(apply).toBeDisabled();
  const saved = dialog.getByRole('region', { name: 'Sparat i kartan nu', exact: true });
  const proposed = dialog.getByRole('region', { name: 'Ditt förslag', exact: true });
  await expect
    .element(
      saved.getByRole('button', {
        name: 'Samma · egenskap 1: Sparat i kartan nu – Samma: Nej (Ja/nej)',
        exact: true,
      }),
    )
    .toBeVisible();
  const own = proposed.getByRole('button', {
    name: 'Egen etikett · egenskap 1: Ditt förslag – Egen etikett: 1 (Tal)',
    exact: true,
  });
  await expect.element(own.getByText('Tidigare: Samma: 1 (Tal)', { exact: true })).toBeVisible();
  await expect.element(own).toBeEnabled();
  (own.element() as HTMLElement).focus();
  await expect.element(own).toHaveFocus();
  await userEvent.keyboard('{Enter}');
  await expect.element(own).toHaveAttribute('aria-pressed', 'true');
  // The other equal-label property is independently identifiable and merges automatically.
  expect(proposed.element().textContent).toContain('Samma · egenskap 2');
  expect(saved.element().textContent).toContain('Sparad ändring');
  expect(proposed.element().textContent).toContain('Tidigare');
  await expect.element(apply).toBeDisabled();
  const order = proposed.getByRole('button', { name: /^Egenskapernas ordning:/ });
  await expect.element(order).toBeEnabled();
  (order.element() as HTMLElement).focus();
  await expect.element(order).toHaveFocus();
  await userEvent.keyboard(' ');
  const preview = dialog.getByRole('region', { name: 'Resultat av valen', exact: true });
  await expect.element(apply).toBeEnabled();
  expect(preview.element().textContent).toContain('Egen etikett: 1 (Tal)');
  expect(preview.element().textContent).toContain('Sparad ändring');
  expect(preview.element().textContent).toContain('Nej (Ja/nej)');
  expect(preview.element().textContent).toContain('Annans tillägg');
  expect(preview.element().textContent).toContain('Eget tillägg');
  expect(preview.element().textContent).not.toContain('Välj ett värde');
  await expect.element(apply).toBeEnabled();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
  const comparison = dialog.element().querySelector('.cp-comparison');
  if (!comparison) throw new Error('Expected conflict comparison');
  expect(comparison.scrollWidth).toBeLessThanOrEqual(comparison.clientWidth);
  (apply.element() as HTMLElement).focus();
  await userEvent.keyboard('{Enter}');
  expect(resolutions).toHaveLength(1);
  expect(resolutions[0].choices).toEqual({
    'properties.a': 'proposed',
    propertiesOrder: 'proposed',
  });
  await expect
    .element(dialog.getByRole('status'))
    .toHaveTextContent('Valen finns i ditt utkast. Kartan sparas separat.');
  await userEvent.keyboard('{Escape}');
  expect(closed).toBe(true);
});
