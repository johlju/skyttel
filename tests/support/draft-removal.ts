import { type APIRequestContext, type Browser, expect, type Page } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { closeTextView, openDraftReview, openNewObject, signIn } from './client.js';
import { openObjectRelationships, openTypeDefinitions } from './domain-work.js';
import { prepareDraftReview } from './draft-review.js';
import { alex, type createInstallation, robin } from './installation.js';
import { setProperty } from './property-controls.js';
import { stageRelationshipAndClose } from './relationship-dialog.js';
import { readRemovalProposals } from './removal-reading.js';
import { createPreparedContext } from './test.js';

/** A distinct admitted member keeps meaningful native work throughout recovery. */
export async function prepareRemovalMember(
  browser: Browser,
  administrator: APIRequestContext,
  installation: Awaited<ReturnType<typeof createInstallation>>,
  householdId: string,
) {
  const { origin } = installation;
  const context = await createPreparedContext(browser);
  try {
    installation.setIdentity(robin);
    try {
      await signIn(context.request, origin, 'microsoft');
    } finally {
      installation.setIdentity(alex);
    }
    const { user } = await (await context.request.get(`${origin}/api/bootstrap`)).json();
    const { user: admin } = await (await administrator.get(`${origin}/api/bootstrap`)).json();
    expect(user.id).not.toBe(admin.id);
    const invitation = await administrator.post(
      `${origin}/api/households/${householdId}/invitations`,
      { headers: { origin }, data: { userId: user.id } },
    );
    expect(invitation.status()).toBe(201);
    const { code } = await invitation.json();
    const accepted = await context.request.post(`${origin}/api/invitations/accept`, {
      headers: { origin },
      data: { code },
    });
    expect(accepted.status()).toBe(200);
    const path = `${origin}/api/households/${householdId}/map`;
    const read = async (): Promise<MapState> => (await context.request.get(path)).json();
    const initial = await read();
    expect(initial.draft.changes).toEqual([]);
    const page = await context.newPage();
    await page.goto(`${origin}/households/${householdId}`);
    const form = await openNewObject(page);
    await form.getByLabel('Namn', { exact: true }).fill('Robins privata anteckning');
    await form.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Person' });
    await setProperty(
      form,
      'Beskrivning',
      'Hela Robins oberoende arbete före och efter borttagningen',
    );
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const before = await read();
    expect(before.draft.changes).toHaveLength(1);
    expect(before.draft.changes[0].after).toEqual({
      name: 'Robins privata anteckning',
      typeId: initial.types.find(({ name }) => name === 'Person')?.id,
      properties: [
        {
          id: expect.any(String),
          label: 'Beskrivning',
          kind: 'text' as const,
          value: 'Hela Robins oberoende arbete före och efter borttagningen',
        },
      ],
    });
    const assertUnchanged = async () => {
      expect(await read()).toEqual(before);
      await page.reload();
      await openDraftReview(page);
      await readRemovalProposals(page, before);
      expect(await read()).toEqual(before);
    };
    const assertPrivate = async (alex: Page, state: MapState) => {
      for (const secret of [
        before.draft.changes[0].id,
        ...(before.draft.changes[0].after?.properties ?? []).map(({ id }) => id),
        'Robins privata anteckning',
        'Hela Robins oberoende arbete före och efter borttagningen',
      ])
        expect(JSON.stringify(state)).not.toContain(secret);
      await expect(alex.locator('body')).not.toContainText('Robins privata anteckning');
      await expect(alex.locator('body')).not.toContainText(
        'Hela Robins oberoende arbete före och efter borttagningen',
      );
    };
    await assertUnchanged();
    return { context, page, read, before, assertUnchanged, assertPrivate };
  } catch (failure) {
    await context.close();
    throw failure;
  }
}

