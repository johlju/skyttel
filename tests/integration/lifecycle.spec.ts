import { type APIRequestContext, expect, test } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, openMap, openWorkspace, signIn } from '../support/client.js';
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
    await openWorkspace(page);
    const objects = page.getByRole('list', { name: 'Objekt', exact: true });
    const subscription = objects.getByRole('listitem').filter({ hasText: 'Familjemusik' });
    await subscription
      .getByRole('button', { name: 'Uppgifter för Familjemusik', exact: true })
      .click();
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
    await openWorkspace(page);
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
    await subscription
      .getByRole('button', { name: 'Uppgifter för Familjemusik', exact: true })
      .click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await page.getByLabel('Objektets status').selectOption('active');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await page.reload();
    await openWorkspace(page);
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
    await openWorkspace(page);
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
    await openWorkspace(page);
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
    await openWorkspace(page);
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
    await openWorkspace(page);
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
    await subscription
      .getByRole('button', { name: 'Uppgifter för Familjemusik', exact: true })
      .click();
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
    await openWorkspace(page);
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

test('LIVSCYKEL-04: keyboard relationship targets expose ended status without changing saved facts', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, post, save } = await arrange(page.request, installation.origin);
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
              endDate: { knowledge: 'known', value: '2000-01-01' },
              ...(edge.id === 'outgoing' ? { lifecycle: 'active' } : {}),
            },
          })
        ).ok(),
      ).toBe(true);
    }
    expect((await save()).ok()).toBe(true);
    const saved = await read();
    await page.goto(installation.origin);
    await openMap(page);
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await space.getByLabel('Alla etiketter', { exact: true }).check();
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
    await page.keyboard.press('Enter');
    await openWorkspace(page);
    const details = page.getByRole('region', { name: 'Val och redigering', exact: true });
    await expect(details).toContainText('Lo Exempel → Använder → Familjemusik');
    await expect(details).toContainText('Status: Följ slutdatum');
    await expect(details).toContainText('Slutdatum: 2000-01-01');
    await expect(details.getByText('Upphört', { exact: true })).toBeVisible();
    expect(await read()).toEqual(saved);
    await installation.restart();
    await page.reload();
    await openMap(page);
    await expect(ended.getByText('Upphört', { exact: true })).toBeVisible();
    await expect(ended).toHaveAccessibleDescription(/Upphört/);
    await expect(active).not.toContainText('Upphört');
    await expect(active).not.toHaveAccessibleDescription(/Upphört/);
    expect(await read()).toEqual(saved);
  } finally {
    await installation.close();
  }
});

test('LIVSCYKEL-05: object and relationship descriptions remain distinct for valid overlapping identities', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, post, save } = await arrange(page.request, installation.origin);
    const initial = await read();
    expect(
      (
        await post('draft', {
          version: initial.draft.version,
          id: 'relationship-incoming',
          baseRevision: null,
          value: {
            name: 'Kim Exempel',
            description: '',
            typeId: initial.types.find((type) => type.name === 'Person')?.id,
            lifecycle: 'active',
            financialFacts: { endDate: { knowledge: 'known', value: '2000-01-01' } },
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
    const saved = await read();
    await page.goto(installation.origin);
    await openMap(page);
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await space.getByLabel('Alla etiketter', { exact: true }).check();
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
    await expect(object).toHaveAccessibleDescription('Kim Exempel Person');
    await expect(node).toHaveAccessibleDescription('Kim Exempel Person');
    await expect(object).not.toHaveAccessibleDescription(/Upphört/);
    await expect(node).not.toHaveAccessibleDescription(/Upphört/);
    expect(await read()).toEqual(saved);
    await installation.restart();
    await page.reload();
    await openMap(page);
    await expect(object).toHaveAccessibleDescription('Kim Exempel Person');
    await expect(node).toHaveAccessibleDescription('Kim Exempel Person');
    await expect(edge).toHaveAccessibleDescription(/Upphört/);
    expect(await read()).toEqual(saved);
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
            endDate: { knowledge: 'known', value: '2000-01-01' },
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
            knowledge: 'known',
            lifecycle: 'active',
            endDate: { knowledge: 'known', value: '2000-01-01' },
          },
        })
      ).ok(),
    ).toBe(true);
    expect((await save()).ok()).toBe(true);
    const saved = await read();
    const ended = saved.relationships.find((edge) => edge.id === 'incoming');
    expect(
      (
        await post('relationship', {
          version: saved.draft.version,
          id: 'incoming',
          baseRevision: ended?.revision,
          value: { ...ended, typeId: pays?.id, lifecycle: 'active' },
        })
      ).ok(),
    ).toBe(true);
    const privateProposal = await read();
    expect(privateProposal.relationships).toEqual(saved.relationships);
    await page.goto(installation.origin);
    await openMap(page);
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await space.getByLabel('Alla etiketter', { exact: true }).check();
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
      name: 'Välj samband: Lo Exempel → Betalar → Familjemusik',
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
