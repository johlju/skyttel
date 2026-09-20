import { type APIRequestContext, expect, test } from '@playwright/test';
import type { MapState, ObjectValue, RelationshipValue } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { alex, createInstallation, robin } from '../support/installation.js';

test('a conflict choice preserves independent proposals and requires a new save', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const { installation, path, read, propose, save } = await collaborators(
    page.request,
    other.request,
    [['lo', 'Lo Exempel']],
  );
  try {
    await propose(page.request, 'draft', 'alex', {
      typeId: (await read()).types[0].id,
      name: 'Alex Exempel',
      description: '',
    });
    await propose(page.request, 'draft', 'lo', {
      typeId: (await read()).types[0].id,
      name: 'Lo Lind',
      description: '',
    });
    await page.goto(installation.origin);
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeEnabled();
    await propose(other.request, 'draft', 'lo', {
      typeId: (await read()).types[0].id,
      name: 'Lo Berg',
      description: '',
    });
    expect((await save(other.request, 'other')).status()).toBe(200);
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('alert')).toContainText('Inget sparades');
    expect((await read()).objects.map((object) => object.name)).toEqual(['Lo Berg']);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toHaveLength(2);
    await page.getByRole('button', { name: 'Hämta aktuellt underlag' }).click();
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Lo Exempel');
    await expect(review).toContainText('Lo Berg');
    await expect(review).toContainText('Lo Lind');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await review.getByRole('button', { name: 'Behåll mitt förslag' }).click();
    await expect(review).toContainText('Alex Exempel');
    await expect(page.getByRole('status')).toContainText('Granska hela utkastet');
    expect((await read()).objects[0].name).toBe('Lo Berg');
    await installation.restart();
    await page.reload();
    await expect(review).toContainText('Lo Lind');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat:');
    expect((await read(other.request)).objects.map((object) => object.name)).toEqual([
      'Alex Exempel',
      'Lo Lind',
    ]);
  } finally {
    await other.close();
    await installation.close();
  }
});

async function collaborators(
  first: APIRequestContext,
  second: APIRequestContext,
  seeds = [
    ['lo', 'Lo Exempel'],
    ['service', 'Molnmusik'],
  ],
) {
  const installation = await createInstallation();
  await signIn(first, installation.origin);
  const { household } = await (await createHousehold(first, installation.origin)).json();
  const path = `${installation.origin}/api/households/${household.id}/map`;
  const post = (client: APIRequestContext, route: string, data: unknown) =>
    client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
  const read = async (client = first): Promise<MapState> => (await client.get(path)).json();
  async function propose(
    client: APIRequestContext,
    kind: 'draft' | 'relationship',
    id: string,
    value: ObjectValue | RelationshipValue | null,
  ) {
    const state = await read(client);
    const previous = (kind === 'draft' ? state.objects : state.relationships).find(
      (item) => item.id === id,
    );
    expect(
      (
        await post(client, kind, {
          version: state.draft.version,
          id,
          baseRevision: previous?.revision ?? null,
          value,
        })
      ).status(),
    ).toBe(200);
  }
  const save = async (client: APIRequestContext, operationId: string) =>
    post(client, 'save', { version: (await read(client)).draft.version, operationId });
  installation.setIdentity(robin);
  await signIn(second, installation.origin);
  const { user } = await (await second.get(`${installation.origin}/api/bootstrap`)).json();
  const { code } = await (
    await first.post(`${installation.origin}/api/households/${household.id}/invitations`, {
      headers: { origin: installation.origin },
      data: { userId: user.id },
    })
  ).json();
  expect(
    (
      await second.post(`${installation.origin}/api/invitations/accept`, {
        headers: { origin: installation.origin },
        data: { code },
      })
    ).status(),
  ).toBe(200);
  const state = await read();
  for (const [id, name] of seeds) {
    await propose(first, 'draft', id, { typeId: state.types[0].id, name, description: '' });
  }
  expect((await save(first, 'initial')).status()).toBe(200);
  return { installation, path, post, read, propose, save, userId: user.id };
}

