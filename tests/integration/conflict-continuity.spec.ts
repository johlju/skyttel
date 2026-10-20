import { openDraftReview } from '../support/client.js';
import {
  prepareConflictContinuity,
  prepareConflictReferenceContinuity,
  prepareConflictTypeContinuity,
  resolveConflictElsewhere,
  saveConflictElsewhere,
  saveNewerConflictType,
} from '../support/conflict-continuity.js';
import { expectConflictDraftValues } from '../support/current-conflict-reading.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test('UTKAST-55: reopening discovers new saved data before stale choices can be confirmed', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await prepareConflictContinuity(page.request, other.request);
  try {
    await page.goto(app.installation.origin);
    const opener = page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await dialog.getByRole('button', { name: 'Namn: Ditt förslag – Lo Lind', exact: true }).click();
    const description = dialog.getByRole('button', {
      name: 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min anteckning (Text)',
      exact: true,
    });
    await description.click();
    await page.keyboard.press('Escape');
    await app.propose(other.request, 'draft', 'lo', {
      ...app.value,
      name: 'Lo Ås',
      properties: [
        {
          id: 'description',
          label: 'Beskrivning',
          kind: 'text' as const,
          value: 'Robins anteckning',
        },
      ],
    });
    expect((await app.save(other.request, 'saved-while-closed')).status()).toBe(200);
    const before = await app.read();
    await opener.click();
    await expect(dialog.getByText('Underlaget har ändrats.', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('status')).toContainText('Underlaget har ändrats.');
    await expect(
      dialog
        .locator('[role="alert"], [role="status"]:not([aria-live="off"])')
        .filter({ hasText: 'Underlaget har ändrats.' }),
    ).toHaveCount(1);
    await expect(
      dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }),
    ).toBeDisabled();
    await dialog.getByRole('button', { name: 'Visa aktuell jämförelse', exact: true }).click();
    await expect(description).toHaveAttribute('aria-pressed', 'true');
    await expect(
      dialog.getByRole('button', { name: 'Namn: Ditt förslag – Lo Lind', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    const after = await app.read();
    expect(after.draft).toEqual(before.draft);
    expect(after.objects).toEqual(before.objects);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-56: pending and unknown conflict outcomes have one accessible status without stealing later focus', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await prepareConflictContinuity(page.request, other.request);
  let release: (() => void) | undefined;
  try {
    const before = await app.read();
    await page.route('**/map/resolve', async (route) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fetch();
      await route.abort();
    });
    await page.goto(app.installation.origin);
    const opener = page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await dialog.getByRole('button', { name: 'Namn: Ditt förslag – Lo Lind', exact: true }).click();
    await dialog
      .getByRole('button', {
        name: 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min anteckning (Text)',
        exact: true,
      })
      .click();
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Lägger valen');
    await expect(
      dialog.getByRole('button', { name: 'Stäng konfliktdialogen', exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole('navigation', { name: 'Alla konflikter' }).getByRole('button'),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    expect((await app.read()).draft).toEqual(before.draft);
    await expect.poll(() => typeof release).toBe('function');
    release?.();
    await expect(dialog.getByRole('status')).toContainText('Det är oklart');
    await page.keyboard.press('Escape');
    const status = page.getByRole('status', { name: 'Konfliktvalens status', exact: true });
    await expect(status).toContainText('Det är oklart');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    const later = page
      .getByRole('navigation', { name: 'Kartans verktyg' })
      .getByRole('button', { name: 'Tabell', exact: true });
    await later.focus();
    await expect(later).toBeFocused();
    await opener.click();
    await expect(page.locator('p[aria-label="Konfliktvalens status"]')).toHaveAttribute(
      'aria-live',
      'off',
    );
    await expect(dialog.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    await dialog
      .getByRole('button', { name: 'Kontrollera om valet lades i utkastet', exact: true })
      .click();
    await expect(dialog).toContainText('✓ Valen finns i ditt utkast');
  } finally {
    release?.();
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-49: switching conflicts and reopening preserves choices and never clears another conflict’s stale guard', async ({
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
    await page.goto(app.installation.origin);
    const opener = page.getByRole('button', { name: '2 konflikter i ditt utkast', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    const cases = dialog.getByRole('navigation', { name: 'Alla konflikter', exact: true });
    await dialog.getByRole('button', { name: 'Namn: Ditt förslag – Lo Lind', exact: true }).click();
    await dialog
      .getByRole('button', {
        name: 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min anteckning (Text)',
        exact: true,
      })
      .click();
    await cases.getByRole('button', { name: 'Objekt Min musiktjänst', exact: true }).click();
    const serviceName = dialog.getByRole('button', {
      name: 'Namn: Ditt förslag – Min musiktjänst',
      exact: true,
    });
    await serviceName.click();
    await dialog
      .getByRole('button', {
        name: 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min tjänst (Text)',
        exact: true,
      })
      .click();
    await page.keyboard.press('Escape');
    await opener.click();
    await expect(serviceName).toHaveAttribute('aria-pressed', 'true');
    await cases.getByRole('button', { name: 'Objekt Lo Lind', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Namn: Ditt förslag – Lo Lind', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await app.propose(other.request, 'draft', 'lo', {
      ...app.value,
      name: 'Lo Ås',
      properties: [
        {
          id: 'description',
          label: 'Beskrivning',
          kind: 'text' as const,
          value: 'Robins anteckning',
        },
      ],
    });
    expect((await app.save(other.request, 'changed-lo')).status()).toBe(200);
    const before = await app.read();
    const confirm = dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true });
    await confirm.click();
    await expect(dialog.getByText('Underlaget har ändrats.', { exact: true })).toBeVisible();
    await cases.getByRole('button', { name: 'Objekt Min musiktjänst', exact: true }).click();
    await expect(confirm).toBeEnabled();
    await expect(serviceName).toHaveAttribute('aria-pressed', 'true');
    await cases.getByRole('button', { name: 'Objekt Lo Lind', exact: true }).click();
    await expect(confirm).toBeDisabled();
    await expect(dialog.getByText('Underlaget har ändrats.', { exact: true })).toBeVisible();
    const after = await app.read();
    expect(after.draft).toEqual(before.draft);
    expect(after.objects).toEqual(before.objects);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-50: refreshed conflict data clears only choices for properties that actually changed', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await prepareConflictContinuity(page.request, other.request);
  try {
    const { value } = app;
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    const proposedName = dialog.getByRole('button', {
      name: 'Namn: Ditt förslag – Lo Lind',
      exact: true,
    });
    const proposedDescription = dialog.getByRole('button', {
      name: 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min anteckning (Text)',
      exact: true,
    });
    await proposedName.click();
    await proposedDescription.click();
    const before = await app.read();
    await app.propose(other.request, 'draft', 'lo', {
      ...value,
      name: 'Lo Ås',
      properties: [
        {
          id: 'description',
          label: 'Beskrivning',
          kind: 'text' as const,
          value: 'Robins anteckning',
        },
      ],
    });
    expect((await app.save(other.request, 'newer-name')).status()).toBe(200);
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(dialog.getByText('Underlaget har ändrats.', { exact: true })).toBeVisible();
    expect((await app.read()).draft).toEqual(before.draft);
    await page.route('**/map', (route) => route.abort());
    await dialog.getByRole('button', { name: 'Visa aktuell jämförelse', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Aktuellt underlag kunde inte hämtas');
    await expect(dialog.getByRole('heading', { level: 2 })).toBeFocused();
    await expect(proposedName).toHaveAttribute('aria-pressed', 'true');
    await expect(proposedDescription).toHaveAttribute('aria-pressed', 'true');
    await page.unroute('**/map');
    await dialog.getByRole('button', { name: 'Visa aktuell jämförelse', exact: true }).click();
    await expect(proposedName).toHaveAttribute('aria-pressed', 'false');
    await expect(proposedDescription).toHaveAttribute('aria-pressed', 'true');
    await expect(
      dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }),
    ).toBeDisabled();
    await proposedName.click();
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Valen finns i ditt utkast');
    expect((await app.read()).draft.changes[0].after).toMatchObject(value);
    expect((await app.read()).objects.find(({ id }) => id === 'lo')).toMatchObject({
      name: 'Lo Ås',
      properties: expect.arrayContaining([
        expect.objectContaining({ label: 'Beskrivning', kind: 'text', value: 'Robins anteckning' }),
      ]),
    });
  } finally {
    await other.close();
    await app.installation.close();
  }
});

for (const width of [1280, 320])
  test(`UTKAST-${width === 1280 ? '54' : '119'}: an unsent resolution is verified before retrying with the retained choices at ${width}px`, async ({
    page,
    browser,
  }) => {
    const other = await createPreparedContext(browser);
    const app = await prepareConflictContinuity(page.request, other.request);
    try {
      await page.setViewportSize({ width, height: 900 });
      const before = await app.read();
      await page.route('**/map/resolve', (route) => route.abort());
      await page.goto(app.installation.origin);
      const opener = page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
      const name = dialog.getByRole('button', {
        name: 'Namn: Ditt förslag – Lo Lind',
        exact: true,
      });
      const description = dialog.getByRole('button', {
        name: 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min anteckning (Text)',
        exact: true,
      });
      await name.click();
      await description.click();
      const confirm = dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true });
      await confirm.click();
      await expect(dialog.getByRole('status')).toContainText('Det är oklart');
      expect((await app.read()).draft).toEqual(before.draft);
      await page.keyboard.press('Escape');
      await opener.click();
      await expect(confirm).toBeDisabled();
      await page.route('**/map', (route) => route.abort());
      const check = dialog.getByRole('button', {
        name: 'Kontrollera om valet lades i utkastet',
        exact: true,
      });
      await check.click();
      await expect(dialog.getByRole('status')).toContainText('Utfallet är fortfarande oklart');
      await expect(confirm).toBeDisabled();
      await page.unroute('**/map');
      await check.click();
      await expect(dialog.getByRole('status')).toContainText('valet inte lades i utkastet');
      await expect(name).toHaveAttribute('aria-pressed', 'true');
      await expect(description).toHaveAttribute('aria-pressed', 'true');
      await expect(confirm).toBeEnabled();
      await page.unroute('**/map/resolve');
      await confirm.click();
      await expect(dialog).toContainText('✓ Valen finns i ditt utkast');
      expect((await app.read()).draft.version).toBe(before.draft.version + 1);
      expect((await app.read()).objects).toEqual(before.objects);
    } finally {
      await other.close();
      await app.installation.close();
    }
  });

for (const surface of ['Karta', 'Tabell'] as const)
  for (const side of ['proposed', 'saved'] as const)
    for (const width of [1280, 320] as const)
      test(`UTKAST-${{ 'Karta-proposed-1280': '53', 'Karta-proposed-320': '120', 'Karta-saved-1280': '121', 'Karta-saved-320': '122', 'Tabell-proposed-1280': '123', 'Tabell-proposed-320': '124', 'Tabell-saved-1280': '125', 'Tabell-saved-320': '126' }[`${surface}-${side}-${width}`]}: a lost resolution reply stays reachable after the last conflict disappears in ${surface} (${side}) at ${width}px`, async ({
        page,
        browser,
      }) => {
        const other = await createPreparedContext(browser);
        const app = await prepareConflictContinuity(page.request, other.request);
        try {
          await page.setViewportSize({ width, height: 900 });
          const { value } = app;
          const before = await app.read();
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
          const opener = page.getByRole('button', {
            name: '1 konflikt i ditt utkast',
            exact: true,
          });
          await opener.click();
          const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
          await dialog
            .getByRole('button', {
              name:
                side === 'proposed'
                  ? 'Namn: Ditt förslag – Lo Lind'
                  : 'Namn: Sparat i kartan nu – Lo Berg',
              exact: true,
            })
            .click();
          await dialog
            .getByRole('button', {
              name:
                side === 'proposed'
                  ? 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min anteckning (Text)'
                  : 'Beskrivning · egenskap 1: Sparat i kartan nu – Beskrivning: Robins anteckning (Text)',
              exact: true,
            })
            .click();
          await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
          await expect(dialog.getByRole('status')).toContainText('Det är oklart');
          await page.keyboard.press('Escape');
          await expect(dialog).not.toBeVisible();
          await opener.click();
          await expect(opener).toHaveCount(0);
          await page.keyboard.press('Escape');
          const followUp = page.getByRole('button', { name: 'Visa konfliktvalet', exact: true });
          await expect(followUp).toBeVisible();
          await followUp.click();
          await expect(
            dialog.getByRole('heading', { name: 'Granska konflikter', exact: true }),
          ).toBeFocused();
          await expect(
            dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }),
          ).toBeDisabled();
          await dialog
            .getByRole('button', { name: 'Kontrollera om valet lades i utkastet', exact: true })
            .click();
          await expect(dialog).toContainText(
            side === 'proposed'
              ? '✓ Valen finns i ditt utkast'
              : '✓ Förslaget har tagits bort ur ditt utkast',
          );
          await expect(dialog.locator('.cp-resolved-mark')).toHaveText('✓');
          expect(submitted).toBe(1);
          const after = await app.read();
          expect(after.draft.version).toBe(before.draft.version + 1);
          if (side === 'proposed') expect(after.draft.changes[0].after).toMatchObject(value);
          else expect(after.draft.changes).toEqual([]);
          expect(after.objects).toEqual(before.objects);
          expect(
            (await (await page.request.get(`${app.path}/history`)).json()).history,
          ).toHaveLength(2);
          await page.keyboard.press('Escape');
          const privateDraft = await openDraftReview(page);
          if (side === 'saved') await expect(privateDraft).toContainText('Utkastet är tomt.');
          else
            await expectConflictDraftValues(page, 'Lo Lind', {
              Namn: 'Lo Lind',
              Beskrivning: 'Min anteckning',
            });
        } finally {
          await other.close();
          await app.installation.close();
        }
      });

test('UTKAST-51: a changed object type retains independent property kinds while unaffected choices remain', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await prepareConflictTypeContinuity(page.request, other.request);
  try {
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    for (const name of [
      'Namn: Ditt förslag – Lo Lind',
      'Beskrivning · egenskap 2: Ditt förslag – Beskrivning: Min anteckning (Text)',
      'Anteckning · egenskap 1: Ditt förslag – Anteckning: Min text (Text)',
    ])
      await dialog.getByRole('button', { name, exact: true }).click();
    await saveNewerConflictType(app, other.request);
    const before = await app.read();
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(dialog.getByText('Underlaget har ändrats.', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Visa aktuell jämförelse', exact: true }).click();
    await expect(
      dialog.getByRole('button', {
        name: 'Beskrivning · egenskap 2: Ditt förslag – Beskrivning: Min anteckning (Text)',
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    const note = dialog.getByRole('button', {
      name: 'Anteckning · egenskap 1: Ditt förslag – Anteckning: Min text (Text)',
      exact: true,
    });
    await expect(note).toHaveAttribute('aria-pressed', 'false');
    await note.click();
    await dialog
      .getByRole('button', { name: 'Objekttyp: Sparat i kartan nu – Mätobjekt', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(
      dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }),
    ).toBeEnabled();
    await expect(note).toHaveAttribute('aria-pressed', 'true');
    await expect(
      dialog.getByRole('region', { name: 'Resultat av valen', exact: true }),
    ).toContainText('Min text (Text)');
    expect((await app.read()).draft).toEqual(before.draft);
    await dialog
      .getByRole('button', { name: 'Objekttyp: Ditt förslag – Anteckningsobjekt', exact: true })
      .click();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(dialog).toContainText('✓ Valen finns i ditt utkast');
    expect((await app.read()).draft.changes[0].after).toEqual(app.value);
    expect((await app.read()).objects).toEqual(before.objects);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-52: a known version rejection retains choices and retries only after a current comparison', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await prepareConflictContinuity(page.request, other.request);
  try {
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    for (const name of [
      'Namn: Ditt förslag – Lo Lind',
      'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min anteckning (Text)',
    ])
      await dialog.getByRole('button', { name, exact: true }).click();
    await app.propose(page.request, 'draft', 'independent', { ...app.value, name: 'Privat stol' });
    const before = await app.read();
    const confirm = dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true });
    await confirm.click();
    await expect(dialog.getByRole('status')).toContainText('Dina val finns kvar');
    await expect(
      dialog
        .locator('[role="alert"], [role="status"]:not([aria-live="off"])')
        .filter({ hasText: 'Underlaget har ändrats.' }),
    ).toHaveCount(1);
    await expect(confirm).toBeDisabled();
    expect((await app.read()).draft).toEqual(before.draft);
    await dialog.getByRole('button', { name: 'Visa aktuell jämförelse', exact: true }).click();
    for (const name of [
      'Namn: Ditt förslag – Lo Lind',
      'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min anteckning (Text)',
    ])
      await expect(dialog.getByRole('button', { name, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(dialog).toContainText('✓ Valen finns i ditt utkast');
    const after = await app.read();
    expect(after.draft.version).toBe(before.draft.version + 1);
    expect(after.draft.changes.find(({ id }) => id === 'independent')).toEqual(
      before.draft.changes.find(({ id }) => id === 'independent'),
    );
    expect(after.objects).toEqual(before.objects);
    expect((await (await page.request.get(`${app.path}/history`)).json()).history).toHaveLength(2);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-127: a changed relationship reference refreshes its meaning without clearing unchanged property choices', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await prepareConflictReferenceContinuity(page.request, other.request);
  try {
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await dialog
      .getByRole('button', { name: 'Till objekt: Ditt förslag – Molnmusik', exact: true })
      .click();
    await dialog
      .getByRole('button', {
        name: 'Uppgiftens säkerhet · egenskap 1: Ditt förslag – Uppgiftens säkerhet: Osäkert uppgivet (Text)',
        exact: true,
      })
      .click();
    const state = await app.read();
    await app.propose(other.request, 'draft', 'service', {
      typeId: state.types[0].id,
      name: 'Ny musiktjänst',
    });
    expect((await app.save(other.request, 'newer-reference')).status()).toBe(200);
    const before = await app.read();
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(dialog.getByText('Underlaget har ändrats.', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Visa aktuell jämförelse', exact: true }).click();
    await expect(
      dialog.getByRole('button', {
        name: 'Till objekt: Ditt förslag – Ny musiktjänst',
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      dialog.getByRole('button', {
        name: 'Uppgiftens säkerhet · egenskap 1: Ditt förslag – Uppgiftens säkerhet: Osäkert uppgivet (Text)',
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(dialog).toContainText('✓ Valen finns i ditt utkast');
    expect((await app.read()).draft.relationships?.[0].after).toEqual(app.value);
    expect((await app.read()).relationships).toEqual(before.relationships);
    expect((await app.read()).objects).toEqual(before.objects);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-128: a conflict resolved by another client becomes read-only after reopening', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await prepareConflictContinuity(page.request, other.request);
  try {
    await page.goto(app.installation.origin);
    const opener = page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await dialog.getByRole('button', { name: 'Namn: Ditt förslag – Lo Lind', exact: true }).click();
    await dialog
      .getByRole('button', {
        name: 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min anteckning (Text)',
        exact: true,
      })
      .click();
    await page.keyboard.press('Escape');
    await resolveConflictElsewhere(app, page.request);
    const before = await app.read();
    await opener.click();
    await expect(dialog.getByRole('status')).toContainText('Konflikten finns inte längre');
    await expect(
      dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole('heading', { name: 'Granska konflikter', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    const after = await app.read();
    expect(after.draft).toEqual(before.draft);
    expect(after.objects).toEqual(before.objects);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

for (const side of ['saved', 'proposed'] as const)
  test(`UTKAST-${side === 'saved' ? '129' : '130'}: another client consuming the draft cannot turn an unknown ${side} choice into private success`, async ({
    page,
    browser,
  }) => {
    const other = await createPreparedContext(browser);
    const app = await prepareConflictContinuity(page.request, other.request);
    try {
      await app.propose(page.request, 'draft', 'independent', {
        ...app.value,
        name: 'Privat stol',
      });
      await page.route('**/map/resolve', async (route) => {
        if (side === 'proposed') await route.fetch();
        await route.abort();
      });
      await page.goto(app.installation.origin);
      const opener = page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
      await dialog
        .getByRole('button', {
          name:
            side === 'proposed'
              ? 'Namn: Ditt förslag – Lo Lind'
              : 'Namn: Sparat i kartan nu – Lo Berg',
          exact: true,
        })
        .click();
      await dialog
        .getByRole('button', {
          name:
            side === 'proposed'
              ? 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min anteckning (Text)'
              : 'Beskrivning · egenskap 1: Sparat i kartan nu – Beskrivning: Robins anteckning (Text)',
          exact: true,
        })
        .click();
      await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText('Det är oklart');
      await page.keyboard.press('Escape');
      await saveConflictElsewhere(app, page.request);
      const before = await app.read();
      expect(before.draft.changes).toEqual([]);
      expect(before.objects.find(({ id }) => id === 'lo')?.name).toBe('Lo Lind');
      await opener.click();
      await dialog
        .getByRole('button', { name: 'Kontrollera om valet lades i utkastet', exact: true })
        .click();
      await expect(dialog.getByRole('status')).toContainText('Konflikten finns inte längre');
      await expect(dialog.locator('.cp-resolved-mark')).toHaveCount(0);
      await expect(
        dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }),
      ).toHaveCount(0);
      await expect(dialog.getByRole('status')).not.toContainText('Du kan försöka igen');
      await expect(dialog.getByRole('status')).not.toContainText('kartan är inte sparad');
      const after = await app.read();
      expect(after.draft).toEqual(before.draft);
      expect(after.objects).toEqual(before.objects);
      expect((await (await page.request.get(`${app.path}/history`)).json()).history).toHaveLength(
        3,
      );
    } finally {
      await other.close();
      await app.installation.close();
    }
  });

test('UTKAST-131: a later save after a lost applied reply retains unchanged choices when reviewing the new conflict', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await prepareConflictContinuity(page.request, other.request);
  try {
    let appliedStatus: number | undefined;
    await page.route('**/map/resolve', async (route) => {
      appliedStatus = (await route.fetch()).status();
      await route.abort();
    });
    await page.goto(app.installation.origin);
    const opener = page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    const name = dialog.getByRole('button', { name: 'Namn: Ditt förslag – Lo Lind', exact: true });
    const description = dialog.getByRole('button', {
      name: 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min anteckning (Text)',
      exact: true,
    });
    await name.click();
    await description.click();
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Det är oklart');
    expect(appliedStatus).toBe(200);
    const applied = await app.read();
    expect(applied.draft.changes).toHaveLength(1);
    expect(applied.draft.changes[0].before).toEqual(applied.objects.find(({ id }) => id === 'lo'));
    expect(applied.draft.changes[0].after).toEqual(app.value);
    await page.keyboard.press('Escape');
    await app.propose(other.request, 'draft', 'lo', {
      ...app.value,
      name: 'Lo Ås',
      properties: [
        {
          id: 'description',
          label: 'Beskrivning',
          kind: 'text' as const,
          value: 'Robins anteckning',
        },
      ],
    });
    expect((await app.save(other.request, 'newer-after-applied')).status()).toBe(200);
    const before = await app.read();
    expect(before.draft).toEqual(applied.draft);
    await opener.click();
    await dialog
      .getByRole('button', { name: 'Kontrollera om valet lades i utkastet', exact: true })
      .click();
    await expect(dialog.locator('.cp-resolved-mark')).toHaveCount(0);
    await expect(
      dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }),
    ).toBeDisabled();
    await dialog.getByRole('button', { name: 'Visa aktuell jämförelse', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText(
      'Aktuell jämförelse visas. Opåverkade val finns kvar.',
    );
    const retainedDescription = dialog
      .getByRole('region', { name: 'Ditt förslag', exact: true })
      .getByText('Beskrivning · egenskap 1', { exact: true })
      .locator('..');
    await expect(
      retainedDescription.getByText('Beskrivning: Min anteckning (Text)', { exact: true }),
    ).toBeVisible();
    await expect(
      retainedDescription.getByText('Oberoende ändring · kombineras', { exact: true }),
    ).toBeVisible();
    await expect(
      dialog
        .getByRole('region', { name: 'Resultat av valen', exact: true })
        .getByText('Beskrivning · egenskap 1', { exact: true })
        .locator('..')
        .getByRole('definition'),
    ).toHaveText('Beskrivning: Min anteckning (Text) · Ditt förslag');
    await expect(name).toHaveAttribute('aria-pressed', 'false');
    expect((await app.read()).draft).toEqual(before.draft);
    await name.click();
    await page.unroute('**/map/resolve');
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(dialog).toContainText('✓ Valen finns i ditt utkast');
    expect((await app.read()).objects).toEqual(before.objects);
  } finally {
    await other.close();
    await app.installation.close();
  }
});
