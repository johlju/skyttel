import { conflictBasis } from '../../src/shared/conflict-properties.js';
import { draftConflicts } from '../../src/shared/draft-conflicts.js';
import { closeTextView, signIn } from '../support/client.js';
import { conflictCollaborators } from '../support/conflict-properties.js';
import {
  expectConflictDraftValues,
  expectConflictReadValue,
  refreshConflictReader,
} from '../support/current-conflict-reading.js';
import { openObjectRelationships, readTableObject } from '../support/domain-work.js';
import { alex, robin } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

for (const width of [1440, 390])
  test(`UTKAST-${width === 1440 ? '28' : '106'}: mix explicit property choices without saving the shared map at ${width}px`, async ({
    page,
    browser,
  }) => {
    const other = await createPreparedContext(browser);
    const app = await conflictCollaborators(page.request, other.request);
    try {
      await page.setViewportSize({ width, height: 900 });
      const initial = await app.read();
      await app.propose(page.request, 'draft', 'lo', {
        typeId: initial.types[0].id,
        name: 'Lo Lind',
        identity: 'unspecified',
        lifecycle: 'active',
        properties: [
          {
            id: 'description',
            label: 'Beskrivning',
            kind: 'text' as const,
            value: 'Min anteckning',
          },
        ],
      });
      await app.propose(other.request, 'draft', 'lo', {
        typeId: initial.types[0].id,
        name: 'Lo Berg',
        properties: [
          {
            id: 'description',
            label: 'Beskrivning',
            kind: 'text' as const,
            value: 'Robins anteckning',
          },
        ],
      });
      expect((await app.save(other.request, 'concurrent')).status()).toBe(200);
      const saved = await app.read();
      await page.goto(app.installation.origin);
      await page
        .getByRole('navigation', { name: 'Kartans verktyg' })
        .getByRole('button', { name: 'Tabell', exact: true })
        .click();
      const opener = page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
      await expect(
        dialog.getByRole('heading', { name: 'Granska konflikter', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(
        true,
      );
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(
        true,
      );
      await expect(dialog).toContainText(
        'Robin sparade ändringar efter att du gjorde ditt förslag, men innan du hann spara det.',
      );
      await expect(
        dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }),
      ).toBeDisabled();
      const conflict = draftConflicts(saved)[0];
      const incomplete = await app.post(page.request, 'resolve', {
        version: saved.draft.version,
        contentVersion: saved.contentVersion,
        conflict,
        basis: conflictBasis(saved, conflict),
        choices: { name: 'proposed' },
      });
      expect(incomplete.status()).toBe(400);
      expect((await app.read()).draft).toEqual(saved.draft);
      await dialog
        .getByRole('button', { name: 'Namn: Ditt förslag – Lo Lind', exact: true })
        .click();
      await expect(
        dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }),
      ).toBeDisabled();
      await dialog
        .getByRole('button', {
          name: 'Beskrivning · egenskap 1: Sparat i kartan nu – Beskrivning: Robins anteckning (Text)',
          exact: true,
        })
        .click();
      const preview = dialog.getByRole('region', { name: 'Resultat av valen', exact: true });
      await expect(preview).toContainText('Lo Lind');
      await expect(preview).toContainText('Robins anteckning');
      await expect(preview).not.toContainText('Min anteckning');
      await expect(
        dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }),
      ).toBeDisabled();
      await dialog
        .getByRole('button', {
          name: 'Identifiering: Sparat i kartan nu – Identifierat objekt',
          exact: true,
        })
        .click();
      await dialog
        .getByRole('button', { name: 'Giltighet: Ditt förslag – Gäller fortfarande', exact: true })
        .click();
      await expect(preview).toContainText('Identifierat objekt');
      await expect(preview).toContainText('Gäller fortfarande');
      await page.screenshot({ path: `/tmp/skyttel-244/255-${width}-choices.png` });
      await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText('Valen finns i ditt utkast');
      await expect(dialog.getByRole('navigation', { name: 'Alla konflikter' })).toContainText(
        'Objekt',
      );
      await expect(dialog.getByRole('navigation', { name: 'Alla konflikter' })).toContainText(
        'Lo Lind',
      );
      await expect(dialog.locator('.cp-resolved-mark')).toHaveText('✓');
      const after = await app.read();
      expect(after.objects).toEqual(saved.objects);
      expect(after.draft.changes[0].after).toMatchObject({
        name: 'Lo Lind',
        properties: expect.arrayContaining([
          expect.objectContaining({
            label: 'Beskrivning',
            kind: 'text',
            value: 'Robins anteckning',
          }),
        ]),
      });
      expect((await (await page.request.get(`${app.path}/history`)).json()).history).toHaveLength(
        2,
      );
      expect(
        (await (await page.request.get(`${app.path}/history`)).json()).history[1].changes[0],
      ).not.toHaveProperty('proposedAt');
      await page.screenshot({ path: `/tmp/skyttel-244/255-${width}-resolved.png` });
      await page.keyboard.press('Escape');
      await expect(opener).toHaveCount(0);
      await expect(
        page
          .getByRole('navigation', { name: 'Kartans verktyg' })
          .getByRole('button', { name: 'Karta', exact: true }),
      ).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );

      const tableDetails = await readTableObject(page, 'Lo Lind');
      await expectConflictReadValue(
        tableDetails,
        'Namn',
        /^Sparat: Lo Berg\s*◇ Ditt förslag: Lo Lind$/,
      );
      await expect(
        tableDetails
          .locator('dt')
          .filter({ hasText: /^Beskrivning$/ })
          .locator('..')
          .locator('dd'),
      ).toContainText('Robins anteckning');
      await expectConflictReadValue(tableDetails, 'Identitet', 'Identifierat objekt');
      await expectConflictReadValue(tableDetails, 'Status', 'Gäller fortfarande');
      await expectConflictDraftValues(page, 'Lo Lind', {
        Namn: 'Lo Lind',
        Beskrivning: 'Robins anteckning',
        Identitet: 'Identifierat objekt',
        Status: 'Gäller fortfarande',
      });
      await closeTextView(page);

      // Repeat the documented keyboard path from Karta with a fresh conflict.
      const mapOwner = await createPreparedContext(browser);
      const mapMember = await createPreparedContext(browser);
      const mapApp = await conflictCollaborators(mapOwner.request, mapMember.request);
      try {
        const mapPage = await mapOwner.newPage();
        await mapPage.setViewportSize({ width, height: 900 });
        const mapInitial = await mapApp.read();
        await mapApp.propose(mapOwner.request, 'draft', 'lo', {
          typeId: mapInitial.types[0].id,
          name: 'Lo Lind',
          identity: 'unspecified',
          lifecycle: 'active',
          properties: [
            {
              id: 'description',
              label: 'Beskrivning',
              kind: 'text' as const,
              value: 'Min anteckning',
            },
          ],
        });
        await mapApp.propose(mapMember.request, 'draft', 'lo', {
          typeId: mapInitial.types[0].id,
          name: 'Lo Berg',
          properties: [
            {
              id: 'description',
              label: 'Beskrivning',
              kind: 'text' as const,
              value: 'Robins anteckning',
            },
          ],
        });
        expect((await mapApp.save(mapMember.request, 'concurrent')).status()).toBe(200);
        const mapSaved = await mapApp.read();
        const mapHistory = await (await mapOwner.request.get(`${mapApp.path}/history`)).json();
        await mapPage.goto(mapApp.installation.origin);
        const mapOpener = mapPage.getByRole('button', {
          name: '1 konflikt i ditt utkast',
          exact: true,
        });
        await mapOpener.focus();
        await mapPage.keyboard.press('Enter');
        const mapDialog = mapPage.getByRole('dialog', {
          name: 'Granska konflikter',
          exact: true,
        });
        await expect(
          mapDialog.getByRole('heading', { name: 'Granska konflikter', exact: true }),
        ).toBeFocused();
        for (const key of ['Shift+Tab', 'Tab']) {
          await mapPage.keyboard.press(key);
          expect(
            await mapPage.evaluate(() => document.activeElement?.closest('dialog') !== null),
          ).toBe(true);
        }
        for (const name of [
          'Namn: Ditt förslag – Lo Lind',
          'Beskrivning · egenskap 1: Sparat i kartan nu – Beskrivning: Robins anteckning (Text)',
          'Identifiering: Sparat i kartan nu – Identifierat objekt',
          'Giltighet: Ditt förslag – Gäller fortfarande',
        ]) {
          await mapDialog.getByRole('button', { name, exact: true }).focus();
          await mapPage.keyboard.press('Enter');
        }
        const mapPreview = mapDialog.getByRole('region', {
          name: 'Resultat av valen',
          exact: true,
        });
        await expect(mapPreview).toContainText('Lo Lind');
        await expect(mapPreview).toContainText('Robins anteckning');
        await expect(mapPreview).toContainText('Identifierat objekt');
        await expect(mapPreview).toContainText('Gäller fortfarande');
        await mapDialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).focus();
        await mapPage.keyboard.press('Enter');
        await expect(mapDialog.getByRole('status')).toContainText('Valen finns i ditt utkast');
        const mapAfter = await mapApp.read();
        expect(mapAfter.objects).toEqual(mapSaved.objects);
        expect(mapAfter.draft.changes[0].after).toMatchObject({
          name: 'Lo Lind',
          properties: expect.arrayContaining([
            expect.objectContaining({
              label: 'Beskrivning',
              kind: 'text',
              value: 'Robins anteckning',
            }),
          ]),
          lifecycle: 'active',
        });
        expect(mapAfter.draft.changes[0].after?.identity ?? 'identified').toBe('identified');
        expect(await (await mapOwner.request.get(`${mapApp.path}/history`)).json()).toEqual(
          mapHistory,
        );
        await mapPage.keyboard.press('Escape');
        await expect(mapOpener).toHaveCount(0);
        await expect(
          mapPage
            .getByRole('navigation', { name: 'Kartans verktyg' })
            .getByRole('button', { name: 'Karta', exact: true }),
        ).toBeFocused();
        expect(
          await mapPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
      } finally {
        await mapOwner.close();
        await mapMember.close();
        await mapApp.installation.close();
      }
    } finally {
      await other.close();
      await app.installation.close();
    }
  });

