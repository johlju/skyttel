import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { DraftReview } from '../../src/client/DraftReview.js';
import type { MapState, RelationshipChange } from '../../src/shared/map.js';
import '../../src/client/styles.css';
import '../../src/client/workspace.css';

afterEach(async () => {
  cleanup();
  await page.viewport(1280, 720);
});

test('suppressed new relationship reader names both removal causes and retained values with keyboard focus', {
  tags: ['technical'],
}, async () => {
  await page.viewport(320, 900);
  const type = { id: 'uses', householdId: 'home', revision: 1, name: 'Använder', description: '' };
  const original: RelationshipChange = {
    id: 'new',
    before: null,
    after: {
      typeId: type.id,
      sourceId: 'lo',
      targetId: 'service',

      properties: [
        { id: 'one', label: 'Samma', kind: 'boolean', value: false },
        { id: 'two', label: 'Samma', kind: 'number', value: 0 },
      ],
    },
    type,
    objectNames: { lo: 'Lo Exempel', service: 'Molnmusik' },
  };
  const state: MapState = {
    userId: 'alex',
    contentVersion: 1,
    types: [],
    objects: [],
    relationshipTypes: [type],
    relationships: [],
    draft: {
      version: 2,
      changes: [],
      relationships: [
        { ...original, after: null, removedWithObjects: ['lo', 'service'], suppressed: original },
      ],
    },
  };
  render(
    <main className="household-map workspace-shell" data-theme="light">
      <DraftReview state={state} onRemove={() => {}} />
    </main>,
  );
  const open = page.getByRole('button', {
    name: 'Visa förslaget: Lo Exempel → Använder → Molnmusik',
    exact: true,
  });
  await expect
    .element(page.getByText('Följer objektborttagning: Lo Exempel, Molnmusik.', { exact: true }))
    .toBeVisible();
  await userEvent.tab();
  await expect.element(open).toHaveFocus();
  await userEvent.keyboard('{Enter}');
  const dialog = page.getByRole('dialog', {
    name: 'Lo Exempel → Använder → Molnmusik',
    exact: true,
  });
  await expect
    .element(
      dialog.getByRole('heading', { name: 'Lo Exempel → Använder → Molnmusik', exact: true }),
    )
    .toHaveFocus();
  const retained = dialog.getByRole('region', {
    name: 'Följder av objektborttagning',
    exact: true,
  });
  await expect
    .element(retained.getByRole('heading', { name: 'Bevarat sambandsförslag', exact: true }))
    .toBeVisible();
  await expect.element(retained.getByText('Nej (Ja/nej)', { exact: true })).toBeVisible();
  await expect.element(retained.getByText('0 (Tal)', { exact: true })).toBeVisible();
  expect(
    [...document.querySelectorAll('dialog section[aria-label] dd')]
      .map((entry) => entry.textContent)
      .slice(-2),
  ).toEqual(['Nej (Ja/nej)', '0 (Tal)']);
  const element = document.querySelector('dialog');
  expect(element && element.scrollWidth <= element.clientWidth).toBe(true);
  await userEvent.keyboard('{Escape}');
  await expect.element(open).toHaveFocus();
});
