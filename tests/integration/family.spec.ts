import { expect, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

test('KARTA-07: family objects and directed relationships save together and keep their identities', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async () => (await page.request.get(path)).json();
    const post = async (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    let state = await read();
    for (const [id, type, name] of [
      ['service', 'Tjänst', 'Molnmusik'],
      ['account', 'Tjänstekonto', 'Familjens konto'],
      ['subscription', 'Abonnemang', 'Familjemusik'],
      ['person', 'Person', 'Lo'],
      ['email', 'E-postadress', 'familj@example.test'],
      ['card', 'Kort', 'Familjekort'],
      ['bank', 'Bankkonto', 'Hushållskonto'],
      ['company', 'Företag', 'Moln AB'],
    ]) {
      const response = await post('draft', {
        version: state.draft.version,
        id,
        baseRevision: null,
        value: {
          typeId: state.types.find((item: { name: string }) => item.name === type).id,
          name,
          description: '',
        },
      });
      expect(response.status()).toBe(200);
      state = await read();
    }
    const typeId = state.relationshipTypes.find(
      (item: { name: string }) => item.name === 'Gäller tjänstekontot',
    ).id;
    const value = { typeId, sourceId: 'subscription', targetId: 'account', knowledge: 'known' };
    let response = await post('relationship', {
      version: state.draft.version,
      id: 'subscription-account',
      baseRevision: null,
      value,
    });
    expect(response.status()).toBe(200);
    state = await read();
    expect(state.objects).toEqual([]);
    expect(state.relationships).toEqual([]);
    expect(state.draft.relationships).toHaveLength(1);
    response = await post('relationship', {
      version: state.draft.version,
      id: 'duplicate',
      baseRevision: null,
      value,
    });
    expect(response.status()).toBe(200);
    state = await read();
    expect(state.draft.relationships).toHaveLength(1);
    response = await post('save', { version: state.draft.version, operationId: 'family-save' });
    expect(response.status()).toBe(200);
    const { receipt } = await response.json();
    expect(receipt.changes).toHaveLength(8);
    expect(receipt.relationships[0].after).toMatchObject({ id: 'subscription-account', ...value });
    await installation.restart();
    state = await read();
    expect(state.objects).toHaveLength(8);
    expect(state.relationships).toEqual([receipt.relationships[0].after]);
    const history = await (await page.request.get(`${path}/history`)).json();
    expect(history.history[0]).toEqual(receipt);
  } finally {
    await installation.close();
  }
});

test('KARTA-05: manual forms preserve incomplete meanings and block an unanswered identity question', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    for (const [name, type, identity] of [
      ['Familjemusik', 'Abonnemang', 'identified'],
      ['Betalkonto', 'Bankkonto', 'unspecified'],
    ]) {
      await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
      await page.getByLabel('Objektets namn').fill(name);
      await page.getByLabel('Objekttyp', { exact: true }).selectOption({ label: type });
      await page.getByLabel('Objektets identitet').selectOption(identity);
      await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await page.getByLabel('Från objekt').selectOption({ label: 'Familjemusik (Abonnemang)' });
    await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Betalas med' });
    await page.getByLabel('Uppgiftens säkerhet', { exact: true }).selectOption('unresolved');
    await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
    await page.reload();
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Obesvarad identitetsfråga',
    );
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await page
      .getByRole('list', { name: 'Samband', exact: true })
      .getByRole('button', { name: /Familjemusik → Betalas med → Obesvarad/ })
      .click();
    await page.getByRole('button', { name: 'Redigera valt samband', exact: true }).click();
    await page.getByLabel('Uppgiftens säkerhet', { exact: true }).selectOption('uncertain');
    await page.getByLabel('Till objekt').selectOption({ label: 'Betalkonto (Bankkonto)' });
    await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await page.reload();
    await expect(page.getByRole('list', { name: 'Samband', exact: true })).toContainText(
      'Osäkert uppgivet',
    );
    await page.getByRole('button', { name: 'Betalkonto', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Objektets identitet')).toHaveValue('unspecified');
    await page.getByRole('button', { name: 'Stäng utan att skicka texten' }).click();
    for (const knowledge of ['unknown', 'none']) {
      await page
        .getByRole('list', { name: 'Samband', exact: true })
        .getByRole('button', { name: /Familjemusik → Betalas med/ })
        .click();
      await page.getByRole('button', { name: 'Redigera valt samband', exact: true }).click();
      await page.getByLabel('Uppgiftens säkerhet', { exact: true }).selectOption(knowledge);
      await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
      await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
      await expect(page.getByRole('status')).toContainText('Sparat');
      await page.reload();
      await expect(page.getByRole('list', { name: 'Samband', exact: true })).toContainText(
        knowledge === 'unknown' ? 'Okänt' : 'Uttryckligen inget',
      );
    }
  } finally {
    await installation.close();
  }
});

