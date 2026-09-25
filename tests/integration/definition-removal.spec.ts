import { expect, test } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

test('KATALOG-01: unused fields and custom and prefilled types are reviewed, discarded or saved without automatic cleanup', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const initial = await read();
    const type = initial.types[0];
    const edgeType = initial.relationshipTypes[0];
    const field = { id: 'serial', name: 'Serienummer', description: '', kind: 'text' };
    expect(
      (
        await post('object-type', {
          version: 0,
          id: type.id,
          baseRevision: type.revision,
          value: { ...type, fields: [field] },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post('object-type', {
          version: 1,
          id: 'solar',
          baseRevision: null,
          value: { name: 'Solcellsanläggning', description: '', fields: [] },
        })
      ).ok(),
    ).toBe(true);
    expect((await post('save', { version: 2, operationId: 'definitions' })).ok()).toBe(true);
    await page.goto(installation.origin);
    await page.getByText('Objekttyper och egna fält', { exact: true }).click();
    await page.getByRole('button', { name: `Ändra typ: ${type.name}`, exact: true }).click();
    await page.getByRole('button', { name: 'Ta bort fält: Serienummer' }).click();
    await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
    const draft = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(draft).toContainText('Serienummer: Text');
    await page.getByRole('button', { name: 'Ändra typ: Solcellsanläggning' }).click();
    await page.getByRole('button', { name: 'Ta bort objekttypen' }).click();
    await page.getByText('Sambandstyper och riktning', { exact: true }).click();
    await page
      .getByRole('button', { name: `Ändra sambandstyp: ${edgeType.name}`, exact: true })
      .click();
    await page.getByRole('button', { name: 'Ta bort sambandstypen' }).click();
    await expect(draft).toContainText('Borttagen objekttyp');
    await expect(draft).toContainText('Borttagen sambandstyp');
    expect((await read()).types).toHaveLength(initial.types.length + 1);
    await page.getByRole('button', { name: 'Kasta hela utkastet' }).click();
    await expect(draft).toContainText('Inga förslag');
    await expect(page.getByRole('button', { name: 'Ändra typ: Solcellsanläggning' })).toBeVisible();
    await page.getByRole('button', { name: `Ändra typ: ${type.name}`, exact: true }).click();
    await page.getByRole('button', { name: 'Ta bort fält: Serienummer' }).click();
    await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
    await page.getByRole('button', { name: 'Ändra typ: Solcellsanläggning' }).click();
    await page.getByRole('button', { name: 'Ta bort objekttypen' }).click();
    await page
      .getByRole('button', { name: `Ändra sambandstyp: ${edgeType.name}`, exact: true })
      .click();
    await page.getByRole('button', { name: 'Ta bort sambandstypen' }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await installation.restart();
    await page.reload();
    const final = await read();
    expect(final.types.find((item) => item.id === type.id)?.fields).toBeUndefined();
    expect(final.types.find((item) => item.id === 'solar')).toBeUndefined();
    expect(final.relationshipTypes.find((item) => item.id === edgeType.id)).toBeUndefined();
    expect(final.types).toHaveLength(initial.types.length);
    expect(final.relationshipTypes).toHaveLength(initial.relationshipTypes.length - 1);
    await page.getByRole('button', { name: 'Visa historik', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Ändringshistorik' })).toContainText(
      'Borttagen definition',
    );
  } finally {
    await installation.close();
  }
});

test('KATALOG-02: private drafts and ended content block removal with a useful explanation and no private disclosure', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await browser.newContext();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (client = page.request): Promise<MapState> =>
      (await client.get(path)).json();
    const post = (route: string, data: unknown, client = page.request) =>
      client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const initial = await read();
    const type = initial.types[0];
    const edgeType = initial.relationshipTypes[0];
    expect(
      (
        await post('object-type', {
          version: 0,
          id: type.id,
          baseRevision: type.revision,
          value: {
            ...type,
            fields: [{ id: 'serial', name: 'Serienummer', description: '', kind: 'text' }],
          },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post('draft', {
          version: 1,
          id: 'target',
          baseRevision: null,
          value: { typeId: initial.types[1].id, name: 'Garaget', description: '' },
        })
      ).ok(),
    ).toBe(true);
    expect((await post('save', { version: 2, operationId: 'initial' })).ok()).toBe(true);
    installation.setIdentity(robin);
    await signIn(other.request, installation.origin);
    const { user } = await (await other.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { code } = await (
      await page.request.post(`${path.replace('/map', '')}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    expect(
      (
        await other.request.post(`${installation.origin}/api/invitations/accept`, {
          headers: { origin: installation.origin },
          data: { code },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post(
          'draft',
          {
            version: 0,
            id: 'private',
            baseRevision: null,
            value: {
              typeId: type.id,
              name: 'Privat provnamn',
              description: '',
              lifecycle: 'ended',
              customValues: { serial: 'PRIVAT-PROVVÄRDE' },
            },
          },
          other.request,
        )
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post(
          'relationship',
          {
            version: 1,
            id: 'private-edge',
            baseRevision: null,
            value: {
              typeId: edgeType.id,
              sourceId: 'private',
              targetId: 'target',
              knowledge: 'known',
              lifecycle: 'ended',
            },
          },
          other.request,
        )
      ).ok(),
    ).toBe(true);
    await installation.restart();
    for (const stage of ['private', 'saved']) {
      if (stage === 'saved')
        expect(
          (await post('save', { version: 2, operationId: 'ended-content' }, other.request)).ok(),
        ).toBe(true);
      const before = await read();
      const otherBefore = await read(other.request);
      await page.goto(installation.origin);
      await page.getByText('Objekttyper och egna fält', { exact: true }).click();
      await page.getByRole('button', { name: `Ändra typ: ${type.name}`, exact: true }).click();
      await page.getByRole('button', { name: 'Ta bort objekttypen' }).click();
      await expect(page.getByRole('alert')).toContainText(
        'ta bort eller byt typ på användande objekt',
      );
      await expect(page.getByRole('alert')).not.toContainText('Privat provnamn');
      await page.getByRole('button', { name: 'Ta bort fält: Serienummer' }).click();
      await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
      await expect(page.getByRole('alert')).toContainText('Ta bort fältvärdena');
      await expect(page.getByRole('alert')).not.toContainText('PRIVAT-PROVVÄRDE');
      await page.getByRole('button', { name: 'Stäng typformuläret utan att skicka' }).click();
      await page.getByText('Sambandstyper och riktning', { exact: true }).click();
      await page
        .getByRole('button', { name: `Ändra sambandstyp: ${edgeType.name}`, exact: true })
        .click();
      await page.getByRole('button', { name: 'Ta bort sambandstypen' }).click();
      await expect(page.getByRole('alert')).toContainText('objekten kan finnas kvar');
      await expect(page.getByRole('alert')).not.toContainText('Privat provnamn');
      expect(await read()).toEqual(before);
      expect(await read(other.request)).toEqual(otherBefore);
      if (stage === 'private')
        await expect(page.getByRole('main')).not.toContainText('Privat provnamn');
    }
  } finally {
    await other.close();
    await installation.close();
  }
});

test('KATALOG-03: history restores missing definitions and content together only after review and a new save', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const initial = await read();
    const type = initial.types[0];
    const edgeType = initial.relationshipTypes[0];
    const object = async (id: string, typeId: string, name: string) => {
      expect(
        (
          await post('draft', {
            version: (await read()).draft.version,
            id,
            baseRevision: null,
            value: { typeId, name, description: '' },
          })
        ).ok(),
      ).toBe(true);
    };
    const save = async (operationId: string) => {
      const response = await post('save', { version: (await read()).draft.version, operationId });
      expect(response.ok()).toBe(true);
      return (await response.json()).receipt;
    };
    await object('source', type.id, 'Lo Exempel');
    await object('target', initial.types[1].id, 'Garaget');
    expect(
      (
        await post('relationship', {
          version: 2,
          id: 'edge',
          baseRevision: null,
          value: {
            typeId: edgeType.id,
            sourceId: 'source',
            targetId: 'target',
            knowledge: 'known',
          },
        })
      ).ok(),
    ).toBe(true);
    await save('content');
    expect(
      (
        await post('draft', {
          version: (await read()).draft.version,
          id: 'source',
          baseRevision: 1,
          value: null,
        })
      ).ok(),
    ).toBe(true);
    const deletion = await save('delete-content');
    expect(
      (
        await post('object-type', {
          version: (await read()).draft.version,
          id: type.id,
          baseRevision: type.revision,
          value: null,
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post('relationship-type', {
          version: (await read()).draft.version,
          id: edgeType.id,
          baseRevision: edgeType.revision,
          value: null,
        })
      ).ok(),
    ).toBe(true);
    await save('delete-catalog');
    await object('independent', initial.types[1].id, 'Oberoende förslag');
    const before = await read();
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Visa historik', exact: true }).click();
    const history = page.getByRole('region', { name: 'Ändringshistorik' });
    const group = history.getByRole('article').filter({ hasText: 'Sparande: delete-content' });
    await expect(group).toContainText('Lo Exempel');
    await expect(group).toContainText(`Objekttyp: ${type.name}`);
    await expect(group).toContainText(`Samband: ${edgeType.name}`);
    await group.getByRole('button', { name: 'Ångra sparandet' }).click();
    const draft = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(draft).toContainText(`Återställ objekttyp: ${type.name}`);
    await expect(draft).toContainText(`Återställ sambandstyp: ${edgeType.name}`);
    await expect(draft).toContainText('Lo Exempel');
    await expect(draft).toContainText('Oberoende förslag');
    expect((await read()).objects).toEqual(before.objects);
    expect((await read()).types).toEqual(before.types);
    await installation.restart();
    await page.reload();
    await expect(draft).toContainText(`Återställ objekttyp: ${type.name}`);
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    const final = await read();
    expect(final.objects.map((item) => item.id).sort()).toEqual([
      'independent',
      'source',
      'target',
    ]);
    expect(final.objects.find((item) => item.id === 'target')).toEqual(before.objects[0]);
    expect(final.relationships[0]).toMatchObject({ id: 'edge', typeId: edgeType.id });
    expect((await (await page.request.get(`${path}/history`)).json()).history[1]).toEqual(deletion);
  } finally {
    await installation.close();
  }
});
