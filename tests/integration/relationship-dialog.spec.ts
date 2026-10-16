import type { MapState } from '../../src/shared/map.js';
import { createHousehold, openDraftReview, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { createRelationshipFixture } from '../support/relationship-fixture.js';
import { expect, test } from '../support/test.js';

test('SAMBAND-10: a request that never reached the server is checked before safe retry and later duplicate removal is reported truthfully', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { path, read, post, household } = await createRelationshipFixture(
      page.request,
      installation.origin,
    );
    const before = (await read()).draft;
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name: 'Samband för Alex', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Använder' });
    await dialog.getByLabel('Till objekt', { exact: true }).selectOption('bicycle');
    await page.route(`${path}/relationship-form`, (route) => route.abort());
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    const check = dialog.getByRole('button', {
      name: 'Kontrollera om ändringen lades i utkastet',
      exact: true,
    });
    await expect(check).toBeVisible();
    expect((await read()).draft).toEqual(before);
    await check.click();
    await expect(dialog.getByRole('alert')).toContainText('inte lades i utkastet');
    await expect(dialog.getByLabel('Till objekt', { exact: true })).toHaveValue('bicycle');
    await page.unroute(`${path}/relationship-form`);
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Sambandet lades i ditt utkast');
    await post('save', { operationId: 'safe-retry-save' });
    await dialog.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name: 'Samband för Alex', exact: true }).click();
    await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Använder' });
    await dialog.getByLabel('Till objekt', { exact: true }).selectOption('bicycle');
    await page.route(`${path}/relationship-form`, async (route) => {
      await route.fetch();
      await route.abort();
    });
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    await expect(check).toBeVisible();
    const saved = (await read()).relationships[0];
    const other = await page.context().newPage();
    await other.goto(`${installation.origin}/households/${household.id}`);
    await other.getByRole('button', { name: 'Tabell', exact: true }).click();
    await other.getByRole('button', { name: 'Samband för Alex', exact: true }).click();
    const otherDialog = other.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await otherDialog.getByRole('button', { name: 'Redigera samband', exact: true }).click();
    await otherDialog.getByRole('button', { name: 'Föreslå borttagning', exact: true }).click();
    await expect(otherDialog.getByRole('status')).toContainText('Föreslagen borttagning');
    // Retain the original successful direct proposal assertion as protocol evidence.
    await post('relationship', { id: saved.id, baseRevision: saved.revision, value: null });
    const removed = (await read()).draft;
    expect(removed.relationships?.[0]).toMatchObject({ id: saved.id, after: null });
    await check.click();
    await expect(dialog.getByRole('alert')).toContainText('ändrats eller tagits bort');
    await expect(
      dialog.getByRole('button', { name: 'Redigera befintligt samband', exact: true }),
    ).toHaveCount(0);
    await expect(dialog.getByLabel('Till objekt', { exact: true })).toHaveValue('bicycle');
    expect((await read()).draft).toEqual(removed);
    await other.close();
  } finally {
    await installation.close();
  }
});

