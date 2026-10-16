import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openDraftReview,
  openMap,
  openNewObject,
  openTable,
  signIn,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { editTableObject, readDraftProposal } from '../support/domain-work.js';
import { createInstallation, robin } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test('AVTAL-04: dated financial proposals recover and a zero credit correction survives restart', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Exempelkredit');
    await page.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Kreditavtal' });
    await page.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
    for (const [label, knowledge, value, date] of [
      ['Senast uppgiven skuld', 'uncertain', '125 000,50', '2026-09-01'],
      ['Beviljat kreditutrymme', 'known', '80 000', '2026-08-01'],
      ['Utnyttjad kredit', 'known', '12 500', '2026-09-02'],
    ]) {
      await page.getByLabel(`${label}: uppgiftens säkerhet`).selectOption(knowledge);
      await page.getByLabel(label, { exact: true }).fill(value);
      await page.getByLabel(`${label}: datum för uppgiften`).fill(date);
    }
    await page.getByLabel('Valuta: uppgiftens säkerhet').selectOption('known');
    await page.getByLabel('Valuta', { exact: true }).fill('SEK');
    await page.getByLabel('Pris: uppgiftens säkerhet').selectOption('unknown');
    await page.getByLabel('Avtalsvillkor: uppgiftens säkerhet').selectOption('none');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const before = await (await page.request.get(path)).json();
    await installation.restart();
    await page.reload();
    const proposal = await readDraftProposal(page, 'Exempelkredit');
    for (const text of [
      '125 000,50',
      '2026-09-01',
      '80 000',
      '2026-08-01',
      '12 500',
      '2026-09-02',
      'Osäkert uppgivet',
      'Okänt',
      'Uttryckligen inget',
    ])
      await expect(proposal).toContainText(text);
    expect((await (await page.request.get(path)).json()).draft).toEqual(before.draft);
    await closeSupportDialog(page, 'Exempelkredit');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await editTableObject(page, 'Exempelkredit');
    await page.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
    await page.getByLabel('Utnyttjad kredit', { exact: true }).fill('0');
    await page.getByLabel('Utnyttjad kredit: datum för uppgiften').fill('2026-09-20');
    await expect(page.getByLabel('Utnyttjad kredit: uppgiftens säkerhet')).toHaveValue('known');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const correction = await readDraftProposal(page, 'Exempelkredit');
    await expect(correction).toContainText('12 500');
    await expect(correction).toContainText('2026-09-20');
    for (const [title, usedCredit] of [
      ['Sparade värden', '12 500 · datum för uppgiften: 2026-09-02'],
      ['Föreslagna värden', '0 · datum för uppgiften: 2026-09-20'],
    ]) {
      const side = correction
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
      for (const [label, value] of [
        [
          'Senast uppgiven skuld',
          '125 000,50 (Osäkert uppgivet) · datum för uppgiften: 2026-09-01',
        ],
        ['Beviljat kreditutrymme', '80 000 · datum för uppgiften: 2026-08-01'],
        ['Utnyttjad kredit', usedCredit],
        ['Valuta', 'SEK'],
        ['Pris', 'Okänt'],
        ['Avtalsvillkor', 'Uttryckligen inget'],
      ]) {
        const field = side
          .locator('dt')
          .filter({ hasText: new RegExp(`^${label}(?: · ändrat)?$`) })
          .locator('..')
          .locator('dd');
        await expect(field).toHaveText(value);
      }
    }
    await closeSupportDialog(page, 'Exempelkredit');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    await editTableObject(page, 'Exempelkredit');
    await page.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
    await expect(page.getByLabel('Utnyttjad kredit', { exact: true })).toHaveValue('0');
    await expect(page.getByLabel('Utnyttjad kredit: datum för uppgiften')).toHaveValue(
      '2026-09-20',
    );
    await expect(page.getByLabel('Senast uppgiven skuld', { exact: true })).toHaveValue(
      '125 000,50',
    );
    await expect(page.getByLabel('Senast uppgiven skuld: uppgiftens säkerhet')).toHaveValue(
      'uncertain',
    );
    await expect(page.getByLabel('Senast uppgiven skuld: datum för uppgiften')).toHaveValue(
      '2026-09-01',
    );
    await expect(page.getByLabel('Beviljat kreditutrymme', { exact: true })).toHaveValue('80 000');
    await expect(page.getByLabel('Beviljat kreditutrymme: datum för uppgiften')).toHaveValue(
      '2026-08-01',
    );
    await expect(page.getByLabel('Pris: uppgiftens säkerhet')).toHaveValue('unknown');
    await expect(page.getByLabel('Avtalsvillkor: uppgiftens säkerhet')).toHaveValue('none');
    const { history }: { history: SaveReceipt[] } = await (
      await page.request.get(`${path}/history`)
    ).json();
    expect(history).toHaveLength(2);
    expect(history[0].changes[0].before?.id).toBe(history[1].changes[0].after?.id);
    expect(history[0].changes[0].after?.financialFacts?.usedCredit?.value).toBe('0');
  } finally {
    await installation.close();
  }
});

