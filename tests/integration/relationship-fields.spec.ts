import { expect, test } from '@playwright/test';
import { createHousehold, openWorkspace, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

for (const width of [1440, 390])
  test(`STY-06: optional relationship fields share definitions, editing and durable save at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const installation = await createInstallation();
    try {
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}/map`;
      const read = async () => (await page.request.get(path)).json();
      const initial = await read();
      for (const [version, id, name] of [
        [0, 'bike', 'Cykeln'],
        [1, 'garage', 'Garaget'],
      ] as const)
        expect(
          (
            await page.request.post(`${path}/draft`, {
              headers: { origin: installation.origin },
              data: {
                version,
                id,
                baseRevision: null,
                value: { typeId: initial.types[version].id, name, description: '' },
              },
            })
          ).status(),
        ).toBe(200);
      await page.goto(installation.origin);
      await openWorkspace(page);
      await page.getByRole('button', { name: 'Ny sambandstyp', exact: true }).click();
      await page.getByLabel('Sambandstypens namn').fill('Förvaring');
      await page.getByLabel('Sambandstypens beskrivning').fill('Var saker finns');
      await page.getByLabel('Benämning från startobjektet').fill('förvaras i');
      await page.getByLabel('Benämning från målobjektet').fill('innehåller');
      const fieldNames = ['Anteckning', 'Belopp', 'Startdatum', 'Bekräftat', 'Obesvarat'];
      for (const [index, kind] of ['text', 'number', 'date', 'boolean', 'boolean'].entries()) {
        await page.getByRole('button', { name: 'Lägg till fält', exact: true }).click();
        const field = page.getByRole('group', { name: `Eget fält ${index + 1}`, exact: true });
        await expect(field.getByLabel('Fältets namn')).toBeFocused();
        await field.getByLabel('Fältets namn').fill(fieldNames[index]);
        await field.getByLabel('Värdeslag').selectOption(kind);
      }
      await page.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }).click();
      await page.getByRole('button', { name: 'Nytt samband', exact: true }).click();
      await page.getByLabel('Från objekt').selectOption('bike');
      await page.getByLabel('Till objekt').selectOption('garage');
      await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Förvaring' });
      await page.getByLabel('Anteckning', { exact: true }).fill('Låst skåp');
      await page.getByLabel('Belopp', { exact: true }).fill('0');
      await page.getByLabel('Startdatum', { exact: true }).fill('2026-09-27');
      await page.getByLabel('Bekräftat', { exact: true }).selectOption('false');
      await expect(page.getByLabel('Obesvarat', { exact: true })).toHaveValue('');
      await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
      const review = page.getByRole('region', { name: 'Hela mitt utkast' });
      await expect(review).toContainText('Låst skåp');
      await expect(review).toContainText('Nej');
      await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
      await expect(page.getByRole('status')).toContainText('Sparat');
      await installation.restart();
      await page.reload();
      await openWorkspace(page);
      await page
        .getByRole('list', { name: 'Samband', exact: true })
        .getByRole('button', { name: 'Cykeln → förvaras i → Garaget', exact: true })
        .click();
      await page.getByRole('button', { name: 'Redigera valt samband', exact: true }).click();
      await expect(page.getByLabel('Anteckning', { exact: true })).toHaveValue('Låst skåp');
      await expect(page.getByLabel('Belopp', { exact: true })).toHaveValue('0');
      await expect(page.getByLabel('Bekräftat', { exact: true })).toHaveValue('false');
      await expect(page.getByLabel('Obesvarat', { exact: true })).toHaveValue('');
      await page.getByLabel('Anteckning', { exact: true }).fill('Övre hyllan');
      await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
      await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
      await expect(page.getByRole('status')).toContainText('Sparat');
      const state = await read();
      const fields = state.relationshipTypes.find(
        (type: { name: string }) => type.name === 'Förvaring',
      ).fields;
      expect(state.relationships[0].customValues).toEqual({
        [fields[0].id]: 'Övre hyllan',
        [fields[1].id]: 0,
        [fields[2].id]: '2026-09-27',
        [fields[3].id]: false,
      });
    } finally {
      await installation.close();
    }
  });

test('STY-07: relationship type changes require an explicit decision about earlier custom answers', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async () => (await page.request.get(path)).json();
    const propose = async (route: string, id: string, value: unknown) => {
      const response = await page.request.post(`${path}/${route}`, {
        headers: { origin: installation.origin },
        data: { version: (await read()).draft.version, id, baseRevision: null, value },
      });
      expect(response.status()).toBe(200);
    };
    const initial = await read();
    for (const id of ['bike', 'garage'])
      await propose('draft', id, { typeId: initial.types[0].id, name: id, description: '' });
    for (const [id, name] of [
      ['first', 'Förvaring'],
      ['second', 'Tillgång'],
    ])
      await propose('relationship-type', id, {
        name,
        description: '',
        forwardLabel: 'hör till',
        reverseLabel: 'har',
        fields: [{ id: 'note', name: 'Anteckning', description: '', kind: 'text' }],
      });
    await propose('relationship', 'edge', {
      typeId: 'first',
      sourceId: 'bike',
      targetId: 'garage',
      knowledge: 'known',
      customValues: { note: 'Behåll som historik' },
    });
    expect(
      (
        await page.request.post(`${path}/save`, {
          headers: { origin: installation.origin },
          data: { version: (await read()).draft.version, operationId: 'initial' },
        })
      ).status(),
    ).toBe(200);
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page
      .getByRole('list', { name: 'Samband', exact: true })
      .getByRole('button', { name: 'bike → hör till → garage', exact: true })
      .click();
    await page.getByRole('button', { name: 'Redigera valt samband' }).click();
    await page.getByLabel('Sambandstyp', { exact: true }).selectOption('second');
    await expect(page.getByLabel('Anteckning', { exact: true })).toHaveValue('');
    await expect(page.getByRole('region', { name: 'Tidigare egna sambandsvärden' })).toContainText(
      'Behåll som historik',
    );
    await expect(page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' })).toBeDisabled();
    await page.getByLabel('Anteckning', { exact: true }).fill('Ny betydelse');
    await page
      .getByRole('button', { name: 'Bekräfta borttagning av tidigare egna värden' })
      .click();
    await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Behåll som historik');
    await expect(review).toContainText('Ny betydelse');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    expect((await read()).relationships[0]).toMatchObject({
      typeId: 'second',
      customValues: { note: 'Ny betydelse' },
    });
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history.at(-1).relationships[0]).toMatchObject({
      before: { customValues: { note: 'Behåll som historik' } },
      beforeType: { id: 'first' },
      type: { id: 'second' },
    });
  } finally {
    await installation.close();
  }
});