test('UTKAST-29: invalid relationship property combinations keep every choice until corrected', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await conflictCollaborators(page.request, other.request);
  const member = await other.newPage();
  try {
    let state = await app.read();
    const edge = { typeId: state.relationshipTypes[0].id, sourceId: 'lo', targetId: 'service' };
    await app.propose(page.request, 'relationship', 'edge', edge);
    await app.propose(page.request, 'relationship', 'existing', {
      ...edge,
      sourceId: 'service',
      targetId: 'lo',
    });
    await app.save(page.request, 'base-edge');
    await app.propose(page.request, 'relationship', 'edge', {
      ...edge,
      targetId: 'lo',
      properties: [
        {
          id: 'certainty',
          label: 'Uppgiftens säkerhet',
          kind: 'text' as const,
          value: 'Osäkert uppgivet',
        },
      ],
    });
    await app.propose(other.request, 'relationship', 'edge', {
      ...edge,
      sourceId: 'service',
    });
    await app.save(other.request, 'changed-edge');
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter' });
    await dialog
      .getByRole('button', { name: 'Från objekt: Sparat i kartan nu – Molnmusik', exact: true })
      .click();
    await dialog
      .getByRole('button', { name: 'Till objekt: Ditt förslag – Lo Exempel', exact: true })
      .click();
    await expect(dialog.getByRole('region', { name: 'Ditt förslag', exact: true })).toContainText(
      'Uppgiftens säkerhet: Osäkert uppgivet (Text)',
    );
    await expect(
      dialog.getByRole('button', { name: /^Uppgiftens säkerhet · egenskap 1:/ }),
    ).toHaveCount(0);
    await expect(dialog.getByRole('alert')).toContainText('finns redan i kartan');
    await expect(dialog.getByRole('button', { name: 'Lägg valen i utkastet' })).toBeDisabled();
    await expect(
      dialog.getByRole('button', { name: 'Till objekt: Ditt förslag – Lo Exempel' }),
    ).toHaveAttribute('aria-pressed', 'true');
    state = await app.read();
    const conflict = draftConflicts(state)[0];
    const invalid = await app.post(page.request, 'resolve', {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      conflict,
      basis: conflictBasis(state, conflict),
      choices: {
        sourceId: 'saved',
        targetId: 'proposed',
      },
    });
    expect(invalid.status()).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'invalid_resolution' });
    expect((await app.read()).draft).toEqual(state.draft);
    await dialog
      .getByRole('button', { name: 'Från objekt: Ditt förslag – Lo Exempel', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet' }).click();
    await expect(dialog.getByRole('status')).toContainText('Valen finns');
    expect((await app.read()).draft.relationships?.[0].after).toMatchObject({
      sourceId: 'lo',
      targetId: 'lo',
      properties: [
        {
          id: 'certainty',
          label: 'Uppgiftens säkerhet',
          kind: 'text' as const,
          value: 'Osäkert uppgivet',
        },
      ],
    });
    await page.keyboard.press('Escape');
    await expectConflictDraftValues(page, 'Lo Exempel → Använder → Lo Exempel', {
      Från: 'Lo Exempel',
      Sambandstyp: 'Använder',
      Till: 'Lo Exempel',
      'Uppgiftens säkerhet': 'Osäkert uppgivet',
    });
    await closeTextView(page);
    await refreshConflictReader(member, app.installation.origin);
    const savedRelationships = await openObjectRelationships(member, 'Molnmusik');
    const savedRelationship = savedRelationships
      .getByRole('heading', { name: 'Molnmusik → Använder → Molnmusik', exact: true })
      .locator('..');
    await expectConflictReadValue(savedRelationship, 'Typ', 'Använder');
    await expectConflictReadValue(savedRelationship, 'Till objekt', 'Molnmusik');
    await expect(
      savedRelationship.locator('dt').filter({ hasText: /^Uppgiftens säkerhet$/ }),
    ).toHaveCount(0);
    await member.keyboard.press('Escape');
  } finally {
    await other.close();
    await app.installation.close();
  }
});

