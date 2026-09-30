import { expect, test } from '@playwright/test';
import { createHousehold, openWorkspace, signIn } from '../support/client.js';
import { expectContentOwnerReview } from '../support/content-owners.js';
import { createInstallation, robin } from '../support/installation.js';

test('FLYTT-02: an uncertain explicit identity assignment is read back while both private states and historical receipts remain intact', async ({
  browser,
}) => {
  const source = await createInstallation();
  const destination = await createInstallation({ provider: 'microsoft', subject: robin.subject });
  const sourceContext = await browser.newContext();
  const targetContext = await browser.newContext();
  const sourceClient = sourceContext.request;
  const targetClient = targetContext.request;
  const page = await targetContext.newPage();
  const stale = await targetContext.newPage();
  try {
    await signIn(sourceClient, source.origin);
    const { household } = await (await createHousehold(sourceClient, source.origin)).json();
    const sourcePath = `${source.origin}/api/households/${household.id}`;
    const sourceHeaders = { origin: source.origin };
    const initial = await (await sourceClient.get(`${sourcePath}/map`)).json();
    const typeId = initial.types[0].id;
    expect(
      (
        await sourceClient.post(`${sourcePath}/map/draft`, {
          headers: sourceHeaders,
          data: {
            id: 'shared',
            version: 0,
            baseRevision: null,
            value: { name: 'Delad lampa', description: '', typeId },
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await sourceClient.post(`${sourcePath}/map/save`, {
          headers: sourceHeaders,
          data: { version: 1, operationId: 'original-receipt' },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await sourceClient.post(`${sourcePath}/map/draft`, {
          headers: sourceHeaders,
          data: {
            id: 'source-private',
            version: 2,
            baseRevision: null,
            value: {
              name: 'Privat från källan',
              description: 'Visas aldrig i ägargranskningen',
              typeId,
            },
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await sourceClient.post(`${sourcePath}/map/view/position`, {
          headers: sourceHeaders,
          data: { id: 'shared', version: 0, position: { x: 17, y: 8, z: 3 } },
        })
      ).status(),
    ).toBe(200);
    const historic = await (await sourceClient.get(`${sourcePath}/map`)).json();
    const historicView = await (await sourceClient.get(`${sourcePath}/map/view`)).json();
    const historicHistory = (await (await sourceClient.get(`${sourcePath}/map/history`)).json())
      .history;
    const exported = await (
      await sourceClient.post(`${sourcePath}/exports`, { headers: sourceHeaders, data: {} })
    ).json();
    const archive = await (await sourceClient.get(`${sourcePath}/exports/${exported.id}`)).body();

    // Matching names and email addresses are deliberately not identity proof.
    destination.setIdentity({ ...robin, name: 'Alex Exempel', email: 'alex@example.test' });
    await signIn(targetClient, destination.origin, 'microsoft');
    const { household: target } = await (
      await createHousehold(targetClient, destination.origin)
    ).json();
    const { user } = await (await targetClient.get(`${destination.origin}/api/bootstrap`)).json();
    const path = `${destination.origin}/api/households/${target.id}`;
    const headers = { origin: destination.origin };
    await page.goto(`${destination.origin}/households/${target.id}/settings/import`);
    const importer = page.getByRole('region', { name: 'Återimportera hushållet', exact: true });
    await importer
      .getByLabel('Skyttel-export (ZIP)')
      .setInputFiles({ name: 'source.zip', mimeType: 'application/zip', buffer: archive });
    await importer.getByRole('button', { name: 'Kontrollera importfil' }).click();
    await importer
      .getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' })
      .check();
    await importer.getByRole('button', { name: 'Ersätt hushållets innehåll' }).click();
    await expect(importer.getByText(/Hushållets innehåll är ersatt/)).toBeVisible();
    const restored = await (await targetClient.get(`${path}/map`)).json();
    expect(restored.userId).not.toBe(historic.userId);
    expect(restored.draft.changes).toEqual([]);
    expect((await (await targetClient.get(`${path}/map/history`)).json()).history).toEqual(
      historicHistory,
    );
    expect(
      (
        await targetClient.post(`${path}/map/draft`, {
          headers,
          data: {
            id: 'independent-private',
            version: restored.draft.version,
            contentVersion: restored.contentVersion,
            baseRevision: null,
            value: { name: 'Oberoende privat arbete', description: '', typeId },
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await targetClient.post(`${path}/map/view/position`, {
          headers,
          data: {
            id: 'shared',
            version: 0,
            contentVersion: restored.contentVersion,
            position: { x: -12, y: 4, z: 6 },
          },
        })
      ).status(),
    ).toBe(200);
    const independent = await (await targetClient.get(`${path}/map`)).json();
    const independentView = await (await targetClient.get(`${path}/map/view`)).json();
    const pending = {
      version: independent.draft.version,
      contentVersion: independent.contentVersion,
      operationId: 'before-identity-assignment',
    };
    await stale.goto(`${destination.origin}/households/${target.id}`);
    await openWorkspace(stale);
    await stale.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await stale.getByLabel('Objektets namn').fill('Gammalt oskickat formulär');
    expect(
      (await targetClient.post(`${path}/map/operations`, { headers, data: pending })).status(),
    ).toBe(200);

    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`${destination.origin}/households/${target.id}/settings/content-owners`);
    const owners = page.getByRole('region', { name: 'Koppla historiskt innehåll', exact: true });
    const load = owners.getByRole('button', { name: 'Hämta aktuella innehållskopplingar' });
    await load.click();
    const metadata = await (await targetClient.get(`${path}/content-owners`)).json();
    expect(JSON.stringify(metadata)).not.toContain('Privat från källan');
    expect(JSON.stringify(metadata)).not.toContain('Visas aldrig i ägargranskningen');
    expect(metadata.identities).toContainEqual(
      expect.objectContaining({ id: historic.userId, userId: null, draftChanges: 1, positions: 1 }),
    );
    await owners.getByLabel('Historisk innehållsidentitet').selectOption(historic.userId);
    await owners.getByLabel('Aktuell verifierad medlem').selectOption(user.id);
    expect(historic.userId).not.toBe(user.id);
    await expectContentOwnerReview(
      owners,
      `Alex Exempel (${historic.userId})`,
      `Alex Exempel (${user.id})`,
    );
    await expect(owners).toContainText('samma namn eller e-postadress är inget bevis');
    await expect(owners).toContainText(
      `Den valda medlemmen lämnar Alex Exempel (${independent.userId})`,
    );
    await expect(owners).toContainText('inget slås ihop eller skrivs över');
    const confirm = owners.getByRole('button', { name: 'Bekräfta innehållskopplingen' });
    await expect(confirm).toBeDisabled();
    const confirmed = owners.getByRole('checkbox', { name: 'Jag har identifierat rätt person' });
    await confirmed.check();
    await expect(confirm).toBeEnabled();
    await owners.getByLabel('Aktuell verifierad medlem').selectOption('');
    await expectContentOwnerReview(
      owners,
      `Alex Exempel (${historic.userId})`,
      'Ingen aktuell ägare',
    );
    await expect(confirmed).not.toBeChecked();
    await expect(confirm).toBeDisabled();
    await confirmed.check();
    await owners.getByLabel('Historisk innehållsidentitet').selectOption(independent.userId);
    await expectContentOwnerReview(
      owners,
      `Alex Exempel (${independent.userId})`,
      'Ingen aktuell ägare',
    );
    await expect(confirmed).not.toBeChecked();
    await expect(confirm).toBeDisabled();
    await owners.getByLabel('Historisk innehållsidentitet').selectOption(historic.userId);
    await owners.getByLabel('Aktuell verifierad medlem').selectOption(user.id);
    await expectContentOwnerReview(
      owners,
      `Alex Exempel (${historic.userId})`,
      `Alex Exempel (${user.id})`,
    );
    let writes = 0;
    await page.route('**/content-owners/assign', async (route) => {
      writes++;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      expect((await response.json()).contentVersion).toBe(3);
      await route.abort('failed');
    });
    await owners.getByRole('checkbox', { name: 'Jag har identifierat rätt person' }).check();
    await confirm.focus();
    await page.keyboard.press('Enter');
    await expect(owners.getByRole('alert')).toContainText('Utfallet är okänt');
    await expect(load).toBeFocused();
    await expect(owners.getByLabel('Historisk innehållsidentitet')).toBeDisabled();
    await expect(owners.getByLabel('Aktuell verifierad medlem')).toBeDisabled();
    await expect(
      owners.getByRole('checkbox', { name: 'Jag har identifierat rätt person' }),
    ).toBeDisabled();
    await expect(confirm).toBeDisabled();
    await page.route('**/content-owners', async (route) => {
      await route.fetch();
      await route.abort('failed');
    });
    await load.click();
    await expect(owners.getByRole('alert')).toContainText('kunde inte hämtas');
    await expect(owners.getByLabel('Historisk innehållsidentitet')).toBeDisabled();
    await expect(owners.getByLabel('Aktuell verifierad medlem')).toBeDisabled();
    await expect(
      owners.getByRole('checkbox', { name: 'Jag har identifierat rätt person' }),
    ).toBeDisabled();
    await expect(confirm).toBeDisabled();
    expect(writes).toBe(1);
    await page.unroute('**/content-owners');
    await load.click();
    await expect(owners.getByText('Innehållskopplingen är sparad.', { exact: true })).toHaveCount(
      0,
    );
    await owners.getByLabel('Historisk innehållsidentitet').selectOption(historic.userId);
    await expect(owners).toContainText(`Nuvarande koppling: Alex Exempel (${user.id})`);
    await expect(confirm).toBeDisabled();
    const selected = await (await targetClient.get(`${path}/map`)).json();
    expect(selected.userId).toBe(historic.userId);
    expect(historic.draft.changes).toHaveLength(1);
    expect(selected.draft).toEqual({
      ...historic.draft,
      changes: [
        {
          ...historic.draft.changes[0],
          type: { ...historic.draft.changes[0].type, householdId: target.id },
        },
      ],
    });
    expect((await (await targetClient.get(`${path}/map/view`)).json()).positions).toEqual(
      historicView.positions,
    );
    expect((await targetClient.post(`${path}/map/save`, { headers, data: pending })).status()).toBe(
      409,
    );
    await expect(stale.getByLabel('Objektets namn')).toHaveCount(0);

    await page.unroute('**/content-owners/assign');
    await owners.getByLabel('Historisk innehållsidentitet').selectOption(independent.userId);
    await owners.getByLabel('Aktuell verifierad medlem').selectOption(user.id);
    await expect(confirm).toBeDisabled();
    await owners.getByRole('checkbox', { name: 'Jag har identifierat rätt person' }).check();
    await confirm.click();
    await expect(owners.getByText('Innehållskopplingen är sparad.', { exact: true })).toBeVisible();
    expect((await (await targetClient.get(`${path}/map`)).json()).draft).toEqual(independent.draft);
    expect((await (await targetClient.get(`${path}/map/view`)).json()).positions).toEqual(
      independentView.positions,
    );
    expect((await (await targetClient.get(`${path}/map/history`)).json()).history).toEqual(
      historicHistory,
    );
    await destination.restart();
    await page.reload();
    expect((await (await targetClient.get(`${path}/map`)).json()).draft).toEqual(independent.draft);
    expect((await (await targetClient.get(`${path}/map/history`)).json()).history).toEqual(
      historicHistory,
    );
    expect(writes).toBe(1);
  } finally {
    await sourceContext.close();
    await targetContext.close();
    await source.close();
    await destination.close();
  }
});
