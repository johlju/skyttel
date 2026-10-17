import type { Locator } from '@playwright/test';
import sharp from 'sharp';
import type { MapState } from '../../src/shared/map.js';
import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openDraftReview,
  openTable,
  signIn,
} from '../support/client.js';
import { applyProposedConflictChanges } from '../support/conflict-properties.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import {
  editTableObject,
  openObjectRelationships,
  readDraftProposal,
  readTableObject,
} from '../support/domain-work.js';
import { createInstallation, robin } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';
import { typeChangeHousehold } from '../support/type-change-http.js';

test('TYP-06: type changes review displaced values and preserve identity, edges and historical reading through restart', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, post, save } = await typeChangeHousehold(page.request, installation.origin);
    const initial = await read();
    await page.goto(installation.origin);
    await openTable(page);
    await editTableObject(page, 'Alex blå cykel');
    await page.getByLabel('Objekttyp', { exact: true }).selectOption('vehicle');
    const previous = page.getByRole('dialog', { name: 'Ta bort tidigare egna fält?', exact: true });
    await expect(previous).toContainText('Nummer: SYNTH-42');
    await expect(previous).toContainText('Försäkrad: Nej');
    await previous
      .getByRole('button', { name: 'Ta bort fältvärdena och byt typ', exact: true })
      .click();
    const form = page.getByRole('dialog', { name: 'Redigera Alex blå cykel', exact: true });
    await form.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await expect(form.getByLabel('Nummer', { exact: true })).toHaveValue('');
    await expect(form.getByLabel('Försäkrad', { exact: true })).toHaveValue('');
    await form.getByLabel('Nummer', { exact: true }).fill('42');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const review = await readDraftProposal(page, 'Alex blå cykel');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Typ(?: · ändrat)?$/ })
        .first()
        .locator('..'),
    ).toContainText('Cykel');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Typ(?: · ändrat)?$/ })
        .last()
        .locator('..'),
    ).toContainText('Motorfordon');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Nummer(?: · ändrat)?$/ })
        .first()
        .locator('..'),
    ).toContainText('SYNTH-42');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Nummer(?: · ändrat)?$/ })
        .last()
        .locator('..'),
    ).toContainText('42');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Försäkrad(?: · ändrat)?$/ })
        .last()
        .locator('..'),
    ).toContainText('Ej uppgivet');
    await closeSupportDialog(page, 'Alex blå cykel');
    await installation.restart();
    await page.reload();
    await readDraftProposal(page, 'Alex blå cykel');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Nummer(?: · ändrat)?$/ })
        .first()
        .locator('..'),
    ).toContainText('SYNTH-42');
    await closeSupportDialog(page, 'Alex blå cykel');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
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
    await openTable(page);
    await page.getByRole('button', { name: 'Rapporter' }).click();
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
    await installation.restart();
    expect((await read()).objects.find((item) => item.id === 'bike')).toEqual(
      changed.objects.find((item) => item.id === 'bike'),
    );
    expect((await read()).relationships).toEqual(initial.relationships);
  } finally {
    await installation.close();
  }
});