test('SAMBAND-11: the household object selector ignores table filters and excludes removed proposals while retaining effective type names', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, post, household } = await createRelationshipFixture(
      page.request,
      installation.origin,
    );
    const state = await read();
    await post('draft', {
      id: 'retired',
      baseRevision: null,
      value: {
        name: 'Upphörd sak',
        description: 'Äldre föremål',
        typeId: state.types[0].id,
        lifecycle: 'ended',
      },
    });
    await post('draft', {
      id: 'removed',
      baseRevision: null,
      value: { name: 'Tas bort', description: '', typeId: state.types[0].id },
    });
    await post('save', { operationId: 'selector-baseline' });
    const saved = await read();
    await post('object-type', {
      id: 'new-type',
      baseRevision: null,
      value: { name: 'Egen föremålstyp', description: '', fields: [] },
    });
    await post('draft', {
      id: 'new-object',
      baseRevision: null,
      value: { name: 'Ny sak', description: 'Särskild förklaring', typeId: 'new-type' },
    });
    await post('draft', {
      id: 'removed',
      baseRevision: saved.objects.find((object) => object.id === 'removed')?.revision,
      value: null,
    });
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Sök objekt i tabellen', exact: true }).fill('Alex');
    await page.getByRole('button', { name: 'Samband för Alex', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    const target = dialog.getByLabel('Till objekt', { exact: true });
    await expect(
      target.getByRole('option', {
        name: 'Ny sak · Egen föremålstyp · Särskild förklaring',
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(target.getByRole('option', { name: /^Upphörd sak/ })).toHaveCount(1);
    await expect(target.getByRole('option', { name: /^Tas bort/ })).toHaveCount(0);
    await dialog.getByLabel('Sök det andra objektet', { exact: true }).fill('Särskild förklaring');
    await target.selectOption('new-object');
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Använder' });
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    expect((await read()).draft.relationships?.[0].after?.targetId).toBe('new-object');
    await dialog.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await expect(
      page.getByRole('searchbox', { name: 'Sök objekt i tabellen', exact: true }),
    ).toHaveValue('Alex');
  } finally {
    await installation.close();
  }
});

for (const [caseId, width, height] of [
  ['SAMBAND-09', 1280, 900],
  ['SAMBAND-16', 320, 640],
  ['SAMBAND-17', 320, 240],
] as const) {
  test(`${caseId}: keyboard form actions and confirmed route loss remain reachable at ${width}x${height}`, async ({
    page,
  }, info) => {
    const installation = await createInstallation();
    try {
      const { read, household } = await createRelationshipFixture(
        page.request,
        installation.origin,
      );
      const before = (await read()).draft;
      await page.setViewportSize({ width, height });
      const settings = `${installation.origin}/households/${household.id}/settings`;
      await page.goto(settings);
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      await page.getByRole('button', { name: 'Tabell', exact: true }).click();
      await page.getByRole('button', { name: 'Samband för Alex', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
      const heading = dialog.getByRole('heading', { name: 'Samband för Alex', exact: true });
      await expect(heading).toBeFocused();
      await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
      await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Använder' });
      await dialog.getByLabel('Till objekt', { exact: true }).selectOption('bicycle');
      await heading.focus();
      await heading.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('relationship-dialog-top.png') });
      const stage = dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true });
      await stage.focus();
      await stage.scrollIntoViewIfNeeded();
      const bounds = await stage.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds?.y).toBeGreaterThanOrEqual(0);
      expect((bounds?.y ?? height) + (bounds?.height ?? 0)).toBeLessThanOrEqual(height);
      const frame = await dialog.boundingBox();
      expect(frame?.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: info.outputPath('relationship-dialog.png') });
      const close = dialog.getByRole('button', { name: 'Stäng samband', exact: true });
      await close.focus();
      await page.keyboard.press('Tab');
      await expect(
        dialog.getByRole('button', { name: 'Stäng dialogen', exact: true }),
      ).toBeFocused();
      await page.goBack();
      const loss = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
      await expect(
        loss.getByRole('button', { name: 'Fortsätt redigera', exact: true }),
      ).toBeFocused();
      await loss.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
      await expect(dialog.getByLabel('Till objekt', { exact: true })).toHaveValue('bicycle');
      await page.goBack();
      await loss
        .getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true })
        .click();
      await expect(page).toHaveURL(settings);
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Samband för Alex', exact: true })).toHaveCount(
        0,
      );
      expect((await read()).draft).toEqual(before);
    } finally {
      await installation.close();
    }
  });
}

test('SAMBAND-07: pending requests block duplicate sends and a rejected whole relationship retains editable values', async ({
  page,
}) => {
  const installation = await createInstallation();
  let release = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const { path, read, household } = await createRelationshipFixture(
      page.request,
      installation.origin,
    );
    const before = (await read()).draft;
    let sends = 0;
    await page.route(`${path}/relationship-form`, async (route) => {
      sends++;
      await waiting;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_request' }),
      });
    });
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name: 'Samband för Alex', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Använder' });
    await dialog.getByLabel('Till objekt', { exact: true }).selectOption('bicycle');
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).dblclick();
    await expect(dialog.getByLabel('Sambandstyp', { exact: true })).toBeDisabled();
    await expect(
      dialog.getByRole('button', { name: 'Stäng dialogen', exact: true }),
    ).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Stäng samband', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    expect(sends).toBe(1);
    release();
    await expect(dialog.getByRole('alert')).toContainText('Dina uppgifter finns kvar');
    await expect(dialog.getByLabel('Till objekt', { exact: true })).toHaveValue('bicycle');
    await expect(dialog.getByLabel('Sambandstyp', { exact: true })).toBeEnabled();
    expect((await read()).draft).toEqual(before);
    await page.unroute(`${path}/relationship-form`);
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Sambandet lades i ditt utkast');
    expect((await read()).draft.relationships).toHaveLength(1);
  } finally {
    release();
    await installation.close();
  }
});