test('AVTAL-07: a known debt without a form value preserves the independent draft', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    await page.goto(installation.origin);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Ofullständigt åtagande');
    await page.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Låneavtal' });
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const before = await read();
    await openNewObject(page);
    const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await form.getByLabel('Namn', { exact: true }).fill('Felaktigt åtagande');
    await form.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Låneavtal' });
    await form.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
    await form.getByLabel('Senast uppgiven skuld: uppgiftens säkerhet').selectOption('known');
    await form.getByRole('button', { name: 'Grunduppgifter', exact: true }).click();
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const errors = form.getByRole('alert', { name: 'Formuläret innehåller fel' });
    await expect(errors).toBeFocused();
    await errors.getByRole('link', { name: /^Senast uppgiven skuld:/ }).click();
    await expect(form.getByLabel('Senast uppgiven skuld', { exact: true })).toBeFocused();
    await expect(form.getByLabel('Senast uppgiven skuld', { exact: true })).toHaveValue('');
    await expect(form.getByLabel('Namn', { exact: true })).toHaveValue('Felaktigt åtagande');
    expect(await read()).toEqual(before);
    await form.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    const draft = await openDraftReview(page);
    await expect(draft).toContainText('Ofullständigt åtagande');
    await expect(draft).not.toContainText('Felaktigt åtagande');
    await saveReviewedConflictDraft(page);
    const saved = await read();
    expect(saved.objects).toHaveLength(1);
    expect(saved.objects[0]).toMatchObject({ name: 'Ofullständigt åtagande' });
    expect(saved.objects[0]).not.toHaveProperty('financialFacts');
  } finally {
    await installation.close();
  }
});

