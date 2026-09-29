import { type APIRequestContext, expect, test } from '@playwright/test';
import sharp from 'sharp';
import { draftConflicts } from '../../src/shared/draft-conflicts.js';
import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import { createHousehold, openWorkspace, signIn } from '../support/client.js';
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
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Uppgifter för Alex blå cykel', exact: true }).click();
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
    await openWorkspace(page);
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
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Visa historik' }).click();
    const selected = page
      .getByRole('region', { name: 'Ändringshistorik' })
      .getByRole('article')
      .filter({ hasText: 'Objekttyp: Motorfordon' })
      .filter({ hasText: 'Nummer: 42' });
    await expect(selected).toHaveCount(1);
    await selected.getByText('Visa ändringarna', { exact: true }).click();
    await expect(selected).toContainText('Objekttyp: Cykel');
    await expect(selected).toContainText('Nummer: SYNTH-42');
    await expect(selected.getByText('Objekttyp: Cykel', { exact: false })).toBeVisible();
    await expect(selected.getByText('Objekttyp: Motorfordon', { exact: false })).toBeVisible();
    await expect(selected.getByText('Nummer: SYNTH-42', { exact: true })).toBeVisible();
    await expect(selected.getByText('Nummer: 42', { exact: true })).toBeVisible();
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