test('SAMBAND-08: recovery returns the current draft without replaying an earlier successful relationship over later changes', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { path, read, post, household } = await createRelationshipFixture(
      page.request,
      installation.origin,
    );
    let submitted: Record<string, unknown> | undefined;
    await page.route(`${path}/relationship-form`, async (route) => {
      submitted = route.request().postDataJSON();
      await route.fetch();
      await route.abort();
    });
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name: 'Samband för Alex', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Använder' });
    await dialog.getByLabel('Till objekt', { exact: true }).selectOption('bicycle');
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    const check = dialog.getByRole('button', {
      name: 'Kontrollera om ändringen lades i utkastet',
      exact: true,
    });
    await expect(check).toBeVisible();
    const staged = (await read()).draft.relationships?.[0];
    const other = await page.context().newPage();
    await other.goto(`${installation.origin}/households/${household.id}`);
    await other.getByRole('button', { name: 'Tabell', exact: true }).click();
    await other.getByRole('button', { name: 'Samband för Alex', exact: true }).click();
    const otherDialog = other.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await otherDialog.getByRole('button', { name: 'Redigera samband', exact: true }).click();
    await otherDialog.getByLabel('Uppgiftens säkerhet', { exact: true }).selectOption('uncertain');
    await otherDialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    await expect(otherDialog.getByRole('status')).toContainText('Sambandet lades i ditt utkast');
    // Keep direct proposal success alongside the native same-owner correction.
    await post('relationship', {
      id: staged?.id,
      baseRevision: null,
      value: { ...staged?.after, knowledge: 'uncertain' },
    });
    const latest = await read();
    expect(latest.draft.relationships?.[0].after?.knowledge).toBe('uncertain');
    const replay = await page.request.post(`${path}/relationship-form`, {
      headers: { origin: installation.origin },
      data: submitted,
    });
    expect(replay.status(), await replay.text()).toBe(200);
    const result = await replay.json();
    expect(result.outcome.value.knowledge).toBe('known');
    expect(result.state.draft).toEqual(latest.draft);
    await check.click();
    await expect(dialog.getByRole('alert')).toContainText('det aktuella underlaget har ändrats');
    await expect(dialog.getByRole('status')).toHaveCount(0);
    await expect(dialog.getByLabel('Uppgiftens säkerhet', { exact: true })).toHaveValue('known');
    expect((await read()).draft).toEqual(latest.draft);
    const reused = await page.request.post(`${path}/relationship-form`, {
      headers: { origin: installation.origin },
      data: { ...submitted, value: { ...staged?.after, knowledge: 'none', targetId: null } },
    });
    expect(reused.status()).toBe(409);
    expect(await reused.json()).toEqual({ error: 'operation_reused' });
    expect((await read()).draft).toEqual(latest.draft);
    await other.close();
  } finally {
    await installation.close();
  }
});

