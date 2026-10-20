import type { APIRequestContext, Page } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openDraftReview,
  openMap,
  openNewObject,
  openTable,
  setAllLabels,
  signIn,
  utilityButton,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { closeConversationText, openConversationDraft } from '../support/conversation-page.js';
import {
  editObjectRelationship,
  editTableObject,
  openObjectRelationships,
  readTableObject,
} from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { includeEndedInMap } from '../support/object-search.js';
import { propertyRow, setProperty } from '../support/property-controls.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { readRemovalProposals } from '../support/removal-reading.js';
import { expect, test } from '../support/test.js';

async function arrange(client: APIRequestContext, origin: string) {
  await signIn(client, origin);
  const { household } = await (await createHousehold(client, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await client.get(path)).json();
  const post = (route: string, data: unknown) =>
    client.post(`${path}/${route}`, { headers: { origin }, data });
  const state = await read();
  for (const [id, name, type] of [
    ['subscription', 'Familjemusik', 'Abonnemang'],
    ['person', 'Lo Exempel', 'Person'],
    ['service', 'Molnmusik', 'Tjänst'],
  ]) {
    expect(
      (
        await post('draft', {
          version: (await read()).draft.version,
          id,
          baseRevision: null,
          value: { name, typeId: state.types.find((item) => item.name === type)?.id },
        })
      ).ok(),
    ).toBe(true);
  }
  for (const [id, sourceId, targetId] of [
    ['incoming', 'person', 'subscription'],
    ['outgoing', 'subscription', 'service'],
  ]) {
    expect(
      (
        await post('relationship', {
          version: (await read()).draft.version,
          id,
          baseRevision: null,
          value: {
            sourceId,
            targetId,
            typeId: state.relationshipTypes.find((item) => item.name === 'Använder')?.id,
          },
        })
      ).ok(),
    ).toBe(true);
  }
  const save = async () =>
    post('save', { version: (await read()).draft.version, operationId: crypto.randomUUID() });
  expect((await save()).ok()).toBe(true);
  return { read, post, save, path };
}

async function includeEndedInTable(page: Page) {
  await page
    .getByRole('region', { name: 'Tabellens sökning och filter' })
    .getByRole('button', { name: /^Filter/ })
    .click();
  const filters = page.getByRole('dialog', { name: 'Tabellens filter', exact: true });
  await filters.getByLabel('Ta med upphörda').check();
  await filters.getByRole('button', { name: 'Stäng filter', exact: true }).click();
}

async function stageIndependentLifecycleWork(page: Page) {
  const form = await openNewObject(page);
  await form.getByLabel('Namn', { exact: true }).fill('Privat livscykelanteckning');
  await form.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Person' });
  await setProperty(form, 'Beskrivning', 'Hela mitt oberoende privata arbete');
  await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
}

test('LIVSCYKEL-01: ended objects and relationships stay visible and independently correctable', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read } = await arrange(page.request, installation.origin);
    await page.goto(installation.origin);
    await openTable(page);
    await includeEndedInTable(page);
    const objects = page.getByRole('table');
    const subscription = objects
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: 'Familjemusik', exact: true }) });
    await editTableObject(page, 'Familjemusik');
    await page.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    await page.getByLabel('Objektets status').selectOption('ended');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(subscription).toContainText('Upphört');
    const endedColor = await subscription
      .getByText('Upphört', { exact: true })
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    const proposalColor = await subscription
      .locator('[data-kind="Ändrat"]')
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(endedColor).not.toBe(proposalColor);
    expect((await read()).objects.find((item) => item.id === 'subscription')).not.toHaveProperty(
      'lifecycle',
    );
    await openDraftReview(page);
    await readRemovalProposals(page, await read());
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    await openTable(page);
    await includeEndedInTable(page);
    await expect(subscription).toContainText('Upphört');
    await expect(
      objects
        .getByRole('row')
        .filter({ has: page.getByRole('button', { name: 'Lo Exempel', exact: true }) }),
    ).not.toContainText('Upphört');
    const edges = await openObjectRelationships(page, 'Familjemusik');
    await expect(edges).not.toContainText('Upphört');
    await closeSupportDialog(page, 'Samband för Familjemusik');
    await editObjectRelationship(page, 'Lo Exempel', 'Lo Exempel → Använder → Familjemusik');
    await page.getByLabel('Sambandets status').selectOption('ended');
    await stageRelationshipAndClose(page);
    await openDraftReview(page);
    await readRemovalProposals(page, await read());
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await openObjectRelationships(page, 'Familjemusik');
    await expect(
      edges.locator('.household-read-relationships > li').filter({ hasText: 'Lo Exempel' }),
    ).toContainText('Upphört');
    await expect(
      edges.locator('.household-read-relationships > li').filter({ hasText: 'Molnmusik' }),
    ).not.toContainText('Upphört');
    await closeSupportDialog(page, 'Samband för Familjemusik');
    await editTableObject(page, 'Familjemusik');
    await page.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    await page.getByLabel('Objektets status').selectOption('active');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await openDraftReview(page);
    await readRemovalProposals(page, await read());
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await page.reload();
    await openTable(page);
    await includeEndedInTable(page);
    await expect(subscription).not.toContainText('Upphört');
    const corrected = await readTableObject(page, 'Familjemusik');
    await expect(corrected).toContainText('Gäller fortfarande');
    await openObjectRelationships(page, 'Familjemusik');
    await expect(edges).toContainText('Upphört');
  } finally {
    await installation.close();
  }
});

