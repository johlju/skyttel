import { type APIRequestContext, expect, test } from '@playwright/test';
import { draftConflicts } from '../../src/shared/draft-conflicts.js';
import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

async function setup(client: APIRequestContext, origin: string) {
  await signIn(client, origin);
  const { household } = await (await createHousehold(client, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const read = async (actor = client): Promise<MapState> => (await actor.get(path)).json();
  const post = (route: string, data: unknown, actor = client) =>
    actor.post(`${path}/${route}`, { headers: { origin }, data });
  const save = async (operationId: string, actor = client): Promise<SaveReceipt> => {
    const response = await post(
      'save',
      { version: (await read(actor)).draft.version, operationId },
      actor,
    );
    expect(response.status()).toBe(200);
    return (await response.json()).receipt;
  };
  const object = async (id: string, update: Record<string, unknown>, actor = client) => {
    const state = await read(actor);
    const before = state.objects.find((item) => item.id === id);
    return post(
      'draft',
      {
        version: state.draft.version,
        id,
        baseRevision: before?.revision ?? null,
        value: { typeId: 'cycle', name: id, description: '', ...before, ...update },
      },
      actor,
    );
  };
  for (const [id, name, kind] of [
    ['cycle', 'Cykel', 'text'],
    ['vehicle', 'Motorfordon', 'number'],
  ]) {
    expect(
      (
        await post('object-type', {
          version: (await read()).draft.version,
          id,
          baseRevision: null,
          value: {
            name,
            description: '',
            fields: [
              { id: 'serial', name: 'Nummer', description: '', kind },
              { id: 'insured', name: 'Försäkrad', description: '', kind: 'boolean' },
            ],
          },
        })
      ).status(),
    ).toBe(200);
  }
  expect(
    (
      await object('bike', {
        name: 'Alex blå cykel',
        customValues: { serial: 'SYNTH-42', insured: false },
      })
    ).status(),
  ).toBe(200);
  expect((await object('garage', { name: 'Garaget' })).status()).toBe(200);
  const state = await read();
  expect(
    (
      await post('relationship', {
        version: state.draft.version,
        id: 'parking',
        baseRevision: null,
        value: {
          typeId: state.relationshipTypes[0].id,
          sourceId: 'bike',
          targetId: 'garage',
          knowledge: 'known',
        },
      })
    ).status(),
  ).toBe(200);
  await save('setup');
  return { path, read, post, save, object };
}

test('TYP-06: type changes review displaced values and preserve identity, edges and history through restart and undo', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, post, save } = await setup(page.request, installation.origin);
    const initial = await read();
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Alex blå cykel', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await page.getByLabel('Objekttyp', { exact: true }).selectOption('vehicle');
    const previous = page.getByRole('region', { name: 'Tidigare fältvärden' });
    await expect(previous).toContainText('Nummer: SYNTH-42');
    await expect(previous).toContainText('Försäkrad: Nej');
    await expect(page.getByLabel('Nummer', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Försäkrad', { exact: true })).toHaveValue('');
    await expect(
      page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }),
    ).toBeDisabled();
    await page.getByLabel('Nummer', { exact: true }).fill('42');
    await page.getByLabel('Jag har hanterat tidigare fältvärden för typbytet').check();
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Objekttyp: Cykel');
    await expect(review).toContainText('Objekttyp: Motorfordon');
    await expect(review).toContainText('Nummer: SYNTH-42');
    await expect(review).toContainText('Nummer: 42');
    await expect(review).toContainText('Försäkrad: Obesvarat');
    await installation.restart();
    await page.reload();
    await expect(review).toContainText('Nummer: SYNTH-42');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    const changed = await read();
    expect(changed.objects.find((item) => item.id === 'bike')).toMatchObject({
      typeId: 'vehicle',
      customValues: { serial: 42 },
    });
    expect(changed.objects.find((item) => item.id === 'bike')?.customValues).not.toHaveProperty(
      'insured',
    );
    expect(changed.relationships).toEqual(initial.relationships);
    const type = changed.types.find((item) => item.id === 'cycle');
    expect(
      (
        await post('object-type', {
          version: changed.draft.version,
          id: 'cycle',
          baseRevision: type?.revision,
          value: {
            ...type,
            name: 'Trampcykel',
            fields: type?.fields?.map((field) => ({ ...field, name: `Tidigare ${field.name}` })),
          },
        })
      ).status(),
    ).toBe(200);
    await save('rename-source');
    await installation.restart();
    await page.reload();
    await page.getByRole('button', { name: 'Visa historik' }).click();
    const selected = page
      .getByRole('region', { name: 'Ändringshistorik' })
      .getByRole('article')
      .filter({ hasText: 'Objekttyp: Motorfordon' })
      .filter({ hasText: 'Nummer: 42' });
    await expect(selected).toHaveCount(1);
    await expect(selected).toContainText('Objekttyp: Cykel');
    await expect(selected).toContainText('Nummer: SYNTH-42');
    await expect(selected).toContainText('Alex Exempel');
    await expect(selected.locator('time')).toHaveAttribute('datetime', /T/);
    await selected.getByRole('button', { name: 'Ångra sparandet' }).click();
    await expect(review).toContainText('Nummer: SYNTH-42');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await installation.restart();
    const restored = await read();
    expect(restored.objects.find((item) => item.id === 'bike')).toMatchObject({
      typeId: 'cycle',
      customValues: { serial: 'SYNTH-42', insured: false },
    });
    expect(restored.relationships).toEqual(initial.relationships);
  } finally {
    await installation.close();
  }
});

