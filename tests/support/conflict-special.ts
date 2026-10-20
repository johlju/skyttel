import { type APIRequestContext, expect, type Page } from '@playwright/test';
import { openDraftReview } from './client.js';
import { conflictCollaborators } from './conflict-properties.js';

export async function saveReviewedConflictDraft(page: Page) {
  const conflict = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
  if (await conflict.isVisible()) await page.keyboard.press('Escape');
  const draft = await openDraftReview(page);
  const [saved] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/map/save') &&
        response.status() === 200,
    ),
    draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click(),
  ]);
  await expect(page.getByRole('dialog', { name: 'Spara utkastet', exact: true })).not.toBeVisible();
  await expect(page.getByRole('status', { name: 'Sparbekräftelse', exact: true })).toHaveText(
    'Utkastet är sparat',
  );
  return saved;
}

export async function prepareRemovedObjectConflict(
  first: APIRequestContext,
  second: APIRequestContext,
) {
  const app = await conflictCollaborators(first, second);
  const original = (await app.read()).objects.find((object) => object.id === 'lo');
  if (!original) throw new Error('Missing fixture object');
  await app.propose(first, 'draft', 'lo', {
    ...original,
    name: 'Lo Lind',
    properties: [
      { id: 'description', label: 'Beskrivning', kind: 'text' as const, value: 'Mitt förslag' },
    ],
  });
  await app.propose(first, 'draft', 'independent', {
    typeId: original.typeId,
    name: 'Oberoende förslag',
  });
  await app.propose(second, 'draft', 'lo', null);
  expect((await app.save(second, 'removed-object')).status()).toBe(200);
  return app;
}

export async function prepareRelationshipSpecialConflict(
  first: APIRequestContext,
  second: APIRequestContext,
  kind: 'removed' | 'duplicate' | 'missing-endpoint' | 'edited-missing-endpoint',
) {
  const app = await conflictCollaborators(first, second);
  const state = await app.read();
  const value = { typeId: state.relationshipTypes[0].id, sourceId: 'lo', targetId: 'service' };
  if (kind === 'removed' || kind === 'edited-missing-endpoint') {
    await app.propose(first, 'relationship', 'mine', value);
    expect((await app.save(first, 'initial-edge')).status()).toBe(200);
  }
  await app.propose(first, 'relationship', 'mine', {
    ...value,
    properties: [
      {
        id: 'certainty',
        label: 'Uppgiftens säkerhet',
        kind: 'text' as const,
        value: 'Osäkert uppgivet',
      },
    ],
  });
  await app.propose(first, 'draft', 'independent', {
    typeId: state.types[0].id,
    name: 'Oberoende förslag',
  });
  if (kind === 'removed') await app.propose(second, 'relationship', 'mine', null);
  else if (kind === 'duplicate') await app.propose(second, 'relationship', 'theirs', value);
  else await app.propose(second, 'draft', 'service', null);
  expect((await app.save(second, `special-${kind}`)).status()).toBe(200);
  return app;
}

export async function prepareOwnRemovalConflict(
  first: APIRequestContext,
  second: APIRequestContext,
  scenario: 'facts' | 'connections' | 'facts-and-connections' = 'facts',
) {
  const app = await conflictCollaborators(first, second);
  const initial = await app.read();
  const original = initial.objects.find((object) => object.id === 'lo');
  if (!original) throw new Error('Missing fixture object');
  await app.propose(first, 'draft', 'lo', null);
  await app.propose(first, 'draft', 'independent', {
    typeId: original.typeId,
    name: 'Oberoende förslag',
  });
  if (scenario !== 'facts')
    await app.propose(second, 'relationship', 'new-edge', {
      typeId: initial.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',
    });
  if (scenario !== 'connections')
    await app.propose(second, 'draft', 'lo', {
      ...original,
      name: 'Lo Berg',
      properties: [
        {
          id: 'description',
          label: 'Beskrivning',
          kind: 'text' as const,
          value: 'Nya sparade fakta',
        },
      ],
    });
  expect((await app.save(second, 'after-proposed-removal')).status()).toBe(200);
  return app;
}