for (const width of [1280, 390, 320]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`TYP-11: repeated type changes keep distinct former answers and complete common values through save and restart at ${width}px in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      const installation = await createInstallation();
      try {
        await signIn(page.request, installation.origin);
        const { household } = await (
          await createHousehold(page.request, installation.origin)
        ).json();
        const path = `${installation.origin}/api/households/${household.id}/map`;
        const read = async (): Promise<MapState> => (await page.request.get(path)).json();
        const propose = async (route: string, id: string, value: unknown) => {
          const response = await page.request.post(`${path}/${route}`, {
            headers: { origin: installation.origin },
            data: { version: (await read()).draft.version, id, baseRevision: null, value },
          });
          expect(response.status()).toBe(200);
        };
        const fields = [
          { id: 'serial', name: 'Nummer', description: '', kind: 'text', sectionId: 'facts' },
          { id: 'amount', name: 'Antal', description: '', kind: 'number', sectionId: 'facts' },
          {
            id: 'insured',
            name: 'Försäkrad',
            description: '',
            kind: 'boolean',
            sectionId: 'facts',
          },
        ];
        for (const [id, name] of [
          ['cycle', 'Cykel'],
          ['vehicle', 'Motorfordon'],
        ]) {
          await propose('object-type', id, {
            name,
            description: '',
            fields,
            sections: [{ id: 'facts', name: 'Egenskaper' }],
            builtins: [],
            propertyOrder: ['field:serial', 'field:amount', 'field:insured'],
          });
        }
        const common = {
          name: 'Alex blå cykel',
          description: 'Gemensamma uppgifter som ska finnas kvar',
          identity: 'unspecified',
          iconId: 'bike',
          financialFacts: {
            debt: { knowledge: 'uncertain', value: '125 000,50', reportedOn: '2026-09-01' },
            creditLimit: { knowledge: 'none', reportedOn: '2026-09-02' },
            usedCredit: { knowledge: 'known', value: '0', reportedOn: '2026-09-03' },
            price: { knowledge: 'unknown' },
          },
        };
        await propose('draft', 'bike', {
          ...common,
          typeId: 'cycle',
          customValues: { serial: 'A-42', amount: 0, insured: false },
        });
        await propose('draft', 'garage', { typeId: 'cycle', name: 'Garaget', description: '' });
        await propose('relationship', 'parking', {
          typeId: (await read()).relationshipTypes[0].id,
          sourceId: 'bike',
          targetId: 'garage',
          knowledge: 'uncertain',
        });
        await page.goto(installation.origin);
        await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', theme);
        await openWorkspace(page);
        await page
          .getByRole('button', { name: 'Uppgifter för Alex blå cykel', exact: true })
          .click();
        const panel = page.getByRole('region', { name: 'Alex blå cykel', exact: true });
        await panel.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
        const image = await sharp({
          create: { width: 80, height: 80, channels: 3, background: '#0088ff' },
        })
          .png()
          .toBuffer();
        await panel.getByLabel('Välj profilbild').setInputFiles({
          name: 'cykel.png',
          mimeType: 'image/png',
          buffer: image,
        });
        await expect(panel.getByAltText('Profilbild för Alex blå cykel')).toBeVisible();
        const imageId = (await read()).draft.changes.find((change) => change.id === 'bike')?.after
          ?.profileImageId;
        expect(imageId).toBeTruthy();
        await panel.getByRole('button', { name: 'Stäng utan att skicka texten' }).click();
        await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Sparat');
        const initial = await read();
        await page
          .getByRole('button', { name: 'Uppgifter för Alex blå cykel', exact: true })
          .click();
        await panel.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
        const previous = panel.getByRole('region', { name: 'Tidigare fältvärden', exact: true });
        const acknowledge = panel.getByLabel('Jag har hanterat tidigare fältvärden för typbytet');
        const stage = panel.getByRole('button', { name: 'Lägg i mitt utkast', exact: true });
        for (const [index, type] of ['vehicle', 'cycle', 'vehicle'].entries()) {
          await panel.getByLabel('Objekttyp', { exact: true }).selectOption(type);
          for (const name of ['Nummer', 'Antal', 'Försäkrad']) {
            await expect(panel.getByLabel(name, { exact: true })).toHaveValue('');
          }
          await expect(acknowledge).not.toBeChecked();
          await expect(stage).toBeDisabled();
          await expect(previous.getByText(/^Objekttyp:/)).toHaveText(
            ['Objekttyp: Cykel', 'Objekttyp: Motorfordon', 'Objekttyp: Cykel'].slice(0, index + 1),
          );
          await expect(previous.getByText('Nummer: A-42', { exact: true })).toBeVisible();
          await expect(previous.getByText('Antal: 0', { exact: true })).toHaveCount(
            index === 2 ? 2 : 1,
          );
          await expect(previous.getByText('Försäkrad: Nej', { exact: true })).toHaveCount(
            index === 2 ? 2 : 1,
          );
          if (index > 0) {
            await expect(previous.getByText('Nummer: B-84', { exact: true })).toBeVisible();
            await expect(previous.getByText('Antal: 8', { exact: true })).toBeVisible();
            await expect(previous.getByText('Försäkrad: Ja', { exact: true })).toBeVisible();
          }
          if (index === 2)
            await expect(previous.getByText('Nummer: A-126', { exact: true })).toBeVisible();
          await expect(panel.getByLabel('Objektets namn')).toHaveValue('Alex blå cykel');
          await expect(panel.getByLabel('Objektets identitet')).toHaveValue('unspecified');
          await expect(panel.getByLabel('Beskrivning', { exact: true })).toHaveValue(
            common.description,
          );
          await expect(panel.getByAltText('Profilbild för Alex blå cykel')).toHaveAttribute(
            'src',
            new RegExp(`/profile-images/${imageId}$`),
          );
          await panel
            .getByLabel('Nummer', { exact: true })
            .fill(['B-84', 'A-126', 'B-final'][index]);
          if (index < 2) {
            await panel.getByLabel('Antal', { exact: true }).fill(index === 0 ? '8' : '0');
            await panel
              .getByLabel('Försäkrad', { exact: true })
              .selectOption(index === 0 ? 'true' : 'false');
          }
          await acknowledge.check();
          await expect(stage).toBeEnabled();
        }
        await panel.getByText('Ekonomiska uppgifter och avtalsvillkor', { exact: true }).click();
        await expect(panel.getByLabel('Senast uppgiven skuld', { exact: true })).toHaveValue(
          '125 000,50',
        );
        await expect(panel.getByLabel('Senast uppgiven skuld: uppgiftens säkerhet')).toHaveValue(
          'uncertain',
        );
        await expect(panel.getByLabel('Senast uppgiven skuld: datum för uppgiften')).toHaveValue(
          '2026-09-01',
        );
        await stage.click();
        const staged = await read();
        expect(staged.objects).toEqual(initial.objects);
        expect(staged.relationships).toEqual(initial.relationships);
        expect(staged.draft.changes).toHaveLength(1);
        expect(staged.draft.changes[0]).toMatchObject({
          id: 'bike',
          after: {
            ...common,
            typeId: 'vehicle',
            profileImageId: imageId,
            customValues: { serial: 'B-final' },
          },
        });
        expect(staged.draft.changes[0].after?.customValues).toEqual({ serial: 'B-final' });
        expect(staged.draft.changes[0].after?.financialFacts).toEqual(common.financialFacts);
        await installation.restart();
        await page.reload();
        await openWorkspace(page);
        await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
          'Nummer: B-final',
        );
        expect((await read()).draft).toEqual(staged.draft);
        await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Sparat');
        await installation.restart();
        await page.reload();
        await openWorkspace(page);
        const saved = await read();
        expect(saved.objects.find((object) => object.id === 'bike')).toMatchObject({
          ...common,
          typeId: 'vehicle',
          profileImageId: imageId,
          customValues: { serial: 'B-final' },
        });
        expect(saved.objects.find((object) => object.id === 'bike')?.financialFacts).toEqual(
          common.financialFacts,
        );
        expect(saved.relationships).toEqual(initial.relationships);
        await page
          .getByRole('button', { name: 'Uppgifter för Alex blå cykel', exact: true })
          .click();
        await expect(panel).toContainText('Nummer: B-final');
        await expect(panel).toContainText('Senast uppgiven skuld: 125 000,50 (Osäkert uppgivet)');
        await expect(panel.getByAltText('Profilbild för Alex blå cykel')).toHaveAttribute(
          'src',
          new RegExp(`/profile-images/${imageId}$`),
        );
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      } finally {
        await installation.close();
      }
    });
  }
}

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