test('UTKAST-01: demo seed resumes a conflict and preserves independent proposals without granting access to map people', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    installation.seedDemo();
    await signIn(page.request, installation.origin);
    await page.goto(installation.origin);
    await expect(page.getByRole('list', { name: 'Objekt', exact: true })).toContainText(
      'Familjens Molnmusik',
    );
    await expect(page.getByRole('list', { name: 'Samband', exact: true })).toContainText(
      'Kortfakturan betalas från',
    );
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Lo Exempel');
    await expect(review).toContainText('Lo Lind');
    await expect(review).toContainText('Lo Berg');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await installation.restart();
    await page.reload();
    await expect(review).toContainText('Lo Berg');
    await review.getByRole('button', { name: 'Behåll mitt förslag' }).click();
    await expect(page.getByRole('status')).toContainText('Granska hela utkastet');
    await expect(review).toContainText('Spelar piano i musikföreningen.');
    await expect(review).toContainText('familjen@example.test');
    await expect(review).toContainText('musik@example.test');
    await page.getByRole('button', { name: 'Familjens musikkonto', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Familjens rättade konto');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    const relationshipReview = review
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: 'Samband', exact: true }) });
    await expect(relationshipReview).toContainText(
      'Familjens musikkonto → Inloggningsadress → familjen@example.test',
    );
    await expect(relationshipReview).toContainText(
      'Familjens rättade konto → Inloggningsadress → musik@example.test',
    );

    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await page.reload();
    await expect(review).toContainText('Inga förslag');
    await expect(page.getByRole('list', { name: 'Samband', exact: true })).toContainText(
      'Familjens rättade konto → Inloggningsadress → musik@example.test',
    );
  } finally {
    await installation.close();
  }
});

test('a concurrent duplicate refreshes the existing relationship instead of failing', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await browser.newContext();
  try {
    const household = installation.seedDemo();
    await signIn(page.request, installation.origin);
    const path = `${installation.origin}/api/households/${household.id}/map`;
    let state = await (await page.request.get(path)).json();
    await page.request.post(`${path}/discard`, {
      headers: { origin: installation.origin },
      data: { version: state.draft.version },
    });
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await page.getByLabel('Från objekt').selectOption({ label: 'Kim Exempel (Person)' });
    await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Använder' });
    await page.getByLabel('Till objekt').selectOption({ label: 'Molnmusik (Tjänst)' });
    installation.setIdentity({
      subject: 'second-user',
      name: 'Robin',
      email: 'robin@example.test',
    });
    await signIn(other.request, installation.origin);
    const { user } = await (await other.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { code } = await (
      await page.request.post(`${installation.origin}/api/households/${household.id}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    await other.request.post(`${installation.origin}/api/invitations/accept`, {
      headers: { origin: installation.origin },
      data: { code },
    });
    state = await (await other.request.get(path)).json();
    const draft = await (
      await other.request.post(`${path}/relationship`, {
        headers: { origin: installation.origin },
        data: {
          version: state.draft.version,
          id: 'concurrent-edge',
          baseRevision: null,
          value: {
            typeId: state.relationshipTypes.find(
              (value: { name: string }) => value.name === 'Använder',
            ).id,
            sourceId: state.objects.find((value: { name: string }) => value.name === 'Kim Exempel')
              .id,
            targetId: state.objects.find((value: { name: string }) => value.name === 'Molnmusik')
              .id,
            knowledge: 'known',
          },
        },
      })
    ).json();
    await other.request.post(`${path}/save`, {
      headers: { origin: installation.origin },
      data: { version: draft.version, operationId: 'concurrent-save' },
    });
    await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Sambandet finns redan: Kim Exempel → Använder → Molnmusik',
    );
    await expect(
      page.getByRole('button', { name: 'Kim Exempel → Använder → Molnmusik', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    await other.close();
    await installation.close();
  }
});
