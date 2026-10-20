import { contrast } from '../support/accessibility.js';
import { prepareConflictContinuity } from '../support/conflict-continuity.js';
import {
  prepareOwnRemovalConflict,
  prepareRelationshipSpecialConflict,
  prepareRemovedObjectConflict,
  saveReviewedConflictDraft,
} from '../support/conflict-special.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test('UTKAST-57: accepting a removed object discards only its proposal and preserves the saved removal', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await prepareRemovedObjectConflict(page.request, other.request);
  try {
    const before = await app.read();
    const history = await (await page.request.get(`${app.path}/history`)).json();
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await expect(
      dialog.getByText('Objektet togs bort från den gemensamma kartan medan du redigerade det.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByText('Objektet är borttaget. Ditt ändringsförslag kan inte återställa det.', {
        exact: true,
      }),
    ).toBeVisible();
    const saved = dialog.getByRole('region', { name: 'Sparat i kartan nu', exact: true });
    const proposed = dialog.getByRole('region', { name: 'Ditt förslag', exact: true });
    await expect(saved).toContainText('Borttaget');
    const preview = dialog.getByRole('region', { name: 'Resultat av valen', exact: true });
    await expect(preview.locator('dt')).toHaveText('Objekt');
    await expect(preview.locator('dd')).toHaveText('Borttaget');
    await expect(preview).not.toContainText('✓ Förvalt');
    await expect(saved).toContainText('✓ Förvalt');
    await expect(proposed).toContainText('Mitt förslag');
    expect(await contrast(proposed.getByText('Lo Lind', { exact: true }))).toBeGreaterThanOrEqual(
      4.5,
    );
    await expect(
      dialog.getByText('Du behöver inte välja några egenskaper.', { exact: true }),
    ).toBeVisible();
    await expect(dialog.locator('.cp-warning [aria-hidden="true"]')).toHaveText('⚠');
    await expect(saved.locator('.cp-default')).toHaveClass(/cp-overlap/);
    await expect(proposed.getByText('Lo Lind', { exact: true }).locator('..')).toHaveClass(
      /cp-overlap/,
    );
    const addedProperty = proposed.getByText('Mitt förslag (Text)', { exact: true }).locator('..');
    await expect(addedProperty).toHaveClass(/cp-change/);
    await expect(addedProperty).not.toHaveClass(/cp-overlap/);
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `/tmp/skyttel-244/256-removed-object-${width}.png`,
        fullPage: true,
      });
    }
    await page.keyboard.press('Escape');
    expect((await app.read()).draft).toEqual(before.draft);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    await dialog
      .getByRole('button', { name: 'Acceptera borttagningen och kasta ditt förslag', exact: true })
      .click();
    await expect(dialog.getByRole('status')).toContainText(
      'Förslaget har tagits bort ur ditt utkast',
    );
    await expect(dialog.getByRole('navigation', { name: 'Alla konflikter' })).toContainText(
      'Lo Lind',
    );
    await expect(dialog.getByRole('navigation', { name: 'Alla konflikter' })).toContainText(
      'Vald lösning',
    );
    const after = await app.read();
    expect(after.draft.changes).toEqual(
      before.draft.changes.filter((change) => change.id !== 'lo'),
    );
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
    expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

