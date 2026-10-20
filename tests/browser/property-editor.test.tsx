import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { ObjectDialog } from '../../src/client/ObjectDialog.js';
import type { ObjectEditor } from '../../src/client/object-editor.js';
import type { MapState } from '../../src/shared/map.js';
import type { Property } from '../../src/shared/properties.js';
import '../../src/client/styles.css';
import '../../src/client/workspace.css';

const type = { id: 'cycle', householdId: 'home', revision: 1, name: 'Cykel', description: '' };

/** Controlled staging boundary; SQLite durability is covered by integration/HTTP tests. */
async function open(properties: Property[], width = 1280) {
  await page.viewport(width, 900);
  const staged: ObjectEditor[] = [];
  const dirty: boolean[] = [];
  const initial: ObjectEditor = {
    id: 'bike',
    version: 0,
    contentVersion: 1,
    baseRevision: 1,
    typeRevision: 1,
    value: { typeId: 'cycle', name: 'Cykeln', identity: 'unspecified', properties },
  };
  render(
    <main className="household-map workspace-shell" data-theme="light">
      <ObjectDialog
        initial={initial}
        active
        isNew={false}
        householdId="home"
        types={[type]}
        onStage={async (editor) => {
          staged.push(editor);
          return { version: 1, changes: [] };
        }}
        onCheck={async (): Promise<MapState> => ({
          userId: 'alex',
          contentVersion: 1,
          types: [type],
          objects: [],
          relationshipTypes: [],
          relationships: [],
          draft: { version: 0, changes: [] },
        })}
        onClose={() => {}}
        onDirty={(value) => dirty.push(value)}
        onConfirmed={() => {}}
      />
    </main>,
  );
  const dialog = page.getByRole('dialog', { name: 'Redigera Cykeln', exact: true });
  await dialog.getByRole('button', { name: 'Fria egenskaper', exact: true }).click();
  return { dialog, staged, dirty };
}
const row = (index: number) => page.getByRole('group', { name: `Egenskap ${index}`, exact: true });
const stage = () =>
  page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();

afterEach(async () => {
  cleanup();
  await page.viewport(1280, 720);
});

for (const scenario of [
  {
    title: 'number',
    kind: 'number',
    raw: 'Gratis idag',
    corrected: '0',
    expected: { kind: 'number', value: 0 },
  },
  {
    title: 'date',
    kind: 'date',
    raw: '2026-02-30',
    corrected: '2026-02-28',
    expected: { kind: 'date', value: '2026-02-28' },
  },
  {
    title: 'boolean',
    kind: 'boolean',
    raw: 'Inte bestämt',
    corrected: 'false',
    expected: { kind: 'boolean', value: false },
  },
  { title: 'untyped', kind: '', raw: 'Bevara texten', corrected: null, expected: {} },
  {
    title: 'empty text to number',
    kind: 'number',
    raw: '',
    corrected: null,
    expected: { kind: 'number' },
  },
  {
    title: 'long text',
    kind: 'text',
    raw: 'x'.repeat(10001),
    corrected: 'Rättad text',
    expected: { kind: 'text', value: 'Rättad text' },
  },
]) {
  test(`invalid ${scenario.title} input retains raw text and blocks the parent form from staging accepted old values`, {
    tags: ['technical'],
  }, async () => {
    const original = scenario.title === 'long text' ? 'Kort text' : scenario.raw;
    const { dialog, staged, dirty } = await open([
      { id: 'memo', label: 'Anteckning', kind: 'text', value: original },
    ]);
    const property = row(1);
    if (scenario.title === 'long text')
      await property.getByLabelText('Värde', { exact: true }).fill(scenario.raw);
    else await property.getByLabelText('Datatyp', { exact: true }).selectOptions(scenario.kind);
    await stage();
    await expect
      .element(dialog.getByRole('alert', { name: 'Formuläret innehåller fel', exact: true }))
      .toHaveFocus();
    expect(staged).toEqual([]);
    expect(dirty.at(-1)).toBe(true);
    await expect
      .element(property.getByLabelText('Värde', { exact: true }))
      .toHaveValue(scenario.raw);
    await expect
      .element(property.getByLabelText('Datatyp', { exact: true }))
      .toHaveAttribute('aria-invalid', 'true');
    await userEvent.keyboard('{Escape}');
    const leave = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
    await expect
      .element(leave.getByRole('button', { name: 'Fortsätt redigera', exact: true }))
      .toHaveFocus();
    await leave.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
    await expect
      .element(property.getByLabelText('Värde', { exact: true }))
      .toHaveValue(scenario.raw);
    if (scenario.corrected === null)
      await property.getByRole('button', { name: 'Töm värdet', exact: true }).click();
    else if (scenario.kind === 'boolean')
      await property.getByLabelText('Värde', { exact: true }).selectOptions(scenario.corrected);
    else await property.getByLabelText('Värde', { exact: true }).fill(scenario.corrected);
    await stage();
    expect(staged).toHaveLength(1);
    expect(staged[0].value).toMatchObject({
      name: 'Cykeln',
      identity: 'unspecified',
      properties: [{ id: 'memo', label: 'Anteckning', ...scenario.expected }],
    });
    if (scenario.corrected === null)
      expect(staged[0].value.properties?.[0]).not.toHaveProperty('value');
  });
}

