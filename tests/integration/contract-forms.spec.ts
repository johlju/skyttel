import { expect, test } from '@playwright/test';
import type { SaveReceipt } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

test('AVTAL-01: optional rent facts can be reviewed, found and corrected after reload', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByText('Ekonomiska uppgifter och avtalsvillkor', { exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Hyra för lägenheten');
    await page.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Hyresavtal' });
    await page.getByLabel('Pris: uppgiftens säkerhet').selectOption('known');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await expect(page.getByLabel('Pris', { exact: true })).toBeFocused();
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Inga förslag',
    );
    await page.getByLabel('Pris', { exact: true }).fill('9 500');
    await page.getByLabel('Valuta: uppgiftens säkerhet').selectOption('known');
    await page.getByLabel('Valuta', { exact: true }).fill('SEK');
    await page.getByLabel('Betalningsintervall: uppgiftens säkerhet').selectOption('known');
    await page.getByLabel('Betalningsintervall', { exact: true }).fill('Månadsvis');
    await page.getByLabel('Startdatum: uppgiftens säkerhet').selectOption('known');
    await page.getByLabel('Startdatum', { exact: true }).fill('2026-01-01');
    await page.getByLabel('Avtalsvillkor: uppgiftens säkerhet').selectOption('known');
    await page.getByLabel('Avtalsvillkor', { exact: true }).fill('Tre månaders uppsägningstid.');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Pris: 9 500');
    await expect(review).toContainText('Startdatum: 2026-01-01');
    await expect(review).toContainText('Tre månaders uppsägningstid.');
    await expect(review).not.toContainText('Slutdatum:');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await page.reload();
    await page.getByLabel('Sök objekt').fill('hyra');
    const objects = page.getByRole('list', { name: 'Objekt', exact: true });
    await expect(objects.getByRole('button')).toHaveText(['Hyra för lägenheten']);
    await expect(objects).toContainText('Hyresavtal');
    await objects.getByRole('button', { name: 'Hyra för lägenheten', exact: true }).click();
    await page.getByText('Ekonomiska uppgifter och avtalsvillkor', { exact: true }).click();
    await expect(page.getByLabel('Pris', { exact: true })).toHaveValue('9 500');
    await expect(page.getByLabel('Slutdatum: uppgiftens säkerhet')).toHaveValue('');
    await page.getByLabel('Pris', { exact: true }).fill('9 700');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await expect(review).toContainText('Pris: 9 500');
    await expect(review).toContainText('Pris: 9 700');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await installation.restart();
    await page.reload();
    await page.getByRole('button', { name: 'Hyra för lägenheten', exact: true }).click();
    await page.getByText('Ekonomiska uppgifter och avtalsvillkor', { exact: true }).click();
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
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Familjens kreditavtal');
    await page.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Kreditavtal' });
    await page.getByText('Ekonomiska uppgifter och avtalsvillkor', { exact: true }).click();
    await page.getByLabel('Senast uppgiven skuld: uppgiftens säkerhet').selectOption('uncertain');
    await page.getByLabel('Senast uppgiven skuld', { exact: true }).fill('Cirka 18 000');
    await page.getByLabel('Senast uppgiven skuld: datum för uppgiften').fill('2026-03-01');
    await page.getByLabel('Beviljat kreditutrymme: uppgiftens säkerhet').selectOption('known');
    await page.getByLabel('Beviljat kreditutrymme', { exact: true }).fill('50 000');
    await page.getByLabel('Beviljat kreditutrymme: datum för uppgiften').fill('2026-03-02');
    await page.getByLabel('Utnyttjad kredit: uppgiftens säkerhet').selectOption('unknown');
    await page.getByLabel('Utnyttjad kredit: datum för uppgiften').fill('2026-03-03');
    await page.getByLabel('Slutdatum: uppgiftens säkerhet').selectOption('none');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText(
      'Senast uppgiven skuld: Cirka 18 000 (Osäkert uppgivet) — datum för uppgiften: 2026-03-01',
    );
    await expect(review).toContainText(
      'Beviljat kreditutrymme: 50 000 — datum för uppgiften: 2026-03-02',
    );
    await expect(review).toContainText('Utnyttjad kredit: Okänt — datum för uppgiften: 2026-03-03');
    await expect(review).toContainText('Slutdatum: Uttryckligen inget');
    await page.reload();
    await expect(review).toContainText('Cirka 18 000 (Osäkert uppgivet)');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await installation.restart();
    await page.reload();
    await page.getByRole('button', { name: 'Familjens kreditavtal', exact: true }).click();
    await page.getByText('Ekonomiska uppgifter och avtalsvillkor', { exact: true }).click();
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
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await expect(review).toContainText('Senast uppgiven skuld: Okänt');
    await expect(review).toContainText(
      'Utnyttjad kredit: 12 000 — datum för uppgiften: 2026-03-04',
    );
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await page.reload();
    await page.getByRole('button', { name: 'Familjens kreditavtal', exact: true }).click();
    await page.getByText('Ekonomiska uppgifter och avtalsvillkor', { exact: true }).click();
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