test('deleting an object requires reviewing newly saved relationships', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const state = await app.read();
    await app.propose(page.request, 'draft', 'lo', null);
    await page.goto(app.installation.origin);
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeEnabled();
    await app.propose(other.request, 'relationship', 'new-edge', {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',
      knowledge: 'uncertain',
    });
    expect((await app.save(other.request, 'new-edge')).status()).toBe(200);
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('alert')).toContainText('Inget sparades');
    await page.getByRole('button', { name: 'Hämta aktuellt underlag' }).click();
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Lo Exempel → Använder → Molnmusik (Osäkert uppgivet)');
    await review.getByRole('button', { name: 'Behåll mitt förslag' }).click();
    await expect(review).toContainText('Borttagning av samband');
    expect((await app.read()).relationships).toHaveLength(1);
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat:');
    const saved = await app.read(other.request);
    expect(saved.relationships).toEqual([]);
    expect(saved.objects.map((object) => object.name)).toEqual(['Molnmusik']);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('overlapping relationship proposals show meanings and can accept the saved value', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const state = await app.read();
    const value: RelationshipValue = {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',
      knowledge: 'known',
    };
    await app.propose(page.request, 'relationship', 'edge', value);
    expect((await app.save(page.request, 'edge')).status()).toBe(200);
    await app.propose(page.request, 'relationship', 'edge', { ...value, knowledge: 'uncertain' });
    await app.propose(other.request, 'relationship', 'edge', {
      ...value,
      targetId: null,
      knowledge: 'none',
    });
    expect((await app.save(other.request, 'other-edge')).status()).toBe(200);
    await page.goto(app.installation.origin);
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Osäkert uppgivet');
    await expect(review).toContainText('Uttryckligen inget');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await review.getByRole('button', { name: 'Använd sparat värde' }).click();
    await expect(review).toContainText('Inga förslag');
    expect((await app.read()).relationships[0].knowledge).toBe('none');
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('a saved duplicate can be selected without losing another proposal', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const state = await app.read();
    const value: RelationshipValue = {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',
      knowledge: 'known',
    };
    await app.propose(page.request, 'relationship', 'my-edge', value);
    await app.propose(page.request, 'draft', 'independent', {
      typeId: state.types[0].id,
      name: 'Kim Exempel',
      description: '',
    });
    await app.propose(other.request, 'relationship', 'other-edge', value);
    expect((await app.save(other.request, 'other-edge')).status()).toBe(200);
    expect((await app.save(page.request, 'blocked-duplicate')).status()).toBe(409);
    await page.goto(app.installation.origin);
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Samma samband finns redan');
    await review.getByRole('button', { name: 'Använd sparat värde' }).click();
    await expect(review).not.toContainText('Konflikt');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat: Kim Exempel');
    const saved = await app.read();
    expect(saved.relationships.map((edge) => edge.id)).toEqual(['other-edge']);
    expect(saved.objects.map((object) => object.name)).toContain('Kim Exempel');
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('a deleted relationship endpoint has an explicit recovery choice', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const state = await app.read();
    await app.propose(page.request, 'relationship', 'pending-edge', {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',
      knowledge: 'uncertain',
    });
    await app.propose(other.request, 'draft', 'service', null);
    expect((await app.save(other.request, 'delete-service')).status()).toBe(200);
    expect((await app.save(page.request, 'blocked-endpoint')).status()).toBe(409);
    await page.goto(app.installation.origin);
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Sambandet hänvisar till ett borttaget objekt');
    await app.installation.restart();
    await page.reload();
    await expect(review).toContainText('Lo Exempel → Använder → Molnmusik (Osäkert uppgivet)');
    await expect(review.getByRole('button', { name: 'Behåll mitt förslag' })).toHaveCount(0);
    await review.getByRole('button', { name: 'Använd sparat värde' }).click();
    await expect(review).toContainText('Inga förslag');
    expect((await app.read()).relationships).toEqual([]);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('HTTP clients reject stale conflict choices and enforce private drafts and revoked membership', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const sameUser = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    let state = await app.read();
    const value = { typeId: state.types[0].id, name: 'Lo Lind', description: '' };
    await app.propose(page.request, 'draft', 'lo', value);
    expect((await app.read(other.request)).draft.changes).toEqual([]);
    app.installation.setIdentity(alex);
    await signIn(sameUser.request, app.installation.origin);
    expect((await app.read(sameUser.request)).draft).toEqual((await app.read()).draft);
    await app.propose(other.request, 'draft', 'lo', { ...value, name: 'Lo Berg' });
    expect((await app.save(other.request, 'first-conflict')).status()).toBe(200);
    state = await app.read();
    const resolution = {
      version: state.draft.version,
      conflict: {
        kind: 'object',
        id: 'lo',
        current: state.objects.find((object) => object.id === 'lo'),
      },
      choice: 'proposed',
    };
    await app.propose(other.request, 'draft', 'lo', { ...value, name: 'Lo Ek' });
    expect((await app.save(other.request, 'second-conflict')).status()).toBe(200);
    expect((await app.post(page.request, 'resolve', resolution)).status()).toBe(409);
    expect((await app.read()).draft).toEqual(state.draft);
    state = await app.read();
    const currentResolution = {
      ...resolution,
      conflict: {
        ...resolution.conflict,
        current: state.objects.find((object) => object.id === 'lo'),
      },
    };
    expect(
      (
        await app.post(page.request, 'resolve', { ...currentResolution, choice: 'anything' })
      ).status(),
    ).toBe(400);
    expect((await app.post(sameUser.request, 'resolve', currentResolution)).status()).toBe(200);
    const resolved = (await app.read()).draft;
    for (const [route, body] of [
      ['resolve', currentResolution],
      ['discard', { version: state.draft.version }],
      ['draft', { version: state.draft.version, id: 'lo', baseRevision: 1, value }],
      ['save', { version: state.draft.version, operationId: 'old-approval' }],
    ] as const) {
      expect((await app.post(page.request, route, body)).status()).toBe(409);
      expect((await app.read()).draft).toEqual(resolved);
    }
    const { user: owner } = await (
      await page.request.get(`${app.installation.origin}/api/bootstrap`)
    ).json();
    const privateRead = await (await other.request.get(`${app.path}?userId=${owner.id}`)).json();
    expect(privateRead.draft.changes).toEqual([]);
    expect(
      (
        await app.post(other.request, 'resolve', { ...currentResolution, userId: owner.id })
      ).status(),
    ).toBe(409);
    expect((await app.read()).draft).toEqual(resolved);
    expect((await app.save(page.request, 'fresh-approval')).status()).toBe(200);
    await app.propose(other.request, 'draft', 'lo', { ...value, name: 'Robin privat' });
    expect(
      (
        await page.request.post(`${app.path.replace('/map', '')}/members/${app.userId}/revoke`, {
          headers: { origin: app.installation.origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    for (const route of ['draft', 'relationship', 'resolve', 'save', 'discard'])
      expect(
        (
          await app.post(other.request, route, { ...currentResolution, operationId: 'revoked' })
        ).status(),
      ).toBe(403);
    expect((await other.request.get(app.path)).status()).toBe(403);
    expect((await other.request.get(`${app.path}/history`)).status()).toBe(403);
  } finally {
    await sameUser.close();
    await other.close();
    await app.installation.close();
  }
});

test('resolving an object preserves fields changed only by the other user', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const state = await app.read();
    const value = { typeId: state.types[0].id, name: 'Lo Lind', description: '' };
    await app.propose(page.request, 'draft', 'lo', value);
    await app.propose(other.request, 'draft', 'lo', {
      ...value,
      name: 'Lo Exempel',
      description: 'Spelar piano',
    });
    expect((await app.save(other.request, 'description')).status()).toBe(200);
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: 'Behåll mitt förslag' }).click();
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Lo Lind');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat:');
    expect((await app.read()).objects.find((object) => object.id === 'lo')).toMatchObject({
      name: 'Lo Lind',
      description: 'Spelar piano',
    });
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('independent users save unrelated objects without a meaningless conflict', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const state = await app.read();
    await app.propose(page.request, 'draft', 'lo', {
      typeId: state.types[0].id,
      name: 'Lo Lind',
      description: '',
    });
    await app.propose(other.request, 'draft', 'service', {
      typeId: state.types[0].id,
      name: 'Ny musiktjänst',
      description: '',
    });
    expect((await app.save(other.request, 'service-change')).status()).toBe(200);
    expect((await app.save(page.request, 'person-change')).status()).toBe(200);
    await app.installation.restart();
    for (const client of [page.request, other.request])
      expect((await app.read(client)).objects.map((object) => object.name)).toEqual([
        'Lo Lind',
        'Ny musiktjänst',
      ]);
  } finally {
    await other.close();
    await app.installation.close();
  }
});