/** Ordinary Settings and entity forms create the two distinct collection cases. */
export async function stageNewRemovalType(page: Page, kind: 'objectType' | 'relationshipType') {
  await openTypeDefinitions(page);
  const definitionReply = page.waitForResponse(
    (reply) =>
      reply.request().method() === 'POST' &&
      reply.url().endsWith(kind === 'objectType' ? '/map/object-type' : '/map/relationship-type'),
  );
  await page
    .getByRole('button', {
      name: kind === 'objectType' ? 'Ny objekttyp' : 'Ny sambandstyp',
      exact: true,
    })
    .click();
  await page
    .getByLabel(kind === 'objectType' ? 'Typens namn' : 'Sambandstypens namn', { exact: true })
    .fill('Tillfällig typ');
  await page
    .getByLabel(kind === 'objectType' ? 'Typens beskrivning' : 'Sambandstypens beskrivning', {
      exact: true,
    })
    .fill('Hela den tillfälliga typens betydelse');
  if (kind === 'relationshipType') {
    await page.getByLabel('Benämning från startobjektet', { exact: true }).fill('granskar');
    await page.getByLabel('Benämning från målobjektet', { exact: true }).fill('granskas av');
  }
  await page
    .getByRole('button', {
      name:
        kind === 'objectType'
          ? 'Lägg typförslaget i mitt utkast'
          : 'Lägg sambandstypen i mitt utkast',
      exact: true,
    })
    .click();
  expect((await definitionReply).status()).toBe(200);
  await expect(
    page.getByRole('status', { name: 'Hushållsarbetets status', exact: true }),
  ).toContainText('Förslaget finns i ditt privata utkast');
  await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
  const proposalReply = page.waitForResponse(
    (reply) =>
      reply.request().method() === 'POST' &&
      reply.url().endsWith(kind === 'objectType' ? '/map/object-form' : '/map/relationship-form'),
  );
  if (kind === 'objectType') {
    const form = await openNewObject(page);
    await form.getByLabel('Namn', { exact: true }).fill('Tillfälligt föremål');
    await form.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Tillfällig typ' });
    await setProperty(form, 'Beskrivning', 'Hela den tillfälliga berättelsen');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
  } else {
    const form = await openObjectRelationships(page, 'Alex blå cykel');
    await form.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await form.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Tillfällig typ' });
    await setProperty(form, 'Uppgiftens säkerhet', 'Okänt');
    await form.getByLabel('Till objekt', { exact: true }).selectOption('draft-bike');
    await stageRelationshipAndClose(page);
  }
  expect((await proposalReply).status()).toBe(200);
  // A Settings visit may have preserved the already-open text view.
  if (await page.getByRole('button', { name: 'Stäng textvyn', exact: true }).isVisible())
    await closeTextView(page);
}

export async function prepareDraftRemovalFocus(client: APIRequestContext, origin: string) {
  const fixture = await prepareDraftReview(client, origin);
  const state = await fixture.read();
  await fixture.post('discard', {});
  const bike = state.draft.changes.find(({ id }) => id === 'draft-bike');
  const edge = state.draft.relationships?.find(({ id }) => id === 'draft-edge-unknown');
  if (!bike?.after || !edge?.after) throw new Error('Missing two focus proposals');
  await fixture.post('draft', {
    id: bike.id,
    baseRevision: bike.before?.revision ?? null,
    value: bike.after,
  });
  await fixture.post('relationship', { id: edge.id, baseRevision: null, value: edge.after });
  return fixture;
}

/** Free facts remain intact when discarding a changed type requires fresh review. */
export async function prepareDraftRemovalMeaning(
  client: APIRequestContext,
  origin: string,
  kind: 'objectType' | 'relationshipType',
) {
  const fixture = await prepareDraftReview(client, origin);
  const state = await fixture.read();
  const type = (kind === 'objectType' ? state.types : state.relationshipTypes).find(
    ({ id }) => id === (kind === 'objectType' ? 'draft-vehicle' : 'draft-uses'),
  );
  if (!type) throw new Error('Missing saved removal type');
  const definition = (
    kind === 'objectType' ? state.draft.objectTypes : state.draft.relationshipTypes
  )?.find(({ id }) => id === type.id)?.after;
  if (!definition) throw new Error('Missing changed type proposal');
  const proposal =
    kind === 'objectType'
      ? state.draft.changes.find(({ id }) => id === 'draft-bike')
      : state.draft.relationships?.find(({ id }) => id === 'draft-edge-unknown');
  if (!proposal?.after) throw new Error('Missing dependent proposal');
  await fixture.post(kind === 'objectType' ? 'draft' : 'relationship', {
    id: proposal.id,
    baseRevision: proposal.before?.revision ?? null,
    value: {
      ...proposal.after,
      properties: [
        ...(proposal.after.properties ?? []).filter(
          (property) => !['new-field'].includes(property.id),
        ),
        {
          id: 'new-field',
          label: 'Ny uppgift',
          kind: 'text' as const,
          value: 'Behåll hela mitt värde',
        },
      ],
    },
  });
  return { ...fixture, type, proposalId: proposal.id };
}