test('LIVSCYKEL-03: removing from the list immediately proposes every connected edge and preserves history', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, path } = await arrange(page.request, installation.origin);
    const initial = await read();
    await page.goto(installation.origin);
    await openTable(page);
    const review = page.getByRole('region', { name: 'Utkastet', exact: true });
    const proposeTypeChange = async () => {
      await editObjectRelationship(page, 'Lo Exempel', 'Lo Exempel → Använder → Familjemusik');
      await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Betalar' });
      await stageRelationshipAndClose(page);
      await openDraftReview(page);
      await expect(review).toContainText('Lo Exempel → Betalar → Familjemusik');
      await readRemovalProposals(page, await read());
      await closeTextView(page);
    };
    await proposeTypeChange();
    const expand = page.getByRole('button', { name: 'Familjemusik', exact: true });
    if ((await expand.getAttribute('aria-expanded')) !== 'true') await expand.click();
    await page.getByRole('button', { name: 'Ta bort Familjemusik', exact: true }).click();
    await openDraftReview(page);
    await expect(review.getByRole('row').filter({ hasText: 'Familjemusik' })).toHaveCount(3);
    await expect(
      review
        .getByRole('row')
        .filter({ hasText: 'Familjemusik' })
        .getByRole('cell', { name: 'Ta bort', exact: true }),
    ).toHaveCount(3);
    await expect(
      review.getByRole('button', { name: /^Visa förslaget: .+ → Använder →/ }),
    ).toHaveCount(2);
    await expect(review).toContainText('Lo Exempel → Använder → Familjemusik');
    await expect(review).toContainText('Familjemusik → Använder → Molnmusik');
    await expect(review).not.toContainText('Betalar');
    await expect(review.getByRole('button', { name: 'Spara hela utkastet' })).toBeEnabled();
    expect((await read()).objects).toEqual(initial.objects);
    expect((await read()).relationships).toEqual(initial.relationships);
    await readRemovalProposals(page, await read());
    await page.reload();
    await openDraftReview(page);
    await expect(review.getByRole('row').filter({ hasText: 'Familjemusik' })).toHaveCount(3);
    await expect(
      review
        .getByRole('row')
        .filter({ hasText: 'Familjemusik' })
        .getByRole('cell', { name: 'Ta bort', exact: true }),
    ).toHaveCount(3);
    await readRemovalProposals(page, await read());
    const draft = await openConversationDraft(page);
    await draft.getByRole('button', { name: 'Kasta hela utkastet', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Ta bort hela utkastet?', exact: true })
      .getByRole('button', { name: 'Ta bort hela utkastet', exact: true })
      .click();
    await closeConversationText(page);
    await openTable(page);
    const unchangedEdges = await openObjectRelationships(page, 'Familjemusik');
    await expect(unchangedEdges.locator('.household-read-relationships > li')).toHaveCount(2);
    await closeSupportDialog(page, 'Samband för Familjemusik');
    await openDraftReview(page);
    await expect(review).toContainText('Utkastet är tomt.');
    await closeTextView(page);
    expect((await read()).relationships).toEqual(initial.relationships);
    await proposeTypeChange();
    if ((await expand.getAttribute('aria-expanded')) !== 'true') await expand.click();
    await page.getByRole('button', { name: 'Ta bort Familjemusik', exact: true }).click();
    await openDraftReview(page);
    await readRemovalProposals(page, await read());
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    await openTable(page);
    const saved = await read();
    expect(saved.objects.map((item) => item.id)).toEqual(['person', 'service']);
    expect(saved.relationships).toEqual([]);
    expect(saved.types).toEqual(initial.types);
    expect(saved.relationshipTypes).toEqual(initial.relationshipTypes);
    await expect(page.getByRole('table')).not.toContainText('Familjemusik');
    const { history } = await (await page.request.get(`${path}/history`)).json();
    const deletion = history[0];
    expect(deletion.changes).toEqual([
      {
        before: initial.objects.find((item) => item.id === 'subscription'),
        after: null,
        type: initial.types.find((item) => item.name === 'Abonnemang'),
      },
    ]);
    expect(deletion.relationships).toEqual(
      expect.arrayContaining(
        initial.relationships.map((edge) =>
          expect.objectContaining({
            id: edge.id,
            before: edge,
            after: null,
            type: initial.relationshipTypes.find((item) => item.id === edge.typeId),
          }),
        ),
      ),
    );
    expect(
      deletion.relationships.find((item: { id: string }) => item.id === 'incoming').objectNames,
    ).toEqual({ person: 'Lo Exempel', subscription: 'Familjemusik' });
    expect(deletion.savedAt).toEqual(expect.any(String));
    expect(deletion.userId).toBe(saved.userId);
    await (await utilityButton(page, 'Rapporter')).click();
    const card = page
      .getByRole('region', { name: 'Ändringshistorik', exact: true })
      .getByRole('article')
      .first();
    await card.getByText('Visa ändringarna', { exact: true }).click();
    for (const text of ['Familjemusik', 'Lo Exempel', 'Molnmusik', 'Använder', 'Abonnemang'])
      await expect(card).toContainText(text);
    await expect(card).toContainText('Borttaget');
  } finally {
    await installation.close();
  }
});