test('keyboard ordering and separate clear/delete actions preserve identities, focus and announced positions at 320px', {
  tags: ['technical'],
}, async () => {
  const { staged } = await open(
    [
      { id: 'text', label: 'Samma', kind: 'text' },
      { id: 'zero', label: 'Samma', kind: 'number', value: 0 },
      { id: 'no', label: 'Samma', kind: 'boolean', value: false },
      { id: 'date', label: 'Datum', kind: 'date', value: '2026-01-01' },
      { id: 'untyped', label: 'Tomt' },
    ],
    320,
  );
  row(2).getByRole('button', { name: 'Flytta upp', exact: true }).element().focus();
  await userEvent.keyboard('{Enter}');
  await expect.element(row(1).getByLabelText('Etikett', { exact: true })).toHaveFocus();
  await expect.element(row(1).getByLabelText('Värde', { exact: true })).toHaveValue('0');
  await expect
    .element(page.getByRole('status', { name: 'Egenskapernas ordning', exact: true }))
    .toHaveTextContent('Samma har position 1 av 5.');
  await row(1).getByRole('button', { name: 'Flytta ned', exact: true }).click();
  await expect.element(row(2).getByLabelText('Etikett', { exact: true })).toHaveFocus();
  await row(2).getByRole('button', { name: 'Töm värdet', exact: true }).click();
  await expect.element(row(2).getByLabelText('Etikett', { exact: true })).toHaveValue('Samma');
  await expect.element(row(2).getByLabelText('Datatyp', { exact: true })).toHaveValue('number');
  await expect.element(row(2).getByLabelText('Värde', { exact: true })).toHaveValue('');
  await row(2).getByRole('button', { name: 'Ta bort egenskapen', exact: true }).click();
  await expect.element(row(2).getByLabelText('Etikett', { exact: true })).toHaveFocus();
  await expect.element(row(2).getByLabelText('Värde', { exact: true })).toHaveValue('false');
  await row(2).getByLabelText('Värde', { exact: true }).selectOptions('true');
  await row(2).getByLabelText('Värde', { exact: true }).selectOptions('');
  await row(2).getByLabelText('Värde', { exact: true }).selectOptions('false');
  await row(2).getByRole('button', { name: 'Töm värdet', exact: true }).click();
  await row(3).getByLabelText('Värde', { exact: true }).fill('');
  await row(1).getByRole('button', { name: 'Ange tom text', exact: true }).click();
  await expect
    .element(row(1).getByRole('button', { name: 'Ange tom text', exact: true }))
    .not.toBeInTheDocument();
  await expect.element(row(4).getByLabelText('Värde', { exact: true })).toBeDisabled();
  await stage();
  expect(staged[0].value.properties).toEqual([
    { id: 'text', label: 'Samma', kind: 'text', value: '' },
    { id: 'no', label: 'Samma', kind: 'boolean' },
    { id: 'date', label: 'Datum', kind: 'date' },
    { id: 'untyped', label: 'Tomt' },
  ]);
});

test('new blank labels block staging and deleting the last row returns focus to add without altering existing form work', {
  tags: ['technical'],
}, async () => {
  const { staged } = await open([]);
  const add = page.getByRole('button', { name: 'Lägg till egenskap', exact: true });
  await add.click();
  await expect.element(row(1).getByLabelText('Etikett', { exact: true })).toHaveFocus();
  await stage();
  expect(staged).toEqual([]);
  await row(1).getByLabelText('Etikett', { exact: true }).fill(' ');
  await expect.element(row(1).getByRole('alert')).toHaveTextContent('Ange en etikett.');
  await row(1).getByRole('button', { name: 'Ta bort egenskapen', exact: true }).click();
  await expect.element(add).toHaveFocus();
  await expect
    .element(page.getByRole('status', { name: 'Egenskapernas ordning', exact: true }))
    .toHaveTextContent('Egenskap 1 är borttagen. 0 egenskaper finns kvar.');
  await add.click();
  await row(1).getByLabelText('Etikett', { exact: true }).fill('Beskrivning');
  await row(1).getByLabelText('Datatyp', { exact: true }).selectOptions('text');
  await row(1).getByLabelText('Värde', { exact: true }).fill('Nytt eget värde');
  await stage();
  expect(staged).toHaveLength(1);
  expect(staged[0].value.properties).toEqual([
    { id: expect.any(String), label: 'Beskrivning', kind: 'text', value: 'Nytt eget värde' },
  ]);
  expect(staged[0].value.identity).toBe('unspecified');
});