for (const [id, kind, title, reason, warning, action] of [
  [
    '58',
    'removed',
    'accepting a removed relationship discards only its proposal without restoring the saved edge',
    'Sambandet togs bort från den gemensamma kartan medan du redigerade det.',
    'Ett ändringsförslag kan inte återställa ett borttaget samband.',
    'Acceptera borttagningen och kasta ditt förslag',
  ],
  [
    '59',
    'duplicate',
    'a duplicate relationship has a readonly comparison and discards only the proposed duplicate',
    'Ett sparat samband har redan samma typ, riktning och objekt.',
    'Sambandet finns redan. Ta bort det föreslagna sambandet ur ditt utkast.',
    'Ta bort sambandet ur ditt utkast',
  ],
  [
    '60',
    'missing-endpoint',
    'a missing endpoint has a readonly comparison and removes only the unusable relationship proposal',
    'Ett objekt som sambandet pekar på saknas.',
    'Sambandet kan inte läggas till eftersom ett objekt som det pekar på saknas.',
    'Ta bort sambandet ur ditt utkast',
  ],
] as const) {
  test(`UTKAST-${id}: ${title}`, async ({ page, browser }) => {
    const other = await createPreparedContext(browser);
    const app = await prepareRelationshipSpecialConflict(page.request, other.request, kind);
    try {
      const before = await app.read();
      const history = await (await page.request.get(`${app.path}/history`)).json();
      await page.goto(app.installation.origin);
      await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
      const proposal = before.draft.relationships?.find((change) => change.id === 'mine');
      if (!proposal) throw new Error('Missing relationship fixture proposal');
      const retainedName = `Lo Exempel → ${proposal.type.forwardLabel ?? proposal.type.name} → Molnmusik`;
      await expect(dialog.getByRole('heading', { name: retainedName, exact: true })).toBeVisible();
      await expect(
        dialog
          .getByRole('navigation', { name: 'Alla konflikter', exact: true })
          .getByRole('button'),
      ).toContainText(retainedName);
      await expect(dialog.getByText(reason, { exact: true })).toBeVisible();
      await expect(dialog.getByText(warning, { exact: true })).toBeVisible();
      await expect(dialog.getByRole('region', { name: 'Ditt förslag', exact: true })).toContainText(
        'Uppgiftens säkerhet',
      );
      await expect(dialog.getByRole('region', { name: 'Ditt förslag', exact: true })).toContainText(
        'Osäkert uppgivet (Text)',
      );
      if (kind === 'missing-endpoint') {
        await expect(
          dialog.getByRole('button', { name: 'Rätta ändpunkter', exact: true }),
        ).toBeVisible();
        const missing = dialog.getByRole('region', { name: 'Sparat i kartan nu', exact: true });
        await expect(missing).toContainText('Till objekt');
        await expect(missing).toContainText('Borttaget');
        await expect(missing.locator('.cp-field-choice')).toHaveClass(/cp-change/);
        await expect(missing.locator('.cp-field-choice')).not.toHaveClass(/cp-overlap/);
        await expect(
          dialog
            .getByRole('region', { name: 'Ditt förslag', exact: true })
            .getByText('Molnmusik', { exact: true })
            .locator('..'),
        ).not.toHaveClass(/cp-change|cp-overlap/);
      }
      const preview = dialog.getByRole('region', { name: 'Resultat av valen', exact: true });
      await expect(preview.locator('dt')).toHaveText(
        kind === 'removed' ? 'Samband' : 'Sambandet i ditt utkast',
      );
      await expect(preview.locator('dd')).toHaveText(
        kind === 'removed' ? 'Borttaget' : 'Tas bort ur ditt utkast',
      );
      if (kind === 'removed') await expect(preview).not.toContainText('✓ Förvalt');
      else {
        await expect(preview).toContainText('✓ Förvalt');
        await expect(preview).toContainText(
          kind === 'duplicate'
            ? 'Det redan sparade sambandet och dess uppgifter behålls.'
            : 'Övrigt utkastarbete finns kvar. Du kan också rätta ändpunkterna och behålla förslaget.',
        );
      }
      await page.keyboard.press('Escape');
      expect((await app.read()).draft).toEqual(before.draft);
      await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
      await dialog.getByRole('button', { name: action, exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText(
        'Förslaget har tagits bort ur ditt utkast',
      );
      const result = dialog.locator('.cp-preview');
      await expect(result.locator('dt')).toHaveText(
        kind === 'removed' ? 'Samband' : 'Sambandet i ditt utkast',
      );
      await expect(result.locator('dd')).toHaveText(
        kind === 'removed' ? 'Borttaget' : 'Borttaget ur ditt utkast',
      );
      const after = await app.read();
      expect(after.draft.relationships ?? []).toEqual([]);
      expect(after.draft.changes).toEqual(before.draft.changes);
      expect(after.objects).toEqual(before.objects);
      expect(after.relationships).toEqual(before.relationships);
      expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
    } finally {
      await other.close();
      await app.installation.close();
    }
  });
}

test('UTKAST-61: an own removal is explicitly rebased against changed saved facts before a separate save', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await prepareOwnRemovalConflict(page.request, other.request);
  try {
    const before = await app.read();
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await expect(dialog).toContainText(
      'Du föreslår borttagning. Robin sparade ändringar i objektet innan du hann spara ditt förslag.',
    );
    await expect(dialog.getByRole('region', { name: 'Sparat i kartan nu' })).toContainText(
      'Nya sparade fakta',
    );
    await expect(dialog.getByRole('region', { name: 'Sparat i kartan nu' })).toContainText(
      'Robin sparade ett nytt värde efter att du började ändra den här uppgiften.',
    );
    const apply = dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true });
    await expect(apply).toBeDisabled();
    await dialog
      .getByRole('button', { name: 'Objekt: Ditt förslag – Föreslagen borttagning', exact: true })
      .click();
    await expect(dialog.getByRole('region', { name: 'Resultat av valen' })).toContainText(
      'Föreslagen borttagning',
    );
    await apply.click();
    await expect(dialog.getByRole('status')).toContainText('Valen finns i ditt utkast');
    const after = await app.read();
    expect(after.objects).toEqual(before.objects);
    expect(after.draft.changes.find((change) => change.id === 'lo')).toMatchObject({
      before: before.objects.find((object) => object.id === 'lo'),
      after: null,
    });
    expect(after.draft.changes.find((change) => change.id === 'independent')).toEqual(
      before.draft.changes.find((change) => change.id === 'independent'),
    );
    await saveReviewedConflictDraft(page);
    expect((await app.read()).objects.some((object) => object.id === 'lo')).toBe(false);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-62: object and new connection removal choices remain independent and reject an invalid combination', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await prepareOwnRemovalConflict(page.request, other.request, 'connections');
  try {
    const before = await app.read();
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await expect(dialog).toContainText(
      'Du föreslår borttagning. Ytterligare ett sparat samband berör nu objektet.',
    );
    const apply = dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true });
    await dialog
      .getByRole('button', { name: 'Objekt: Ditt förslag – Föreslagen borttagning', exact: true })
      .click();
    const savedEdge = dialog
      .getByRole('region', { name: 'Sparat i kartan nu' })
      .getByRole('button', { name: /^Samband:/ });
    await savedEdge.click();
    await expect(dialog.getByRole('alert')).toContainText(
      'Objektet kan inte tas bort medan sambandet till det finns kvar. Välj att ta bort sambandet eller behåll objektet.',
    );
    await expect(apply).toBeDisabled();
    expect((await app.read()).draft).toEqual(before.draft);
    await dialog
      .getByRole('region', { name: 'Sparat i kartan nu' })
      .getByRole('button', { name: /^Objekt:/ })
      .click();
    await dialog
      .getByRole('button', {
        name: 'Samband: Ditt förslag – Föreslagen borttagning av sambandet',
        exact: true,
      })
      .click();
    await expect(apply).toBeEnabled();
    await apply.click();
    await expect(dialog.getByRole('status')).toContainText('Valen finns i ditt utkast');
    const after = await app.read();
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
    expect(after.draft.changes).toEqual(
      before.draft.changes.filter((change) => change.id !== 'lo'),
    );
    expect(after.draft.relationships).toEqual([
      expect.objectContaining({ id: 'new-edge', before: before.relationships[0], after: null }),
    ]);
    await saveReviewedConflictDraft(page);
    expect((await app.read()).objects.find((object) => object.id === 'lo')).toEqual(
      before.objects.find((object) => object.id === 'lo'),
    );
    expect((await app.read()).relationships).toEqual([]);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-73: removing one new connection leaves changed saved facts subject to explicit conflict review', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await prepareOwnRemovalConflict(page.request, other.request, 'facts-and-connections');
  try {
    const before = await app.read();
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    const saved = dialog.getByRole('region', { name: 'Sparat i kartan nu', exact: true });
    await expect(saved.getByRole('button', { name: /^Objekt:/ })).toContainText(
      'Nya sparade fakta',
    );
    await expect(saved.getByRole('button', { name: /^Objekt:/ })).toContainText('Robin');
    await expect(saved.getByRole('button', { name: /^Samband:/ })).toBeVisible();
    await dialog
      .getByRole('button', { name: 'Objekt: Ditt förslag – Föreslagen borttagning', exact: true })
      .click();
    await saved.getByRole('button', { name: /^Samband:/ }).click();
    await expect(dialog.getByRole('alert')).toContainText(
      'Objektet kan inte tas bort medan sambandet till det finns kvar',
    );
    await expect(
      dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }),
    ).toBeDisabled();
    expect((await app.read()).draft).toEqual(before.draft);
    await app.propose(other.request, 'relationship', 'new-edge', null);
    expect((await app.save(other.request, 'remove-only-connection')).status()).toBe(200);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    await dialog.getByRole('button', { name: 'Visa aktuell jämförelse', exact: true }).click();
    await expect(dialog).toContainText(
      'Du föreslår borttagning. Robin sparade ändringar i objektet innan du hann spara ditt förslag.',
    );
    await expect(saved.getByRole('button', { name: /^Samband:/ })).toHaveCount(0);
    const proposed = dialog.getByRole('button', {
      name: 'Objekt: Ditt förslag – Föreslagen borttagning',
      exact: true,
    });
    await expect(proposed).toHaveAttribute('aria-pressed', 'true');
    await expect(saved.getByRole('button', { name: /^Objekt:/ })).toContainText(
      'Nya sparade fakta',
    );
    const current = await app.read();
    expect(current.draft).toEqual(before.draft);
    const history = await (await page.request.get(`${app.path}/history`)).json();
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Valen finns i ditt utkast');
    const reviewed = await app.read();
    expect(reviewed.draft.changes.find((change) => change.id === 'lo')).toMatchObject({
      before: current.objects.find((object) => object.id === 'lo'),
      after: null,
    });
    expect(reviewed.draft.changes.find((change) => change.id === 'independent')).toEqual(
      before.draft.changes.find((change) => change.id === 'independent'),
    );
    expect(reviewed.objects).toEqual(current.objects);
    expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
    await saveReviewedConflictDraft(page);
    expect((await app.read()).objects.some((object) => object.id === 'lo')).toBe(false);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