test('SAMBAND-06: read-chain navigation retains an uncertain staging outcome and restores the originating table control', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { path, read, post, household } = await createRelationshipFixture(
      page.request,
      installation.origin,
    );
    const typeId = (await read()).relationshipTypes.find((type) => type.name === 'Använder')?.id;
    await post('relationship', {
      id: 'existing',
      baseRevision: null,
      value: { typeId, sourceId: 'alex', targetId: 'bicycle', knowledge: 'known' },
    });
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    const opener = page.getByRole('button', { name: 'Samband för Alex', exact: true });
    await opener.click();
    let dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await dialog.getByRole('button', { name: 'Redigera samband', exact: true }).click();
    await dialog.getByLabel('Uppgiftens säkerhet', { exact: true }).selectOption('uncertain');
    await page.route(`${path}/relationship-form`, async (route) => {
      await route.fetch();
      await route.abort();
    });
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    await expect(
      dialog.getByRole('button', {
        name: 'Kontrollera om ändringen lades i utkastet',
        exact: true,
      }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Blå cykeln', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Uppgifter för Blå cykeln', exact: true });
    await expect(
      dialog.getByRole('heading', { name: 'Uppgifter för Blå cykeln', exact: true }),
    ).toBeFocused();
    await dialog.getByRole('button', { name: 'Samband för Blå cykeln', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Samband för Blå cykeln', exact: true });
    await dialog.getByRole('button', { name: 'Tillbaka', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Uppgifter för Blå cykeln', exact: true })
      .getByRole('button', { name: 'Tillbaka', exact: true })
      .click();
    dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await expect(dialog.getByLabel('Uppgiftens säkerhet', { exact: true })).toHaveValue(
      'uncertain',
    );
    await dialog
      .getByRole('button', { name: 'Kontrollera om ändringen lades i utkastet', exact: true })
      .click();
    await expect(dialog.getByRole('status')).toContainText('Sambandet lades i ditt utkast');
    expect((await read()).draft.relationships?.[0].after?.knowledge).toBe('uncertain');
    await dialog.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await expect(opener).toBeFocused();
  } finally {
    await installation.close();
  }
});

test('SAMBAND-05: full relationship values survive canceled type loss and absent targets keep their distinct meanings', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, post, household } = await createRelationshipFixture(
      page.request,
      installation.origin,
    );
    await post('relationship-type', {
      id: 'custom',
      baseRevision: null,
      value: {
        name: 'Särskild användning',
        description: 'Syntetiska sambandsuppgifter',
        forwardLabel: 'använder särskilt',
        reverseLabel: 'används särskilt av',
        sections: [{ id: 'details', name: 'Egna uppgifter' }],
        fields: [
          { id: 'note', name: 'Anteckning', description: '', kind: 'text', sectionId: 'details' },
          { id: 'amount', name: 'Antal', description: '', kind: 'number', sectionId: 'details' },
          { id: 'day', name: 'Kontrolldatum', description: '', kind: 'date', sectionId: 'details' },
          {
            id: 'answer',
            name: 'Kontrollerat',
            description: '',
            kind: 'boolean',
            sectionId: 'details',
          },
          { id: 'hidden', name: 'Dold uppgift', description: '', kind: 'text', sectionId: '' },
        ],
      },
    });
    await post('relationship', {
      id: 'full',
      baseRevision: null,
      value: {
        typeId: 'custom',
        sourceId: 'alex',
        targetId: 'bicycle',
        knowledge: 'uncertain',
        lifecycle: 'active',
        endDate: { knowledge: 'known', value: '2040-06-07' },
        customValues: {
          note: 'Bevara texten',
          amount: 3,
          day: '2040-05-06',
          answer: false,
          hidden: 'Behåll dolt',
        },
      },
    });
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name: 'Samband för Alex', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await dialog.getByRole('button', { name: 'Redigera samband', exact: true }).click();
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Äger' });
    const typeLoss = page.getByRole('dialog', { name: 'Ta bort tidigare egna fält?', exact: true });
    await expect(typeLoss).toContainText('Dold uppgift: Behåll dolt');
    await expect(typeLoss).toContainText('Kontrollerat: Nej');
    await expect(
      typeLoss.getByRole('button', { name: 'Fortsätt redigera', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog.getByLabel('Sambandstyp', { exact: true })).toHaveValue('custom');
    await dialog.getByRole('button', { name: 'Byt riktning', exact: true }).click();
    await expect(dialog.getByLabel('Från objekt', { exact: true })).toHaveValue('bicycle');
    await expect(dialog.getByLabel('Till objekt', { exact: true })).toHaveValue('alex');
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    expect((await read()).draft.relationships?.[0].after).toMatchObject({
      sourceId: 'bicycle',
      targetId: 'alex',
      knowledge: 'uncertain',
      lifecycle: 'active',
      endDate: { knowledge: 'known', value: '2040-06-07' },
      customValues: {
        note: 'Bevara texten',
        amount: 3,
        day: '2040-05-06',
        answer: false,
        hidden: 'Behåll dolt',
      },
    });
    await dialog.getByRole('button', { name: 'Redigera samband', exact: true }).click();
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Äger' });
    await typeLoss
      .getByRole('button', { name: 'Ta bort fältvärdena och byt typ', exact: true })
      .click();
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    expect((await read()).draft.relationships?.[0].after?.customValues ?? {}).toEqual({});
    await dialog.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await page.getByRole('button', { name: 'Samband för Blå cykeln', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Samband för Blå cykeln', exact: true });
    for (const knowledge of ['unknown', 'none', 'unresolved'] as const) {
      await dialog.getByRole('button', { name: 'Redigera samband', exact: true }).click();
      await dialog.getByLabel('Uppgiftens säkerhet', { exact: true }).selectOption(knowledge);
      await expect(dialog.getByLabel('Till objekt', { exact: true })).toHaveCount(0);
      await expect(
        dialog.getByRole('button', { name: 'Byt riktning', exact: true }),
      ).toBeDisabled();
      await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
      expect((await read()).draft.relationships?.[0].after).toMatchObject({
        knowledge,
        targetId: null,
      });
    }
    expect((await read()).relationships).toEqual([]);
  } finally {
    await installation.close();
  }
});

test('SAMBAND-03: a lost duplicate result retains the attempted form and offers guarded editing without overwrite', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { path, read, post, household } = await createRelationshipFixture(
      page.request,
      installation.origin,
    );
    const typeId = (await read()).relationshipTypes.find((type) => type.name === 'Använder')?.id;
    await post('relationship', {
      id: 'existing',
      baseRevision: null,
      value: { typeId, sourceId: 'alex', targetId: 'bicycle', knowledge: 'known' },
    });
    await post('save', { operationId: 'relationships-before-duplicate' });
    const before = await read();
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name: 'Samband för Alex', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Använder' });
    await dialog.getByLabel('Till objekt', { exact: true }).selectOption('bicycle');
    await dialog.getByLabel('Uppgiftens säkerhet', { exact: true }).selectOption('uncertain');
    await page.route(`${path}/relationship-form`, async (route) => {
      await route.fetch();
      await route.abort();
    });
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    const check = dialog.getByRole('button', {
      name: 'Kontrollera om ändringen lades i utkastet',
      exact: true,
    });
    await expect(check).toBeVisible();
    await expect(dialog.getByLabel('Uppgiftens säkerhet', { exact: true })).toBeDisabled();
    await check.click();
    await expect(dialog.getByRole('alert')).toContainText('Sambandet finns redan');
    await expect(dialog.getByLabel('Uppgiftens säkerhet', { exact: true })).toHaveValue(
      'uncertain',
    );
    expect((await read()).relationships).toEqual(before.relationships);
    expect((await read()).draft).toEqual(before.draft);
    await dialog.getByRole('button', { name: 'Redigera befintligt samband', exact: true }).click();
    const loss = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
    await loss.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
    await expect(dialog.getByLabel('Uppgiftens säkerhet', { exact: true })).toHaveValue(
      'uncertain',
    );
    await dialog.getByRole('button', { name: 'Redigera befintligt samband', exact: true }).click();
    await loss.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    await expect(dialog.getByLabel('Uppgiftens säkerhet', { exact: true })).toHaveValue('known');
    await expect(dialog.getByLabel('Till objekt', { exact: true })).toHaveValue('bicycle');
    expect((await read()).draft).toEqual(before.draft);
  } finally {
    await installation.close();
  }
});

test('SAMBAND-04: proposed relationship removal discards only confirmed unsent changes and keeps saved lifecycle facts', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, post, household } = await createRelationshipFixture(
      page.request,
      installation.origin,
    );
    const typeId = (await read()).relationshipTypes.find((type) => type.name === 'Använder')?.id;
    await post('relationship', {
      id: 'existing',
      baseRevision: null,
      value: { typeId, sourceId: 'alex', targetId: 'bicycle', knowledge: 'known' },
    });
    await post('save', { operationId: 'relationships-before-removal' });
    const before = await read();
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name: 'Samband för Alex', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await dialog.getByRole('button', { name: 'Redigera samband', exact: true }).click();
    await dialog.getByLabel('Sambandets status', { exact: true }).selectOption('ended');
    await dialog.getByRole('button', { name: 'Föreslå borttagning', exact: true }).click();
    const loss = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
    await expect(
      loss.getByRole('button', { name: 'Fortsätt redigera', exact: true }),
    ).toBeFocused();
    await loss.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
    await expect(dialog.getByLabel('Sambandets status', { exact: true })).toHaveValue('ended');
    expect((await read()).draft).toEqual(before.draft);
    await dialog.getByRole('button', { name: 'Föreslå borttagning', exact: true }).click();
    await loss.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Föreslagen borttagning');
    const after = await read();
    expect(after.relationships).toEqual(before.relationships);
    expect(after.draft.relationships).toHaveLength(1);
    expect(after.draft.relationships?.[0]).toMatchObject({
      before: before.relationships[0],
      after: null,
    });
    expect(after.draft.relationships?.[0].before).not.toHaveProperty('lifecycle');
  } finally {
    await installation.close();
  }
});