for (const width of [1280, 390, 320]) {
  for (const theme of ['light', 'dark'] as const) {
    const caseId =
      width === 1280
        ? theme === 'light'
          ? 'TYP-11'
          : 'TYP-18'
        : width === 390
          ? theme === 'light'
            ? 'TYP-19'
            : 'TYP-20'
          : theme === 'light'
            ? 'TYP-21'
            : 'TYP-22';
    test(`${caseId}: repeated type changes confirm loss and retain common values at ${width}px in ${theme}`, async ({
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
        await openTable(page);
        await editTableObject(page, 'Alex blå cykel');
        const form = page.getByRole('dialog', { name: 'Redigera Alex blå cykel', exact: true });
        await form.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
        const image = await sharp({
          create: { width: 80, height: 80, channels: 3, background: '#0088ff' },
        })
          .png()
          .toBuffer();
        await form.getByLabel('Profilbild', { exact: true }).setInputFiles({
          name: 'cykel.png',
          mimeType: 'image/png',
          buffer: image,
        });
        await expect(form.getByAltText('Profilbild för Alex blå cykel')).toBeVisible();
        await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
        const imageId = (await read()).draft.changes.find((change) => change.id === 'bike')?.after
          ?.profileImageId;
        expect(imageId).toBeTruthy();
        await openTable(page);
        await saveReviewedConflictDraft(page);
        await closeTextView(page);
        const initial = await read();
        await editTableObject(page, 'Alex blå cykel');
        const stage = form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true });
        for (const [index, type] of ['vehicle', 'cycle', 'vehicle'].entries()) {
          await form.getByLabel('Objekttyp', { exact: true }).selectOption(type);
          const loss = page.getByRole('dialog', {
            name: 'Ta bort tidigare egna fält?',
            exact: true,
          });
          await expect(loss).toContainText(`Nummer: ${['A-42', 'B-84', 'A-126'][index]}`);
          await expect(loss).toContainText(`Antal: ${index === 1 ? '8' : '0'}`);
          await expect(loss).toContainText(`Försäkrad: ${index === 1 ? 'Ja' : 'Nej'}`);
          await loss
            .getByRole('button', { name: 'Ta bort fältvärdena och byt typ', exact: true })
            .click();
          await expect(form.getByLabel('Namn', { exact: true })).toHaveValue('Alex blå cykel');
          await expect(form.getByLabel('Identitet', { exact: true })).toHaveValue('unspecified');
          await expect(form.getByLabel('Beskrivning', { exact: true })).toHaveValue(
            common.description,
          );
          await form.getByRole('button', { name: 'Egenskaper', exact: true }).click();
          for (const name of ['Nummer', 'Antal', 'Försäkrad'])
            await expect(form.getByLabel(name, { exact: true })).toHaveValue('');
          await form
            .getByLabel('Nummer', { exact: true })
            .fill(['B-84', 'A-126', 'B-final'][index]);
          if (index < 2) {
            await form.getByLabel('Antal', { exact: true }).fill(index === 0 ? '8' : '0');
            await form
              .getByLabel('Försäkrad', { exact: true })
              .selectOption(index === 0 ? 'true' : 'false');
          }
          await form.getByRole('button', { name: 'Grunduppgifter', exact: true }).click();
        }
        await form.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
        await expect(form.getByAltText('Profilbild för Alex blå cykel')).toHaveAttribute(
          'src',
          new RegExp(`/profile-images/${imageId}$`),
        );
        await expect
          .poll(() =>
            form
              .getByAltText('Profilbild för Alex blå cykel')
              .evaluate((image) => (image as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
        await expect(
          form.getByRole('region', { name: 'Ikon', exact: true }).locator('strong'),
        ).toHaveText('Cykel');
        await form.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
        await expect(form.getByLabel('Senast uppgiven skuld', { exact: true })).toHaveValue(
          '125 000,50',
        );
        await expect(form.getByLabel('Senast uppgiven skuld: uppgiftens säkerhet')).toHaveValue(
          'uncertain',
        );
        await expect(form.getByLabel('Senast uppgiven skuld: datum för uppgiften')).toHaveValue(
          '2026-09-01',
        );
        await expect(form.getByLabel('Beviljat kreditutrymme: uppgiftens säkerhet')).toHaveValue(
          'none',
        );
        await expect(form.getByLabel('Beviljat kreditutrymme: datum för uppgiften')).toHaveValue(
          '2026-09-02',
        );
        await expect(form.getByLabel('Utnyttjad kredit: uppgiftens säkerhet')).toHaveValue('known');
        await expect(form.getByLabel('Utnyttjad kredit', { exact: true })).toHaveValue('0');
        await expect(form.getByLabel('Utnyttjad kredit: datum för uppgiften')).toHaveValue(
          '2026-09-03',
        );
        await expect(form.getByLabel('Pris: uppgiftens säkerhet')).toHaveValue('unknown');
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
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const commonReadings = [
          ['Identitet', 'Ospecificerat objekt'],
          ['Ikon', 'Cykel'],
          ['Status', 'Följ slutdatum'],
          ['Profilbild', 'Profilbild finns'],
          [
            'Senast uppgiven skuld',
            '125 000,50 (Osäkert uppgivet) · datum för uppgiften: 2026-09-01',
          ],
          ['Beviljat kreditutrymme', 'Uttryckligen inget · datum för uppgiften: 2026-09-02'],
          ['Utnyttjad kredit', '0 · datum för uppgiften: 2026-09-03'],
          ['Pris', 'Okänt'],
        ];
        const expectFields = async (scope: Locator, fields: string[][]) => {
          for (const [label, value] of fields) {
            const field = scope
              .locator('dt')
              .filter({ hasText: new RegExp(`^${label}(?: · ändrat)?$`) })
              .locator('..')
              .locator('dd');
            await expect(field).toBeVisible();
            await expect(field).toHaveText(value);
          }
        };
        const expectWholeProposal = async (proposal: Locator) => {
          for (const [title, type, serial, amount, insured] of [
            ['Sparade värden', 'Cykel', 'A-42', '0', 'Nej'],
            ['Föreslagna värden', 'Motorfordon', 'B-final', 'Ej uppgivet', 'Ej uppgivet'],
          ]) {
            const side = proposal
              .locator('section')
              .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
            await expectFields(side, [
              ['Namn', 'Alex blå cykel'],
              ['Typ', type],
              ['Beskrivning', common.description],
              ['Nummer', serial],
              ['Antal', amount],
              ['Försäkrad', insured],
              ...commonReadings,
            ]);
            const image = side.getByAltText('Profilbild för Alex blå cykel');
            await expect(image).toBeVisible();
            await expect(image).toHaveAttribute('src', new RegExp(`/profile-images/${imageId}$`));
            await expect
              .poll(() => image.evaluate((image) => (image as HTMLImageElement).naturalWidth))
              .toBeGreaterThan(0);
          }
        };
        const readPreservedRelationship = async () => {
          const relationships = await openObjectRelationships(page, 'Alex blå cykel');
          const edge = relationships.getByRole('listitem').filter({
            has: page.getByRole('heading', {
              name: /^Alex blå cykel → .+ → Garaget \(Osäkert uppgivet\)$/,
            }),
          });
          await expect(edge).toHaveCount(1);
          const type = initial.relationshipTypes[0];
          await expectFields(edge, [
            ['Typ', type.name],
            ['Från objekt', 'Alex blå cykel'],
            ['Till objekt', 'Garaget'],
            ['Riktning', type.forwardLabel ?? type.name],
            ['Omvänd riktning', type.reverseLabel || 'Ej uppgivet'],
            ['Uppgiftens säkerhet', 'Osäkert uppgivet'],
            ['Status', 'Följ slutdatum'],
          ]);
          await closeSupportDialog(page, 'Samband för Alex blå cykel');
        };
        const readSavedObject = async () => {
          const panel = await readTableObject(page, 'Alex blå cykel');
          await expectFields(panel, [
            ['Nummer', 'B-final'],
            ['Antal', 'Ej uppgivet'],
            ['Försäkrad', 'Ej uppgivet'],
            ...commonReadings,
          ]);
          await expect(
            panel.getByRole('heading', { name: 'Alex blå cykel · alla uppgifter', exact: true }),
          ).toBeVisible();
          await expect(panel.getByText(common.description, { exact: true })).toBeVisible();
          const savedRow = page
            .getByRole('region', { name: 'Hushållets tabell', exact: true })
            .getByRole('row')
            .filter({ has: page.getByRole('button', { name: 'Alex blå cykel', exact: true }) });
          await expect(savedRow).toContainText('Motorfordon');
          const image = panel.getByAltText('Profilbild för Alex blå cykel');
          await expect(image).toBeVisible();
          await expect(image).toHaveAttribute('src', new RegExp(`/profile-images/${imageId}$`));
          await expect
            .poll(() => image.evaluate((image) => (image as HTMLImageElement).naturalWidth))
            .toBeGreaterThan(0);
        };
        await expectWholeProposal(await readDraftProposal(page, 'Alex blå cykel'));
        await closeSupportDialog(page, 'Alex blå cykel');
        await readPreservedRelationship();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        if (width !== 1280 || theme !== 'light') return;
        await installation.restart();
        await page.reload();
        await openTable(page);
        const restoredProposal = await readDraftProposal(page, 'Alex blå cykel');
        await expect(
          restoredProposal
            .locator('dt')
            .filter({ hasText: /^Nummer(?: · ändrat)?$/ })
            .last()
            .locator('..'),
        ).toContainText('B-final');
        await expectWholeProposal(restoredProposal);
        await closeSupportDialog(page, 'Alex blå cykel');
        await readPreservedRelationship();
        expect((await read()).draft).toEqual(staged.draft);
        await openTable(page);
        await saveReviewedConflictDraft(page);
        await closeTextView(page);
        await readSavedObject();
        await readPreservedRelationship();
        await installation.restart();
        await page.reload();
        await openTable(page);
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
        const panel = await readTableObject(page, 'Alex blå cykel');
        await expect(
          panel
            .locator('dt')
            .filter({ hasText: /^Nummer$/ })
            .locator('..'),
        ).toContainText('B-final');
        await expect(
          panel
            .locator('dt')
            .filter({ hasText: /^Senast uppgiven skuld$/ })
            .locator('..'),
        ).toContainText('125 000,50 (Osäkert uppgivet)');
        await expect(panel.getByAltText('Profilbild för Alex blå cykel')).toHaveAttribute(
          'src',
          new RegExp(`/profile-images/${imageId}$`),
        );
        await readSavedObject();
        await readPreservedRelationship();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      } finally {
        await installation.close();
      }
    });
  }
}

test('TYP-07: a native type change requires fresh definition review and preserves later private fields', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await createPreparedContext(browser);
  try {
    const { read, post, object, save, path } = await typeChangeHousehold(
      page.request,
      installation.origin,
    );
    installation.setIdentity(robin);
    await signIn(other.request, installation.origin);
    const { user } = await (await other.request.get(`${installation.origin}/api/bootstrap`)).json();
    const headers = { origin: installation.origin };
    const { code } = await (
      await page.request.post(`${path.replace('/map', '')}/invitations`, {
        headers,
        data: { userId: user.id },
      })
    ).json();
    expect(
      (
        await other.request.post(`${installation.origin}/api/invitations/accept`, {
          headers,
          data: { code },
        })
      ).status(),
    ).toBe(200);
    await object('garage', { name: 'Eget namn' });
    await page.goto(installation.origin);
    await openTable(page);
    await editTableObject(page, 'Alex blå cykel');
    const form = page.getByRole('dialog', { name: 'Redigera Alex blå cykel', exact: true });
    await form.getByLabel('Objekttyp', { exact: true }).selectOption('vehicle');
    await page
      .getByRole('dialog', { name: 'Ta bort tidigare egna fält?', exact: true })
      .getByRole('button', { name: 'Ta bort fältvärdena och byt typ', exact: true })
      .click();
    await form.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await form.getByLabel('Nummer', { exact: true }).fill('42');
    await form.getByLabel('Försäkrad', { exact: true }).selectOption('false');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
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
    const own = await read();
    const draft = await openDraftReview(page);
    await draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    const rejected = page.getByRole('dialog', { name: 'Spara utkastet', exact: true });
    await expect(rejected).toContainText(
      'Avvisat: Förslaget eller kartan har ändrats. Inget sparades av detta försök.',
    );
    expect((await read()).objects).toEqual(own.objects);
    expect((await read()).draft).toEqual(own.draft);
    await page.keyboard.press('Escape');
    await closeTextView(page);
    await page.reload();
    await applyProposedConflictChanges(page, 'Cykel');
    expect((await read()).objects).toEqual(own.objects);
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await editTableObject(page, 'Alex blå cykel');
    await form.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await form.getByLabel('Nummer', { exact: true }).fill('43');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await installation.restart();
    await page.reload();
    await openTable(page);
    const proposal = await readDraftProposal(page, 'Alex blå cykel');
    await expect(proposal).toContainText('43');
    expect((await read()).objects.find((item) => item.id === 'bike')).toMatchObject({
      typeId: 'vehicle',
      customValues: { serial: 42, insured: false },
    });
    expect((await read()).objects.find((item) => item.id === 'garage')?.name).toBe('Eget namn');
  } finally {
    await other.close();
    await installation.close();
  }
});