test('LIVSCYKEL-02: a Slutdatum property preserves active status until an explicit status change', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read } = await arrange(page.request, installation.origin);
    await page.goto(installation.origin);
    await editTableObject(page, 'Familjemusik');
    await page.getByRole('button', { name: 'Fria egenskaper', exact: true }).click();
    await page.getByRole('button', { name: 'Lägg till egenskap', exact: true }).click();
    const property = page.getByRole('group', { name: 'Egenskap 1', exact: true });
    await property.getByLabel('Etikett', { exact: true }).fill('Slutdatum');
    await property.getByLabel('Datatyp', { exact: true }).selectOption('date');
    await property.getByLabel('Värde', { exact: true }).fill('2000-01-01');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(await readTableObject(page, 'Familjemusik')).toContainText('2000-01-01 (Datum)');
    await expect(await readTableObject(page, 'Familjemusik')).toContainText('Gäller fortfarande');
    await openDraftReview(page);
    await readRemovalProposals(page, await read());
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await editTableObject(page, 'Familjemusik');
    await page.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    await page.getByLabel('Objektets status', { exact: true }).selectOption('ended');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await openDraftReview(page);
    await readRemovalProposals(page, await read());
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    await openTable(page);
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await expect(table.getByRole('button', { name: 'Familjemusik', exact: true })).toHaveCount(0);
    await includeEndedInTable(page);
    await expect(await readTableObject(page, 'Familjemusik')).toContainText('Manuellt upphört');
    await editTableObject(page, 'Familjemusik');
    await page.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    await page.getByLabel('Objektets status', { exact: true }).selectOption('active');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(await readTableObject(page, 'Familjemusik')).toContainText('2000-01-01 (Datum)');
    await expect(await readTableObject(page, 'Familjemusik')).toContainText('Gäller fortfarande');
  } finally {
    await installation.close();
  }
});