for (const surface of ['Karta', 'Tabell'] as const)
  for (const delivered of [true, false])
    test(`UTKAST-${surface === 'Karta' ? (delivered ? '77' : '132') : delivered ? '133' : '134'}: an ${delivered ? 'applied' : 'unsent'} duplicate-discard reply is explicitly checked without replay in ${surface}`, async ({
      page,
      browser,
    }) => {
      const other = await createPreparedContext(browser);
      const app = await prepareRelationshipSpecialConflict(
        page.request,
        other.request,
        'duplicate',
      );
      try {
        await page.setViewportSize({ width: 320, height: 900 });
        const before = await app.read();
        const history = await (await page.request.get(`${app.path}/history`)).json();
        let submitted = 0;
        await page.route('**/map/resolve', async (route) => {
          submitted++;
          if (delivered) await route.fetch();
          await route.abort();
        });
        await page.goto(app.installation.origin);
        if (surface === 'Tabell')
          await page.getByRole('button', { name: 'Tabell', exact: true }).click();
        const opener = page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true });
        await opener.click();
        const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
        const discard = dialog.getByRole('button', {
          name: 'Ta bort sambandet ur ditt utkast',
          exact: true,
        });
        await discard.click();
        await expect(dialog.getByRole('status')).toContainText('Det är oklart');
        await page.keyboard.press('Escape');
        await opener.click();
        if (delivered) {
          await expect(opener).toHaveCount(0);
          await page.keyboard.press('Escape');
          await page.getByRole('button', { name: 'Visa konfliktvalet', exact: true }).click();
        }
        await expect(discard).toBeDisabled();
        await dialog
          .getByRole('button', { name: 'Kontrollera om valet lades i utkastet', exact: true })
          .click();
        await expect(dialog.getByRole('status')).toContainText(
          delivered ? 'Förslaget har tagits bort ur ditt utkast' : 'valet inte lades i utkastet',
        );
        expect(submitted).toBe(1);
        const after = await app.read();
        if (delivered) {
          expect(after.draft.version).toBe(before.draft.version + 1);
          expect(after.draft.relationships ?? []).toEqual([]);
          await expect(
            dialog.getByRole('heading', {
              name: '✓ Sambandet har tagits bort ur ditt utkast',
              exact: true,
            }),
          ).toBeVisible();
        } else {
          expect(after.draft).toEqual(before.draft);
          await expect(discard).toBeEnabled();
        }
        expect(after.draft.changes).toEqual(before.draft.changes);
        expect(after.relationships).toEqual(before.relationships);
        expect(after.objects).toEqual(before.objects);
        expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
        await page.keyboard.press('Escape');
        expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
      } finally {
        await other.close();
        await app.installation.close();
      }
    });