test('AVTAL-08: browser conflict choices combine dated debt with another members independent facts', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await createPreparedContext(browser);
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (client = page.request): Promise<MapState> =>
      (await client.get(path)).json();
    const post = (route: string, data: unknown, client = page.request) =>
      client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
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
      ).status(),
    ).toBe(200);
    const initial = await read();
    const value = {
      typeId: initial.types.find((type) => type.name === 'Låneavtal')?.id,
      name: 'Exempellån',
      description: '',
      financialFacts: {
        debt: { knowledge: 'uncertain', value: '150000', reportedOn: '2026-08-01' },
        creditLimit: { knowledge: 'known', value: '200000' },
        terms: { knowledge: 'known', value: 'Preliminära villkor' },
      },
    };
    expect(
      (await post('draft', { version: 0, id: 'loan', baseRevision: null, value })).status(),
    ).toBe(200);
    expect((await post('save', { version: 1, operationId: 'initial' })).status()).toBe(200);
    await page.goto(installation.origin);
    await editTableObject(page, 'Exempellån');
    await page.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
    await page.getByLabel('Senast uppgiven skuld: uppgiftens säkerhet').selectOption('known');
    await page.getByLabel('Senast uppgiven skuld', { exact: true }).fill('140000');
    await page.getByLabel('Senast uppgiven skuld: datum för uppgiften').fill('2026-09-01');
    await page.getByLabel('Avtalsvillkor: uppgiftens säkerhet').selectOption('');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Lo');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    expect((await read(other.request)).draft.changes).toEqual([]);
    const otherPage = await other.newPage();
    await otherPage.goto(installation.origin);
    await editTableObject(otherPage, 'Exempellån');
    await otherPage.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
    await otherPage.getByLabel('Beviljat kreditutrymme', { exact: true }).fill('250000');
    await otherPage.getByLabel('Valuta: uppgiftens säkerhet').selectOption('known');
    await otherPage.getByLabel('Valuta', { exact: true }).fill('SEK');
    await otherPage.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await saveReviewedConflictDraft(otherPage);
    const before = await read();
    const draft = await openDraftReview(page);
    await draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Spara utkastet', exact: true })).toContainText(
      'Utkastet kunde inte sparas',
    );
    expect((await read()).draft).toEqual(before.draft);
    expect((await read()).objects).toHaveLength(1);
    await page.keyboard.press('Escape');
    await closeTextView(page);
    await openMap(page);
    await page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click();
    await openTable(page);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const conflict = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await conflict.getByRole('button', { name: /^Senast uppgiven skuld: Ditt förslag/ }).click();
    await conflict
      .getByRole('button', { name: /^Beviljat kreditutrymme: Sparat i kartan nu/ })
      .click();
    await conflict.getByRole('button', { name: /^Valuta: Sparat i kartan nu/ }).click();
    await conflict.getByRole('button', { name: /^Avtalsvillkor: Ditt förslag/ }).click();
    await conflict.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(conflict.getByRole('status')).toContainText('Valen finns');
    const expectedFacts = {
      debt: { knowledge: 'known', value: '140000', reportedOn: '2026-09-01' },
      creditLimit: { knowledge: 'known', value: '250000' },
      currency: { knowledge: 'known', value: 'SEK' },
    };
    expect((await read()).objects).toEqual(before.objects);
    expect(
      (await read()).draft.changes.find((change) => change.id === 'loan')?.after?.financialFacts,
    ).toEqual(expectedFacts);
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    const form = await editTableObject(page, 'Exempellån');
    await form.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
    await expect(form.getByLabel('Senast uppgiven skuld', { exact: true })).toHaveValue('140000');
    await expect(form.getByLabel('Senast uppgiven skuld: datum för uppgiften')).toHaveValue(
      '2026-09-01',
    );
    await expect(form.getByLabel('Beviljat kreditutrymme', { exact: true })).toHaveValue('250000');
    await expect(form.getByLabel('Valuta', { exact: true })).toHaveValue('SEK');
    await expect(form.getByLabel('Avtalsvillkor: uppgiftens säkerhet')).toHaveValue('');
    const saved = await read();
    expect(saved.objects).toHaveLength(2);
    expect(saved.objects.find((object) => object.name === 'Lo')).toBeTruthy();
    expect(saved.objects.find((object) => object.id === 'loan')?.financialFacts).toEqual(
      expectedFacts,
    );
  } finally {
    await other.close();
    await installation.close();
  }
});