test('LIVSCYKEL-04: keyboard relationship targets expose ended status without changing saved facts', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, post, save, path } = await arrange(page.request, installation.origin);
    const initial = await read();
    for (const edge of initial.relationships) {
      expect(
        (
          await post('relationship', {
            version: (await read()).draft.version,
            id: edge.id,
            baseRevision: edge.revision,
            value: {
              ...edge,
              lifecycle: edge.id === 'outgoing' ? 'active' : 'ended',
              properties: [
                { id: 'endDate', label: 'Slutdatum', kind: 'date' as const, value: '2000-01-01' },
              ],
            },
          })
        ).ok(),
      ).toBe(true);
    }
    expect((await save()).ok()).toBe(true);
    await page.goto(installation.origin);
    await stageIndependentLifecycleWork(page);
    const saved = await read();
    const history = await (await page.request.get(`${path}/history`)).json();
    await openDraftReview(page);
    await readRemovalProposals(page, saved);
    await closeTextView(page);
    await openMap(page);
    await includeEndedInMap(page);
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await setAllLabels(page, true);
    const labels = space.locator('.spatial-labels');
    const ended = labels.getByRole('button', {
      name: 'Välj samband: Lo Exempel → Använder → Familjemusik',
      exact: true,
    });
    const active = labels.getByRole('button', {
      name: 'Välj samband: Familjemusik → Använder → Molnmusik',
      exact: true,
    });
    await expect(ended.getByText('Upphört', { exact: true })).toBeVisible();
    await expect(active).not.toContainText('Upphört');
    await expect(ended).toHaveAccessibleDescription(/Upphört/);
    await expect(active).not.toHaveAccessibleDescription(/Upphört/);
    await ended.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(ended).toBeFocused();
    await expect
      .poll(() =>
        ended.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          const style = getComputedStyle(element);
          return (
            rect.width >= 24 &&
            rect.height >= 24 &&
            rect.x >= 0 &&
            rect.y >= 0 &&
            rect.right <= innerWidth &&
            rect.bottom <= innerHeight &&
            (hit === element || element.contains(hit)) &&
            style.outlineStyle !== 'none' &&
            Number.parseFloat(style.outlineWidth) >= 2
          );
        }),
      )
      .toBe(true);
    await page.keyboard.press('Alt+Enter');
    const details = page.getByRole('region', { name: 'Valt samband', exact: true });
    await expect(details).toContainText('Lo Exempel → Använder → Familjemusik');
    await expect(
      details
        .locator('dt')
        .filter({ hasText: /^Status$/ })
        .locator('..'),
    ).toContainText('Manuellt upphört');
    await expect(
      details
        .locator('dt')
        .filter({ hasText: /^Slutdatum$/ })
        .locator('..'),
    ).toContainText('2000-01-01');
    await expect(details.getByText('Upphört', { exact: true })).toBeVisible();
    expect(await read()).toEqual(saved);
    await installation.restart();
    await page.reload();
    await openMap(page);
    await includeEndedInMap(page);
    await expect(ended.getByText('Upphört', { exact: true })).toBeVisible();
    await expect(ended).toHaveAccessibleDescription(/Upphört/);
    await expect(active).not.toContainText('Upphört');
    await expect(active).not.toHaveAccessibleDescription(/Upphört/);
    expect(await read()).toEqual(saved);
    await openDraftReview(page);
    await readRemovalProposals(page, saved);
    expect(await (await page.request.get(`${path}/history`)).json()).toEqual(history);
  } finally {
    await installation.close();
  }
});