for (const surface of ['Karta', 'Tabell'] as const) {
  test(`UTKAST-${surface === 'Karta' ? '63' : '135'}: a lost reply verifies retained object and connection removals without replay in ${surface}`, async ({
    page,
    browser,
  }) => {
    const other = await createPreparedContext(browser);
    const app = await prepareOwnRemovalConflict(page.request, other.request, 'connections');
    try {
      await page.setViewportSize({ width: 320, height: 900 });
      const before = await app.read();
      const history = await (await page.request.get(`${app.path}/history`)).json();
      let submitted = 0;
      await page.route('**/map/resolve', async (route) => {
        submitted++;
        await route.fetch();
        await route.abort();
      });
      await page.goto(app.installation.origin);
      if (surface === 'Tabell')
        await page
          .getByRole('navigation', { name: 'Kartans verktyg' })
          .getByRole('button', { name: 'Tabell', exact: true })
          .click();
      const opener = page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
      await dialog
        .getByRole('button', { name: 'Objekt: Ditt förslag – Föreslagen borttagning', exact: true })
        .click();
      await dialog
        .getByRole('button', {
          name: 'Samband: Ditt förslag – Föreslagen borttagning av sambandet',
          exact: true,
        })
        .click();
      await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText('Det är oklart');
      await page.keyboard.press('Escape');
      await opener.click();
      await expect(opener).toHaveCount(0);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Visa konfliktvalet', exact: true }).click();
      await expect(
        dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }),
      ).toBeDisabled();
      await dialog
        .getByRole('button', { name: 'Kontrollera om valet lades i utkastet', exact: true })
        .click();
      await expect(dialog.getByRole('status')).toContainText('Valen finns i ditt utkast');
      await expect(dialog.getByRole('region', { name: 'Resultat av valen' })).toHaveCount(0);
      await expect(dialog.locator('.cp-preview')).toContainText(
        'Föreslagen borttagning av sambandet',
      );
      expect(submitted).toBe(1);
      const after = await app.read();
      expect(after.draft.version).toBe(before.draft.version + 1);
      expect(after.draft.changes.find((change) => change.id === 'lo')).toMatchObject({
        before: before.objects.find((object) => object.id === 'lo'),
        after: null,
      });
      expect(after.draft.relationships).toEqual([
        expect.objectContaining({ id: 'new-edge', before: before.relationships[0], after: null }),
      ]);
      expect(after.objects).toEqual(before.objects);
      expect(after.relationships).toEqual(before.relationships);
      expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
    } finally {
      await other.close();
      await app.installation.close();
    }
  });
}