test('TYP-07: invalid values and concurrent definitions block whole saves until fresh choices while undo protects private fields', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await browser.newContext();
  try {
    const { path, read, post, object, save } = await setup(page.request, installation.origin);
    installation.setIdentity(robin);
    await signIn(other.request, installation.origin);
    const { user } = await (await other.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { code } = await (
      await page.request.post(`${path.replace('/map', '')}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    await other.request.post(`${installation.origin}/api/invitations/accept`, {
      headers: { origin: installation.origin },
      data: { code },
    });
    await object('garage', { name: 'Eget namn' });
    const before = await read();
    expect(
      (await object('bike', { typeId: 'vehicle', customValues: { serial: 'fel' } })).status(),
    ).toBe(400);
    expect(await read()).toEqual(before);
    expect(
      (
        await object('bike', { typeId: 'vehicle', customValues: { serial: 42, insured: false } })
      ).status(),
    ).toBe(200);
    const target = (await read(other.request)).types.find((type) => type.id === 'vehicle');
    expect(
      (
        await post(
          'object-type',
          {
            version: 0,
            id: 'vehicle',
            baseRevision: target?.revision,
            value: { ...target, description: 'Uppdaterad definition' },
          },
          other.request,
        )
      ).status(),
    ).toBe(200);
    await save('definition', other.request);
    const stale = await read();
    expect(
      (await post('save', { version: stale.draft.version, operationId: 'blocked' })).status(),
    ).toBe(409);
    expect(await read()).toEqual(stale);
    expect(stale.objects.find((item) => item.id === 'garage')?.name).toBe('Garaget');
    const conflict = draftConflicts(stale)[0];
    expect(
      (
        await post('resolve', { version: stale.draft.version, conflict, choice: 'proposed' })
      ).status(),
    ).toBe(200);
    expect(
      (await post('save', { version: stale.draft.version, operationId: 'old-approval' })).status(),
    ).toBe(409);
    const selected = await save('change-type');
    await object('bike', { customValues: { serial: 43, insured: false } });
    const own = await read();
    expect(
      (
        await post('undo', {
          version: own.draft.version,
          userId: selected.userId,
          operationId: selected.operationId,
        })
      ).status(),
    ).toBe(409);
    expect(await read()).toEqual(own);
    await post('discard', { version: own.draft.version });
    await object('bike', { description: 'Oberoende uppgift' });
    expect(
      (
        await post('undo', {
          version: (await read()).draft.version,
          userId: selected.userId,
          operationId: selected.operationId,
        })
      ).status(),
    ).toBe(200);
    await installation.restart();
    const pending = await read();
    expect(pending.draft.changes.find((item) => item.id === 'bike')?.after).toMatchObject({
      typeId: 'cycle',
      description: 'Oberoende uppgift',
      customValues: { serial: 'SYNTH-42', insured: false },
    });
    await save('undo');
    expect((await read()).objects.find((item) => item.id === 'bike')).toMatchObject({
      typeId: 'cycle',
      description: 'Oberoende uppgift',
    });
  } finally {
    await other.close();
    await installation.close();
  }
});