test('LIVSCYKEL-05: object and relationship descriptions remain distinct for valid overlapping identities', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, post, save, path } = await arrange(page.request, installation.origin);
    const initial = await read();
    expect(
      (
        await post('draft', {
          version: initial.draft.version,
          id: 'relationship-incoming',
          baseRevision: null,
          value: {
            name: 'Kim Exempel',
            typeId: initial.types.find((type) => type.name === 'Person')?.id,
            lifecycle: 'active',
            properties: [
              { id: 'endDate', label: 'Slutdatum', kind: 'text' as const, value: '2000-01-01' },
            ],
          },
        })
      ).ok(),
    ).toBe(true);
    const incoming = initial.relationships.find((edge) => edge.id === 'incoming');
    expect(incoming).toBeDefined();
    expect(
      (
        await post('relationship', {
          version: (await read()).draft.version,
          id: 'incoming',
          baseRevision: incoming?.revision,
          value: { ...incoming, lifecycle: 'ended' },
        })
      ).ok(),
    ).toBe(true);
    expect((await save()).ok()).toBe(true);
    await page.goto(installation.origin);
    await stageIndependentLifecycleWork(page);
    const saved = await read();
    const history = await (await page.request.get(`${path}/history`)).json();
    await openDraftReview(page);
    await readRemovalProposals(page, saved);
    await closeTextView(page);
    await openMap(page);
    await includeEndedInMap(page);
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await setAllLabels(page, true);
    const labels = space.locator('.spatial-labels');
    const edge = labels.getByRole('button', {
      name: 'Välj samband: Lo Exempel → Använder → Familjemusik',
      exact: true,
    });
    const object = labels.getByRole('button', { name: 'Markera objekt: Kim Exempel', exact: true });
    const node = space.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true });
    await expect(edge.getByText('Upphört', { exact: true })).toBeVisible();
    await expect(edge).toHaveAccessibleDescription(/Upphört/);
    await expect(object.getByText('Kim Exempel', { exact: true })).toBeVisible();
    await expect(object).not.toContainText('Upphört');
    await expect(object).toHaveAccessibleDescription(/^Kim Exempel (?:● Sökträff )?Person$/);
    await expect(node).toHaveAccessibleDescription(/^Kim Exempel (?:● Sökträff )?Person$/);
    await expect(object).not.toHaveAccessibleDescription(/Upphört/);
    await expect(node).not.toHaveAccessibleDescription(/Upphört/);
    expect(await read()).toEqual(saved);
    await installation.restart();
    await page.reload();
    await openMap(page);
    await includeEndedInMap(page);
    await expect(object).toHaveAccessibleDescription(/^Kim Exempel (?:● Sökträff )?Person$/);
    await expect(node).toHaveAccessibleDescription(/^Kim Exempel (?:● Sökträff )?Person$/);
    await expect(edge).toHaveAccessibleDescription(/Upphört/);
    expect(await read()).toEqual(saved);
    await openDraftReview(page);
    await readRemovalProposals(page, saved);
    expect(await (await page.request.get(`${path}/history`)).json()).toEqual(history);
  } finally {
    await installation.close();
  }
});