test('AVTAL-01: optional rent facts can be reviewed, found and corrected after reload', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Hyra för lägenheten');
    await page.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Hyresavtal' });
    await page.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
    await page.getByLabel('Pris: uppgiftens säkerhet').selectOption('known');
    await page.getByRole('button', { name: 'Grunduppgifter', exact: true }).click();
    await expect(page.getByLabel('Pris', { exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const problems = page.getByRole('alert', { name: 'Formuläret innehåller fel' });
    await expect(problems).toBeFocused();
    await problems.getByRole('link', { name: /^Pris:/ }).click();
    await expect(page.getByLabel('Pris', { exact: true })).toBeFocused();
    expect((await (await page.request.get(path)).json()).draft.changes).toEqual([]);
    await page.getByLabel('Pris', { exact: true }).fill('9 500');
    await page.getByLabel('Valuta: uppgiftens säkerhet').selectOption('known');
    await page.getByLabel('Valuta', { exact: true }).fill('SEK');
    await page.getByLabel('Betalningsintervall: uppgiftens säkerhet').selectOption('known');
    await page.getByLabel('Betalningsintervall', { exact: true }).fill('Månadsvis');
    await page.getByLabel('Startdatum: uppgiftens säkerhet').selectOption('known');
    await page.getByLabel('Startdatum', { exact: true }).fill('2026-01-01');
    await page.getByLabel('Avtalsvillkor: uppgiftens säkerhet').selectOption('known');
    await page.getByLabel('Avtalsvillkor', { exact: true }).fill('Tre månaders uppsägningstid.');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const review = await readDraftProposal(page, 'Hyra för lägenheten');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Pris(?: · ändrat)?$/ })
        .locator('..'),
    ).toContainText('9 500');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Startdatum(?: · ändrat)?$/ })
        .locator('..'),
    ).toContainText('2026-01-01');
    await expect(review).toContainText('Tre månaders uppsägningstid.');
    await expect(review.locator('dt').filter({ hasText: /^Slutdatum(?: · ändrat)?$/ })).toHaveCount(
      0,
    );
    await closeSupportDialog(page, 'Hyra för lägenheten');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await page.reload();
    await openTable(page);
    await page.getByRole('searchbox', { name: 'Sök objekt i tabellen', exact: true }).fill('hyra');
    const objects = page.getByRole('table');
    await expect(objects.getByRole('rowheader').getByRole('button')).toHaveCount(1);
    await expect(objects.getByRole('rowheader').getByRole('button')).toHaveAccessibleName(
      'Hyra för lägenheten',
    );
    await expect(objects).toContainText('Hyresavtal');
    await editTableObject(page, 'Hyra för lägenheten');
    await page.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
    await expect(page.getByLabel('Pris', { exact: true })).toHaveValue('9 500');
    await expect(page.getByLabel('Slutdatum: uppgiftens säkerhet')).toHaveValue('');
    await page.getByLabel('Pris', { exact: true }).fill('9 700');
    expect(
      await page
        .getByRole('dialog', { name: 'Redigera Hyra för lägenheten' })
        .evaluate((dialog) => dialog.matches(':modal')),
    ).toBe(true);
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toHaveCount(0);
    expect(
      (await (await page.request.get(path)).json()).objects[0].financialFacts.price.value,
    ).toBe('9 500');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await readDraftProposal(page, 'Hyra för lägenheten');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Pris(?: · ändrat)?$/ })
        .first()
        .locator('..'),
    ).toContainText('9 500');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Pris(?: · ändrat)?$/ })
        .last()
        .locator('..'),
    ).toContainText('9 700');
    await closeSupportDialog(page, 'Hyra för lägenheten');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    await openTable(page);
    await editTableObject(page, 'Hyra för lägenheten');
    await page.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
    await expect(page.getByLabel('Pris', { exact: true })).toHaveValue('9 700');
    await expect(page.getByLabel('Startdatum', { exact: true })).toHaveValue('2026-01-01');
    await expect(page.getByLabel('Avtalsvillkor', { exact: true })).toHaveValue(
      'Tre månaders uppsägningstid.',
    );
    const { history }: { history: SaveReceipt[] } = await (
      await page.request.get(`${path}/history`)
    ).json();
    const correction = history
      .flatMap((receipt) => receipt.changes)
      .find((change) => change.before);
    expect(correction?.before?.financialFacts?.price).toEqual({
      knowledge: 'known',
      value: '9 500',
    });
    expect(correction?.after?.financialFacts?.price).toEqual({
      knowledge: 'known',
      value: '9 700',
    });
  } finally {
    await installation.close();
  }
});