for (const kind of ['object', 'relationship'] as const)
  test(`UTKAST-${kind === 'object' ? '33' : '107'}: long unbroken ${kind} names wrap in the conflict heading and list at 320 CSS pixels`, async ({
    page,
    browser,
  }) => {
    const other = await createPreparedContext(browser);
    const longName = 'Föremålsnamn'.repeat(14);
    const app = await conflictCollaborators(page.request, other.request, [
      ['lo', longName],
      ['service', 'Molnmusik'],
    ]);
    try {
      await page.setViewportSize({ width: 320, height: 900 });
      const state = await app.read();
      if (kind === 'object') {
        const value = {
          typeId: state.types[0].id,
          name: longName,
          properties: [
            { id: 'description', label: 'Beskrivning', kind: 'text' as const, value: 'Egen text' },
          ],
        };
        await app.propose(page.request, 'draft', 'lo', value);
        await app.propose(other.request, 'draft', 'lo', {
          ...value,
          properties: [
            {
              id: 'description',
              label: 'Beskrivning',
              kind: 'text' as const,
              value: 'Sparad text',
            },
          ],
        });
      } else {
        const edge = { typeId: state.relationshipTypes[0].id, sourceId: 'lo', targetId: 'service' };
        await app.propose(page.request, 'relationship', 'edge', edge);
        await app.save(page.request, 'edge');
        await app.propose(page.request, 'relationship', 'edge', {
          ...edge,
          properties: [
            {
              id: 'certainty',
              label: 'Uppgiftens säkerhet',
              kind: 'text' as const,
              value: 'Osäkert uppgivet',
            },
          ],
        });
        await app.propose(other.request, 'relationship', 'edge', { ...edge, lifecycle: 'ended' });
      }
      await app.save(other.request, 'concurrent');
      const beforeReading = await app.read();
      await page.goto(app.installation.origin);
      await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Granska konflikter' });
      await expect(dialog.getByRole('heading', { level: 2 })).toContainText(longName);
      await expect(dialog.getByRole('navigation', { name: 'Alla konflikter' })).toContainText(
        longName,
      );
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      expect(
        await dialog
          .locator('.cp-detail')
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      const caseName = dialog.locator('.cp-case-text');
      expect(await caseName.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }),
      ).toBeFocused();
      const afterReading = await app.read();
      expect(afterReading.objects).toEqual(beforeReading.objects);
      expect(afterReading.relationships).toEqual(beforeReading.relationships);
      expect(afterReading.draft).toEqual(beforeReading.draft);
    } finally {
      await other.close();
      await app.installation.close();
    }
  });

