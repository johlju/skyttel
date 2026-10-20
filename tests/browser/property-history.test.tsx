import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { HistoricalMergeDetails } from '../../src/client/HistoricalMergeDetails.js';
import { MapHistory } from '../../src/client/MapHistory.js';
import type { MapObject, ObjectType, SaveReceipt } from '../../src/shared/map.js';
import type { Property } from '../../src/shared/properties.js';
import '../../src/client/styles.css';
import '../../src/client/workspace.css';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('historical merge review preserves object and relationship properties and type meanings', {
  tags: ['technical'],
}, async () => {
  await page.viewport(320, 850);
  const properties: Property[] = [
    { id: 'zero', label: 'Samma', kind: 'number', value: 0 },
    { id: 'false', label: 'Samma', kind: 'boolean', value: false },
  ];
  const type: ObjectType = {
    id: 'plant',
    householdId: 'home',
    revision: 1,
    name: 'Växt',
    description: 'Odling i hemmet',
  };
  render(
    <main className="household-map workspace-shell" data-theme="light">
      <HistoricalMergeDetails
        merge={{
          survivorId: 'rose',
          absorbedId: 'other',
          identityConfirmed: true,
          objects: [
            {
              id: 'rose',
              householdId: 'home',
              revision: 1,
              typeId: 'plant',
              name: 'Rosen',

              properties,
            },
          ],
          types: [type],
          relationships: [
            {
              id: 'edge',
              householdId: 'home',
              revision: 1,
              typeId: 'supports',
              sourceId: 'lo',
              targetId: 'rose',

              properties,
            },
          ],
          relationshipTypes: [
            {
              id: 'supports',
              householdId: 'home',
              revision: 1,
              name: 'Stödjer',
              description: 'Hjälp vid odling',
              forwardLabel: 'stödjer',
              reverseLabel: 'stöds av',
            },
          ],
          objectNames: { lo: 'Lo', rose: 'Rosen' },
        }}
      />
    </main>,
  );
  const disclosure = page.getByText('Granskade objekt före sammanslagningen', { exact: true });
  disclosure.element().focus();
  await userEvent.keyboard('{Enter}');
  const lists = page.getByRole('list', { name: 'Egenskaper i sparad ordning', exact: true });
  expect(lists.elements()).toHaveLength(2);
  for (const list of lists.elements())
    expect([...list.children].map((item) => item.textContent)).toEqual([
      'Samma: 0 (Tal)Identitet: zero',
      'Samma: Nej (Ja/nej)Identitet: false',
    ]);
  await expect
    .element(page.getByText('Typens beskrivning: Odling i hemmet', { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText('Typens beskrivning: Hjälp vid odling', { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByText('Benämning från målobjektet: stöds av', { exact: true }))
    .toBeVisible();
  expect(document.documentElement.scrollWidth <= window.innerWidth).toBe(true);
});

test('UTKAST-157: read ordered historical property identities and meanings with keyboard at 320px', async () => {
  await page.viewport(320, 850);
  const properties: Property[] = [
    { id: 'zero', label: 'Samma', kind: 'number', value: 0 },
    { id: 'false', label: 'Samma', kind: 'boolean', value: false },
    { id: 'typed-empty', label: 'Väntar', kind: 'date' },
    { id: 'untyped', label: 'Väntar' },
    { id: 'blank', label: 'Anteckning', kind: 'text', value: '' },
  ];
  const after: Property[] = [
    properties[1],
    { id: 'zero', label: 'Antal', kind: 'text', value: 'Noll' },
    properties[3],
    properties[2],
  ];
  const type: ObjectType = {
    id: 'plant',
    householdId: 'home',
    revision: 1,
    name: 'Växt',
    description: 'Odling i hemmet',
  };
  const object: MapObject = {
    id: 'rose',
    householdId: 'home',
    revision: 1,
    typeId: 'plant',
    name: 'Rosen',

    properties,
  };
  const edgeType = {
    id: 'supports',
    householdId: 'home',
    revision: 1,
    name: 'Stödjer',
    description: 'Hjälp vid odling',
    forwardLabel: 'stödjer',
    reverseLabel: 'stöds av',
  };
  const receipt: SaveReceipt = {
    operationId: 'properties-changed',
    householdId: 'home',
    userId: 'alex',
    contentVersion: 1,
    draftVersion: 3,
    savedAt: '2026-10-18T12:00:00.000Z',
    actorName: 'Alex Exempel',
    changes: [
      {
        before: object,
        after: { ...object, revision: 2, properties: after },
        beforeType: type,
        type: { ...type, revision: 2, description: 'Prydnadsväxter' },
      },
    ],
    relationships: [
      {
        id: 'edge',
        beforeType: edgeType,
        type: {
          ...edgeType,
          revision: 2,
          description: 'Dagens omvårdnad',
          forwardLabel: 'vårdar',
          reverseLabel: 'vårdas av',
        },
        objectNames: { lo: 'Lo', rose: 'Rosen' },
        before: {
          id: 'edge',
          householdId: 'home',
          revision: 1,
          typeId: 'supports',
          sourceId: 'lo',
          targetId: 'rose',

          properties,
        },
        after: {
          id: 'edge',
          householdId: 'home',
          revision: 2,
          typeId: 'supports',
          sourceId: 'lo',
          targetId: 'rose',

          properties: after,
        },
      },
    ],
  };
  vi.stubGlobal('fetch', async () => Response.json({ history: [receipt] }));
  render(
    <main className="household-map workspace-shell" data-theme="light">
      <MapHistory
        path="/api/households/home/map"
        active
        version={1}
        onSelect={() => {}}
        onAccessLost={() => {}}
      />
    </main>,
  );
  const article = page.getByRole('article');
  await expect
    .poll(() => article.getByRole('heading', { level: 3 }).element().textContent)
    .toContain('Alex Exempel');
  const summary = article.getByText('Visa ändringarna', { exact: true });
  summary.element().focus();
  await userEvent.keyboard('{Enter}');
  await expect.element(summary).toHaveFocus();
  const lists = article.getByRole('list', { name: 'Egenskaper i sparad ordning', exact: true });
  await expect.poll(() => lists.elements().length).toBe(4);
  const beforeText = [
    'Samma: 0 (Tal)Identitet: zero',
    'Samma: Nej (Ja/nej)Identitet: false',
    'Väntar: Tomt (Datum)Identitet: typed-empty',
    'Väntar: Tomt (ingen datatyp)Identitet: untyped',
    'Anteckning: Tom text (Text)Identitet: blank',
  ];
  for (const index of [0, 2])
    expect([...lists.elements()[index].children].map((item) => item.textContent)).toEqual(
      beforeText,
    );
  for (const index of [1, 3])
    expect([...lists.elements()[index].children].map((item) => item.textContent)).toEqual([
      beforeText[1],
      'Antal: Noll (Text)Identitet: zero',
      beforeText[3],
      beforeText[2],
    ]);
  for (const meaning of [
    'Odling i hemmet',
    'Prydnadsväxter',
    'Hjälp vid odling',
    'Dagens omvårdnad',
  ])
    await expect
      .element(article.getByText(`Typens beskrivning: ${meaning}`, { exact: true }))
      .toBeVisible();
  for (const label of ['stöds av', 'vårdas av'])
    await expect
      .element(article.getByText(`Benämning från målobjektet: ${label}`, { exact: true }))
      .toBeVisible();
  await expect.element(article.getByText('Lo → stödjer → Rosen', { exact: true })).toBeVisible();
  await expect
    .element(article.getByText('Lo → vårdar → Rosen', { exact: true }).last())
    .toBeVisible();
  expect(document.documentElement.scrollWidth <= window.innerWidth).toBe(true);
});