test('AVTAL-02: dated debt and credit keep distinct values and incomplete meanings in forms and drafts', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Familjens kreditavtal');
    await page.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Kreditavtal' });
    await page.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
    await page.getByLabel('Senast uppgiven skuld: uppgiftens säkerhet').selectOption('uncertain');
    await page.getByLabel('Senast uppgiven skuld', { exact: true }).fill('Cirka 18 000');
    await page.getByLabel('Senast uppgiven skuld: datum för uppgiften').fill('2026-03-01');
    await page.getByLabel('Beviljat kreditutrymme: uppgiftens säkerhet').selectOption('known');
    await page.getByLabel('Beviljat kreditutrymme', { exact: true }).fill('50 000');
    await page.getByLabel('Beviljat kreditutrymme: datum för uppgiften').fill('2026-03-02');
    await page.getByLabel('Utnyttjad kredit: uppgiftens säkerhet').selectOption('unknown');
    await page.getByLabel('Utnyttjad kredit: datum för uppgiften').fill('2026-03-03');
    await page.getByLabel('Slutdatum: uppgiftens säkerhet').selectOption('none');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const review = await readDraftProposal(page, 'Familjens kreditavtal');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Senast uppgiven skuld(?: · ändrat)?$/ })
        .locator('..'),
    ).toContainText('Cirka 18 000 (Osäkert uppgivet) · datum för uppgiften: 2026-03-01');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Beviljat kreditutrymme(?: · ändrat)?$/ })
        .locator('..'),
    ).toContainText('50 000 · datum för uppgiften: 2026-03-02');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Utnyttjad kredit(?: · ändrat)?$/ })
        .locator('..'),
    ).toContainText('Okänt · datum för uppgiften: 2026-03-03');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Slutdatum(?: · ändrat)?$/ })
        .locator('..'),
    ).toContainText('Uttryckligen inget');
    await page.reload();
    await readDraftProposal(page, 'Familjens kreditavtal');
    await expect(review).toContainText('Cirka 18 000 (Osäkert uppgivet)');
    await closeSupportDialog(page, 'Familjens kreditavtal');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    await openTable(page);
    await editTableObject(page, 'Familjens kreditavtal');
    await page.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
    await expect(page.getByLabel('Senast uppgiven skuld: uppgiftens säkerhet')).toHaveValue(
      'uncertain',
    );
    await expect(page.getByLabel('Senast uppgiven skuld', { exact: true })).toHaveValue(
      'Cirka 18 000',
    );
    await expect(page.getByLabel('Senast uppgiven skuld: datum för uppgiften')).toHaveValue(
      '2026-03-01',
    );
    await expect(page.getByLabel('Beviljat kreditutrymme', { exact: true })).toHaveValue('50 000');
    await expect(page.getByLabel('Beviljat kreditutrymme: datum för uppgiften')).toHaveValue(
      '2026-03-02',
    );
    await expect(page.getByLabel('Utnyttjad kredit: uppgiftens säkerhet')).toHaveValue('unknown');
    await expect(page.getByLabel('Utnyttjad kredit: datum för uppgiften')).toHaveValue(
      '2026-03-03',
    );
    await expect(page.getByLabel('Slutdatum: uppgiftens säkerhet')).toHaveValue('none');
    await page.getByLabel('Utnyttjad kredit: uppgiftens säkerhet').selectOption('known');
    await page.getByLabel('Utnyttjad kredit', { exact: true }).fill('12 000');
    await page.getByLabel('Utnyttjad kredit: datum för uppgiften').fill('2026-03-04');
    await page.getByLabel('Senast uppgiven skuld: uppgiftens säkerhet').selectOption('unknown');
    await page.getByLabel('Beviljat kreditutrymme: datum för uppgiften').fill('');
    await page.getByLabel('Slutdatum: uppgiftens säkerhet').selectOption('');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await readDraftProposal(page, 'Familjens kreditavtal');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Senast uppgiven skuld(?: · ändrat)?$/ })
        .last()
        .locator('..'),
    ).toContainText('Okänt');
    await expect(
      review
        .locator('dt')
        .filter({ hasText: /^Utnyttjad kredit(?: · ändrat)?$/ })
        .last()
        .locator('..'),
    ).toContainText('12 000 · datum för uppgiften: 2026-03-04');
    await closeSupportDialog(page, 'Familjens kreditavtal');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await page.reload();
    await openTable(page);
    await editTableObject(page, 'Familjens kreditavtal');
    await page.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
    await expect(page.getByLabel('Senast uppgiven skuld: uppgiftens säkerhet')).toHaveValue(
      'unknown',
    );
    await expect(page.getByLabel('Senast uppgiven skuld', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Beviljat kreditutrymme', { exact: true })).toHaveValue('50 000');
    await expect(page.getByLabel('Beviljat kreditutrymme: datum för uppgiften')).toHaveValue('');
    await expect(page.getByLabel('Utnyttjad kredit', { exact: true })).toHaveValue('12 000');
    await expect(page.getByLabel('Utnyttjad kredit: datum för uppgiften')).toHaveValue(
      '2026-03-04',
    );
    await expect(page.getByLabel('Slutdatum: uppgiftens säkerhet')).toHaveValue('');
    const state = await (await page.request.get(path)).json();
    expect(state.objects[0].financialFacts).toEqual({
      debt: { knowledge: 'unknown', reportedOn: '2026-03-01' },
      creditLimit: { knowledge: 'known', value: '50 000' },
      usedCredit: { knowledge: 'known', value: '12 000', reportedOn: '2026-03-04' },
    });
  } finally {
    await installation.close();
  }
});