test('LIVSCYKEL-06: current and previous relationships retain their own accessible status', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, post, save } = await arrange(page.request, installation.origin);
    const initial = await read();
    const incoming = initial.relationships.find((edge) => edge.id === 'incoming');
    const pays = initial.relationshipTypes.find((type) => type.name === 'Betalar');
    expect(
      (
        await post('relationship', {
          version: initial.draft.version,
          id: 'incoming',
          baseRevision: incoming?.revision,
          value: {
            ...incoming,
            lifecycle: 'ended',
            properties: [
              { id: 'endDate', label: 'Slutdatum', kind: 'date' as const, value: '2000-01-01' },
            ],
          },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post('relationship', {
          version: (await read()).draft.version,
          id: 'previous-incoming',
          baseRevision: null,
          value: {
            sourceId: 'service',
            targetId: 'person',
            typeId: pays?.id,
            lifecycle: 'active',
            properties: [
              { id: 'endDate', label: 'Slutdatum', kind: 'date' as const, value: '2000-01-01' },
            ],
          },
        })
      ).ok(),
    ).toBe(true);
    expect((await save()).ok()).toBe(true);
    const saved = await read();
    await page.goto(installation.origin);
    await editObjectRelationship(page, 'Lo Exempel', 'Lo Exempel → Använder → Familjemusik');
    await page.getByLabel('Från objekt', { exact: true }).selectOption('service');
    await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Betalar' });
    await page.getByLabel('Sambandets status', { exact: true }).selectOption('active');
    await expect(propertyRow(page, 'Slutdatum').getByLabel('Värde', { exact: true })).toHaveValue(
      '2000-01-01',
    );
    const nativeReply = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().endsWith('/map/relationship-form'),
    );
    await stageRelationshipAndClose(page);
    expect((await nativeReply).ok()).toBe(true);
    await openDraftReview(page);
    await readRemovalProposals(page, await read());
    await closeTextView(page);
    const privateProposal = await read();
    expect(
      privateProposal.draft.relationships?.find((edge) => edge.id === 'incoming')?.after,
    ).toMatchObject({
      sourceId: 'service',
      targetId: 'subscription',
      typeId: pays?.id,
      lifecycle: 'active',
      properties: [
        { id: 'endDate', label: 'Slutdatum', kind: 'date' as const, value: '2000-01-01' },
      ],
    });
    expect(privateProposal.relationships).toEqual(saved.relationships);
    await page.goto(installation.origin);
    await openMap(page);
    await includeEndedInMap(page);
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await setAllLabels(page, true);
    const labels = space.locator('.spatial-labels');
    const previous = labels.getByRole('button', {
      name: 'Välj tidigare samband: Lo Exempel → Använder → Familjemusik',
      exact: true,
    });
    const current = labels.getByRole('button', {
      name: 'Välj samband: Molnmusik → Betalar → Lo Exempel',
      exact: true,
    });
    const proposed = labels.getByRole('button', {
      name: 'Välj samband: Molnmusik → Betalar → Familjemusik',
      exact: true,
    });
    await expect(previous.getByText('Upphört', { exact: true })).toBeVisible();
    await expect(current).toBeVisible();
    await expect(current).not.toContainText('Upphört');
    await expect(proposed).not.toContainText('Upphört');
    await expect(previous).toHaveAccessibleDescription(/Upphört/);
    await expect(previous).toHaveAccessibleDescription(/Använder/);
    await expect(current).toHaveAccessibleDescription(/Betalar/);
    await expect(current).not.toHaveAccessibleDescription(/Upphört/);
    await expect(proposed).not.toHaveAccessibleDescription(/Upphört/);
    expect(await read()).toEqual(privateProposal);
    await installation.restart();
    await page.reload();
    await openMap(page);
    await includeEndedInMap(page);
    await expect(previous.getByText('Upphört', { exact: true })).toBeVisible();
    await expect(previous).toHaveAccessibleDescription(/Upphört/);
    await expect(previous).toHaveAccessibleDescription(/Använder/);
    await expect(current).not.toHaveAccessibleDescription(/Upphört/);
    await expect(proposed).not.toHaveAccessibleDescription(/Upphört/);
    expect(await read()).toEqual(privateProposal);
  } finally {
    await installation.close();
  }
});