test('UTKAST-78: next conflict preserves retained choices and focuses the next real heading without another private mutation', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await prepareConflictContinuity(page.request, other.request);
  try {
    const service = {
      ...app.value,
      name: 'Min musiktjänst',
      properties: [
        { id: 'description', label: 'Beskrivning', kind: 'text' as const, value: 'Min tjänst' },
      ],
    };
    await app.propose(page.request, 'draft', 'service', service);
    await app.propose(other.request, 'draft', 'service', {
      ...service,
      name: 'Vår musiktjänst',
      properties: [
        { id: 'description', label: 'Beskrivning', kind: 'text' as const, value: 'Robins tjänst' },
      ],
    });
    expect((await app.save(other.request, 'second-conflict')).status()).toBe(200);
    const before = await app.read();
    const history = await (await page.request.get(`${app.path}/history`)).json();
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '2 konflikter i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    const list = dialog.getByRole('navigation', { name: 'Alla konflikter', exact: true });
    await list.getByRole('button', { name: 'Objekt Min musiktjänst', exact: true }).click();
    const serviceName = dialog.getByRole('button', {
      name: 'Namn: Ditt förslag – Min musiktjänst',
      exact: true,
    });
    const serviceDescription = dialog.getByRole('button', {
      name: 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min tjänst (Text)',
      exact: true,
    });
    await serviceName.click();
    await serviceDescription.click();
    await list.getByRole('button', { name: 'Objekt Lo Lind', exact: true }).click();
    await dialog.getByRole('button', { name: 'Namn: Ditt förslag – Lo Lind', exact: true }).click();
    await dialog
      .getByRole('button', {
        name: 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min anteckning (Text)',
        exact: true,
      })
      .click();
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(
      dialog.getByRole('heading', { name: '✓ Valen finns i ditt utkast', exact: true }),
    ).toBeVisible();
    const reviewed = await app.read();
    expect(reviewed.draft.version).toBe(before.draft.version + 1);
    const next = dialog.getByRole('button', { name: 'Nästa konflikt', exact: true });
    await expect(next).toBeVisible();
    await next.click();
    await expect(
      dialog.getByRole('heading', { name: 'Min musiktjänst', exact: true }),
    ).toBeFocused();
    await expect(serviceName).toHaveAttribute('aria-pressed', 'true');
    await expect(serviceDescription).toHaveAttribute('aria-pressed', 'true');
    expect((await app.read()).draft).toEqual(reviewed.draft);
    expect((await app.read()).objects).toEqual(before.objects);
    expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
    await list.getByRole('button', { name: /^Objekt Lo Lind/ }).click();
    await expect(
      dialog.getByRole('heading', { name: '✓ Valen finns i ditt utkast', exact: true }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Nästa konflikt', exact: true }).click();
    await expect(
      dialog.getByRole('heading', { name: 'Min musiktjänst', exact: true }),
    ).toBeFocused();
  } finally {
    await other.close();
    await app.installation.close();
  }
});