test('UTKAST-34: individual free property labels remain unchanged on both conflict sides and the result', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await conflictCollaborators(page.request, other.request);
  try {
    let state = await app.read();
    const type = state.types[0];
    expect(
      (
        await app.post(page.request, 'object-type', {
          version: state.draft.version,
          id: type.id,
          baseRevision: type.revision,
          value: { ...type },
        })
      ).status(),
    ).toBe(200);
    await app.save(page.request, 'labels');
    state = await app.read();
    const value = {
      typeId: type.id,
      name: 'Lo Exempel',
      properties: [
        {
          id: 'description',
          label: 'Anteckningar',
          kind: 'text' as const,
          value: 'Egen anteckning',
        },
        { id: 'price', label: 'Avtalat pris', kind: 'text' as const, value: '120' },
      ],
    };
    await app.propose(page.request, 'draft', 'lo', value);
    await app.propose(other.request, 'draft', 'lo', {
      ...value,
      properties: [
        {
          id: 'description',
          label: 'Anteckningar',
          kind: 'text' as const,
          value: 'Sparad anteckning',
        },
        { id: 'price', label: 'Avtalat pris', kind: 'text' as const, value: '240' },
      ],
    });
    await app.save(other.request, 'changed');
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter' });
    for (const side of ['Sparat i kartan nu', 'Ditt förslag']) {
      const panel = dialog.getByRole('region', { name: side, exact: true });
      await expect(
        panel.getByRole('button', { name: /^Anteckningar · egenskap \d+:/ }),
      ).toBeVisible();
      await expect(
        panel.getByRole('button', { name: /^Avtalat pris · egenskap \d+:/ }),
      ).toBeVisible();
      await expect(panel.getByRole('button', { name: /^Beskrivning:|^Pris:/ })).toHaveCount(0);
    }
    await dialog
      .getByRole('button', {
        name: 'Anteckningar · egenskap 1: Ditt förslag – Anteckningar: Egen anteckning (Text)',
        exact: true,
      })
      .click();
    await dialog
      .getByRole('button', {
        name: 'Avtalat pris · egenskap 2: Sparat i kartan nu – Avtalat pris: 240 (Text)',
        exact: true,
      })
      .click();
    const preview = dialog.getByRole('region', { name: 'Resultat av valen' });
    await expect(
      preview.locator('dt').filter({ hasText: /^Anteckningar(?: · egenskap \d+)?$/ }),
    ).toBeVisible();
    await expect(
      preview.locator('dt').filter({ hasText: /^Avtalat pris(?: · egenskap \d+)?$/ }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet' }).click();
    await expect(dialog.getByRole('status')).toContainText('Valen finns');
    await expect(dialog.locator('.cp-preview')).toContainText('Anteckningar');
    await expect(dialog.locator('.cp-preview')).toContainText('Avtalat pris');
    await expect(dialog.locator('.cp-preview')).toContainText('240');
    expect((await app.read()).draft.changes[0].after).toMatchObject({
      properties: [
        {
          id: 'description',
          label: 'Anteckningar',
          kind: 'text' as const,
          value: 'Egen anteckning',
        },
        { id: 'price', label: 'Avtalat pris', kind: 'text' as const, value: '240' },
      ],
    });
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-35: saved property attribution identifies each actual saver after independent later changes', async ({
  page,
  browser,
}) => {
  const lo = await createPreparedContext(browser);
  const app = await conflictCollaborators(page.request, lo.request, undefined, {
    ...robin,
    name: 'Lo Exempel',
  });
  const proposer = await createPreparedContext(browser);
  try {
    app.installation.setIdentity({
      subject: 'third-person',
      name: 'Robin Exempel',
      email: 'third@example.test',
    });
    await signIn(proposer.request, app.installation.origin);
    const { user } = await (
      await proposer.request.get(`${app.installation.origin}/api/bootstrap`)
    ).json();
    const { code } = await (
      await page.request.post(`${app.path.replace('/map', '')}/invitations`, {
        headers: { origin: app.installation.origin },
        data: { userId: user.id },
      })
    ).json();
    expect(
      (
        await proposer.request.post(`${app.installation.origin}/api/invitations/accept`, {
          headers: { origin: app.installation.origin },
          data: { code },
        })
      ).status(),
    ).toBe(200);
    const state = await app.read();
    const value = {
      typeId: state.types[0].id,
      name: 'Eget namn',
      properties: [
        { id: 'description', label: 'Anteckningar', kind: 'text' as const, value: 'Egen text' },
      ],
    };
    await app.propose(proposer.request, 'draft', 'lo', value);
    await app.propose(lo.request, 'draft', 'lo', { ...value, name: 'Lo Berg' });
    await app.save(lo.request, 'lo-name');
    app.installation.setIdentity(alex);
    await app.propose(page.request, 'draft', 'lo', {
      ...value,
      name: 'Lo Berg',
      properties: [
        { id: 'description', label: 'Anteckningar', kind: 'text' as const, value: 'Alex text' },
      ],
    });
    await app.save(page.request, 'alex-description');
    const proposerPage = await proposer.newPage();
    await proposerPage.goto(app.installation.origin);
    await proposerPage
      .getByRole('button', { name: '1 konflikt i ditt utkast', exact: true })
      .click();
    const saved = proposerPage.getByRole('region', { name: 'Sparat i kartan nu', exact: true });
    const name = saved.getByRole('button', {
      name: 'Namn: Sparat i kartan nu – Lo Berg',
      exact: true,
    });
    await expect(name).toContainText('Lo sparade ett nytt värde');
    await expect(name).not.toContainText('Alex sparade');
    await expect(name).toContainText('efter att du började ändra den här uppgiften');
    await expect(
      saved.getByRole('button', {
        name: 'Anteckningar · egenskap 1: Sparat i kartan nu – Anteckningar: Alex text (Text)',
        exact: true,
      }),
    ).toContainText('Alex sparade ett nytt värde');
    // A later ordinary edit retains the old basis but gives the proposal a new timestamp.
    const draft = (await app.read(proposer.request)).draft;
    expect(
      (
        await app.post(proposer.request, 'draft', {
          version: draft.version,
          id: 'lo',
          baseRevision: draft.changes[0].before?.revision,
          value: { ...value, name: 'Eget senare namn' },
        })
      ).status(),
    ).toBe(200);
    await proposerPage.reload();
    await proposerPage
      .getByRole('button', { name: '1 konflikt i ditt utkast', exact: true })
      .click();
    await expect(saved).toContainText('Lo sparade ett nytt värde');
    await expect(saved).toContainText('Alex sparade ett nytt värde');
    await expect(saved).not.toContainText('efter att du började ändra den här uppgiften');
    await expect(
      proposerPage.getByRole('dialog', { name: 'Granska konflikter' }),
    ).not.toContainText('efter att du gjorde ditt förslag');
    await expect(
      proposerPage.getByRole('dialog', { name: 'Granska konflikter' }),
    ).not.toContainText('efter att du började ändra den här uppgiften');
  } finally {
    await proposer.close();
    await lo.close();
    await app.installation.close();
  }
});