test('SAMBAND-02: invalid next input and canceled form loss retain previous complete relationship proposals', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, household } = await createRelationshipFixture(page.request, installation.origin);
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    const opener = page.getByRole('button', { name: 'Samband för Alex', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Använder' });
    await dialog.getByLabel('Till objekt', { exact: true }).selectOption('bicycle');
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Sambandet lades i ditt utkast');
    const earlier = (await read()).draft;
    await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    const errors = dialog.getByRole('alert', { name: 'Formuläret innehåller fel' });
    await expect(errors).toBeFocused();
    await errors.getByRole('link', { name: /^Sambandstyp:/ }).click();
    await expect(dialog.getByLabel('Sambandstyp', { exact: true })).toBeFocused();
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Äger' });
    const search = dialog.getByLabel('Sök det andra objektet', { exact: true });
    await search.fill('Oskickad sökning');
    await page.keyboard.press('Escape');
    const loss = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
    await expect(
      loss.getByRole('button', { name: 'Fortsätt redigera', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('Oskickad sökning');
    expect((await read()).draft).toEqual(earlier);
    await dialog.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await loss.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    expect((await read()).draft).toEqual(earlier);
  } finally {
    await installation.close();
  }
});

test('SAMBAND-01: separate complete objects connect and remain independently editable in the shared dialog', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    await page.goto(`${installation.origin}/households/${household.id}`);
    const tools = page.getByRole('navigation', { name: 'Kartans verktyg', exact: true });
    for (const [name, type, description] of [
      ['Alex', 'Person', 'Personen som använder cykeln'],
      ['Blå cykeln', 'Fordon', 'Cykeln i garaget'],
    ]) {
      await tools.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
      const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
      await form.getByLabel('Namn', { exact: true }).fill(name);
      await form.getByLabel('Objekttyp', { exact: true }).selectOption({ label: type });
      await form.getByLabel('Beskrivning', { exact: true }).fill(description);
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await expect(form).not.toBeVisible();
    }
    await tools.getByRole('button', { name: 'Tabell', exact: true }).click();
    const opener = page.getByRole('button', { name: 'Samband för Alex', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await expect(
      dialog.getByRole('heading', { name: 'Samband för Alex', exact: true }),
    ).toBeFocused();
    await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await expect(dialog.getByLabel('Från objekt', { exact: true })).toHaveValue(
      (await read()).draft.changes.find((change) => change.after?.name === 'Alex')?.id ?? '',
    );
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Använder' });
    await dialog.getByLabel('Sök det andra objektet', { exact: true }).fill('garaget');
    await dialog
      .getByLabel('Till objekt', { exact: true })
      .selectOption({ label: 'Blå cykeln · Fordon · Cykeln i garaget' });
    await expect(dialog.getByRole('region', { name: 'Sambandet före inskickning' })).toContainText(
      'Alex använder Blå cykeln',
    );
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('status')).toContainText('Sambandet lades i ditt utkast');
    const staged = await read();
    expect(staged.objects).toEqual([]);
    expect(staged.relationships).toEqual([]);
    expect(staged.draft.changes).toHaveLength(2);
    expect(staged.draft.relationships).toHaveLength(1);
    await dialog.getByRole('button', { name: 'Redigera samband', exact: true }).click();
    await dialog.getByLabel('Uppgiftens säkerhet', { exact: true }).selectOption('uncertain');
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Sambandet lades i ditt utkast');
    expect((await read()).draft.relationships?.[0].after?.knowledge).toBe('uncertain');
    await dialog.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await expect(opener).toBeFocused();
    await page.getByRole('button', { name: 'Redigera Blå cykeln', exact: true }).click();
    const object = page.getByRole('dialog', { name: 'Redigera Blå cykeln', exact: true });
    await object.getByLabel('Beskrivning', { exact: true }).fill('Rättad beskrivning');
    await object.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const final = await read();
    expect(
      final.draft.changes.find((change) => change.after?.name === 'Blå cykeln')?.after?.description,
    ).toBe('Rättad beskrivning');
    expect(final.draft.relationships).toHaveLength(1);
    expect(final.draft.relationships?.[0].after?.knowledge).toBe('uncertain');
    await installation.restart();
    expect((await read()).draft).toEqual(final.draft);
    await page.reload();
    const review = await openDraftReview(page);
    await expect(review).toContainText('Alex');
    await expect(review).toContainText('Blå cykeln');
  } finally {
    await installation.close();
  }
});
