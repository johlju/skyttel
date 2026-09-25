import { type APIRequestContext, expect, test } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

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
          value: {
            name,
            typeId: state.types.find((item) => item.name === type)?.id,
            description: '',
          },
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
            knowledge: 'known',
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

test('LIVSCYKEL-01: ended objects and relationships stay visible and independently correctable', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read } = await arrange(page.request, installation.origin);
    await page.goto(installation.origin);
    const objects = page.getByRole('list', { name: 'Objekt', exact: true });
    const subscription = objects.getByRole('listitem').filter({ hasText: 'Familjemusik' });
    await subscription.getByRole('button', { name: 'Familjemusik', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await page.getByLabel('Objektets status').selectOption('ended');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await expect(subscription).toContainText('Upphört');
    const endedColor = await subscription
      .getByText('Upphört', { exact: true })
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    const proposalColor = await subscription
      .getByText('Förslag i ditt utkast', { exact: true })
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(endedColor).not.toBe(proposalColor);
    expect((await read()).objects.find((item) => item.id === 'subscription')).not.toHaveProperty(
      'lifecycle',
    );
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await installation.restart();
    await page.reload();
    await expect(subscription).toContainText('Upphört');
    await expect(objects.getByRole('listitem').filter({ hasText: 'Lo Exempel' })).not.toContainText(
      'Upphört',
    );
    const edges = page.getByRole('list', { name: 'Samband', exact: true });
    await expect(edges).not.toContainText('Upphört');
    await edges
      .getByRole('button', { name: 'Lo Exempel → Använder → Familjemusik', exact: true })
      .click();
    await page.getByRole('button', { name: 'Redigera valt samband', exact: true }).click();
    await page.getByLabel('Sambandets status').selectOption('ended');
    await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await expect(edges.getByRole('listitem').filter({ hasText: 'Lo Exempel' })).toContainText(
      'Upphört',
    );
    await expect(edges.getByRole('listitem').filter({ hasText: 'Molnmusik' })).not.toContainText(
      'Upphört',
    );
    await subscription.getByRole('button', { name: 'Familjemusik', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await page.getByLabel('Objektets status').selectOption('active');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await page.reload();
    await expect(subscription).not.toContainText('Upphört');
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
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    const proposeTypeChange = async () => {
      await page
        .getByRole('list', { name: 'Samband', exact: true })
        .getByRole('button', { name: 'Lo Exempel → Använder → Familjemusik', exact: true })
        .click();
      await page.getByRole('button', { name: 'Redigera valt samband', exact: true }).click();
      await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Betalar' });
      await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
      await expect(review).toContainText('Lo Exempel → Betalar → Familjemusik');
    };
    await proposeTypeChange();
    await page.getByText('Åtgärder för Familjemusik', { exact: true }).click();
    await page.getByRole('button', { name: 'Ta bort', exact: true }).click();
    await expect(review).toContainText('Borttagning: Familjemusik');
    await expect(
      review.getByRole('heading', { name: 'Borttagning av samband', exact: true }),
    ).toHaveCount(2);
    await expect(review).toContainText('Lo Exempel → Använder → Familjemusik');
    await expect(review).toContainText('Familjemusik → Använder → Molnmusik');
    await expect(review).not.toContainText('Betalar');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeEnabled();
    expect((await read()).objects).toEqual(initial.objects);
    expect((await read()).relationships).toEqual(initial.relationships);
    await page.reload();
    await expect(review).toContainText('Borttagning: Familjemusik');
    await page.getByRole('button', { name: 'Kasta hela utkastet' }).click();
    await expect(review).toContainText('Inga förslag');
    await expect(
      page.getByRole('list', { name: 'Samband', exact: true }).getByRole('listitem'),
    ).toHaveCount(2);
    expect((await read()).relationships).toEqual(initial.relationships);
    await proposeTypeChange();
    await page.getByText('Åtgärder för Familjemusik', { exact: true }).click();
    await page.getByRole('button', { name: 'Ta bort', exact: true }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await installation.restart();
    await page.reload();
    const saved = await read();
    expect(saved.objects.map((item) => item.id)).toEqual(['person', 'service']);
    expect(saved.relationships).toEqual([]);
    expect(saved.types).toEqual(initial.types);
    expect(saved.relationshipTypes).toEqual(initial.relationshipTypes);
    await expect(page.getByRole('list', { name: 'Objekt', exact: true })).not.toContainText(
      'Familjemusik',
    );
    const { history } = await (await page.request.get(`${path}/history`)).json();
    const deletion = history.at(-1);
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
  } finally {
    await installation.close();
  }
});

test('LIVSCYKEL-02: only a known elapsed end date ends content and dates or status can correct it', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, post, save, path } = await arrange(page.request, installation.origin);
    const initial = await read();
    for (const [id, knowledge] of [
      ['subscription', 'known'],
      ['person', 'uncertain'],
    ]) {
      const object = initial.objects.find((item) => item.id === id);
      expect(
        (
          await post('draft', {
            version: (await read()).draft.version,
            id,
            baseRevision: object?.revision,
            value: {
              ...object,
              financialFacts: { endDate: { knowledge, value: '2031-03-12' } },
            },
          })
        ).ok(),
      ).toBe(true);
    }
    expect((await save()).ok()).toBe(true);
    await page.clock.install({ time: new Date('2031-03-12T23:59:58Z') });
    await page.goto(installation.origin);
    const objects = page.getByRole('list', { name: 'Objekt', exact: true });
    const subscription = objects.getByRole('listitem').filter({ hasText: 'Familjemusik' });
    await expect(objects).not.toContainText('Upphört');
    await page.clock.fastForward(5_000);
    await expect(subscription).toContainText('Upphört');
    await expect(objects.getByRole('listitem').filter({ hasText: 'Lo Exempel' })).not.toContainText(
      'Upphört',
    );
    await expect(objects.getByRole('listitem').filter({ hasText: 'Molnmusik' })).not.toContainText(
      'Upphört',
    );
    await subscription.getByRole('button', { name: 'Familjemusik', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await page.getByText('Ekonomiska uppgifter och avtalsvillkor', { exact: true }).click();
    await page.getByLabel('Slutdatum', { exact: true }).fill('2031-03-20');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await expect(subscription).not.toContainText('Upphört');
    const edges = page.getByRole('list', { name: 'Samband', exact: true });
    const incoming = edges.getByRole('listitem').filter({ hasText: 'Lo Exempel' });
    await incoming.getByRole('button', { name: /^Lo Exempel →/ }).click();
    await page.getByRole('button', { name: 'Redigera valt samband', exact: true }).click();
    await page.getByLabel('Sambandets slutdatum: uppgiftens säkerhet').selectOption('known');
    await page.getByLabel('Sambandets slutdatum', { exact: true }).fill('2031-03-12');
    await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await expect(incoming).toContainText('Upphört');
    await incoming.getByRole('button', { name: /^Lo Exempel →/ }).click();
    await page.getByRole('button', { name: 'Redigera valt samband', exact: true }).click();
    await page.getByLabel('Sambandets status').selectOption('active');
    await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Gäller fortfarande',
    );
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await installation.restart();
    await page.reload();
    await expect(incoming).not.toContainText('Upphört');
    await expect(subscription).not.toContainText('Upphört');
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history.at(-1).relationships[0]).toMatchObject({
      before: { endDate: { knowledge: 'known', value: '2031-03-12' } },
      after: { lifecycle: 'active', endDate: { knowledge: 'known', value: '2031-03-12' } },
    });
    for (const endDate of [
      { knowledge: 'known', value: '2031-02-30' },
      { knowledge: 'unknown', value: '2031-03-12' },
    ]) {
      const state = await read();
      const edge = state.relationships.find((item) => item.id === 'incoming');
      expect(
        (
          await post('relationship', {
            version: state.draft.version,
            id: 'incoming',
            baseRevision: edge?.revision,
            value: { ...edge, endDate },
          })
        ).status(),
      ).toBe(400);
    }
  } finally {
    await installation.close();
  }
});
