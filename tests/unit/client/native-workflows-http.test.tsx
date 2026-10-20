import { type APIRequestContext, request } from '@playwright/test';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import { authenticatedHttpFetch } from '../../support/authenticated-http-fetch.js';
import { createHousehold, signIn } from '../../support/client.js';
import { prepareArchiveConflict } from '../../support/conflict-archive.js';
import { prepareConflictContinuity } from '../../support/conflict-continuity.js';
import { conflictCollaborators } from '../../support/conflict-properties.js';
import {
  prepareOwnRemovalConflict,
  prepareRelationshipSpecialConflict,
  prepareRemovedObjectConflict,
} from '../../support/conflict-special.js';
import { prepareDraftReview } from '../../support/draft-review.js';
import { createInstallation } from '../../support/installation.js';
import {
  openConflictReview,
  openDraftReview,
  openNewObjectForm,
  openObjectRelationships,
  readDraftProposal,
  renderHouseholdWork,
  saveHouseholdDraft,
} from '../../support/native-household-unit.js';
import { propertyInput } from './property-controls.js';

// Actual network fixtures need scheduling time in a full suite; individual
// observation waits and application performance gates remain unchanged.
describe('native household workflows through real HTTP', { timeout: 30_000 }, () => {
  let installation: Awaited<ReturnType<typeof createInstallation>>;
  let client: APIRequestContext;
  let householdId: string;
  let path: string;
  const otherClients: APIRequestContext[] = [];
  const read = async (): Promise<MapState> => (await client.get(path)).json();

  beforeEach(async () => {
    installation = await createInstallation();
    client = await request.newContext();
    await signIn(client, installation.origin);
    vi.stubGlobal('fetch', authenticatedHttpFetch(client, installation.origin));
  });
  afterEach(async () => {
    cleanup();
    vi.unstubAllGlobals();
    await Promise.all(otherClients.splice(0).map((other) => other.dispose()));
    await client?.dispose();
    await installation?.close();
  });

  test('complete native objects and a relationship remain private until their single atomic save', async () => {
    const { household } = await (await createHousehold(client, installation.origin)).json();
    householdId = household.id;
    path = `${installation.origin}/api/households/${householdId}/map`;
    const before = await read();
    renderHouseholdWork(householdId);
    for (const [name, description] of [
      ['Alex', 'Personen som använder cykeln'],
      ['Blå cykeln', 'Cykeln står i garaget'],
    ]) {
      const form = await openNewObjectForm();
      await userEvent.type(form.getByLabelText('Namn'), name);
      await userEvent.type(await propertyInput(form, 'Beskrivning'), description);
      await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nytt objekt' })).toBeNull());
    }
    const proposed = await read();
    expect(proposed.objects).toEqual(before.objects);
    expect(proposed.draft.changes).toHaveLength(2);
    const relationships = await openObjectRelationships('Alex');
    await userEvent.click(relationships.getByRole('button', { name: 'Nytt samband' }));
    const type = proposed.relationshipTypes.find((definition) => definition.name === 'Använder');
    const bicycle = proposed.draft.changes.find((change) => change.after?.name === 'Blå cykeln');
    if (!type || !bicycle)
      throw new Error('The actual household definitions and objects are required');
    await userEvent.selectOptions(relationships.getByLabelText('Sambandstyp'), type.id);
    await userEvent.selectOptions(relationships.getByLabelText('Till objekt'), bicycle.id);
    await userEvent.click(relationships.getByRole('button', { name: 'Lägg i utkastet' }));
    await waitFor(async () => expect((await read()).draft.relationships).toHaveLength(1));
    await userEvent.click(relationships.getByRole('button', { name: 'Stäng samband' }));
    const details = await readDraftProposal('Blå cykeln');
    expect(details.getByText('Cykeln står i garaget (Text)')).toBeTruthy();
    await userEvent.click(details.getByRole('button', { name: 'Stäng dialogen' }));
    expect((await read()).relationships).toEqual(before.relationships);
    await openDraftReview();
    await saveHouseholdDraft();
    const saved = await read();
    expect(saved.draft.changes).toEqual([]);
    expect(saved.draft.relationships ?? []).toEqual([]);
    expect(saved.objects.map((object) => object.name).sort()).toEqual(['Alex', 'Blå cykeln']);
    expect(saved.relationships).toHaveLength(1);
    expect(saved.relationships[0]).toMatchObject({ typeId: type.id, targetId: bicycle.id });
    const history = await (await client.get(`${path}/history`)).json();
    expect(history.history).toHaveLength(1);
    expect(history.history[0].changes).toHaveLength(2);
    expect(history.history[0].relationships).toHaveLength(1);
  });

  async function reviewFixture() {
    const fixture = await prepareDraftReview(client, installation.origin);
    householdId = fixture.household.id;
    path = fixture.path;
    renderHouseholdWork(householdId);
    return { ...fixture, draft: await openDraftReview() };
  }

  test('dependent removal cancels unchanged, rejects a stale plan and preserves newer independent proposals after review', async () => {
    const fixture = await reviewFixture();
    const before = await read();
    const history = await (await client.get(`${path}/history`)).json();
    const remove = fixture.draft.getByRole('button', {
      name: 'Ta bort förslaget: Ospecificerat fordon',
    });
    await userEvent.click(remove);
    let dialog = within(
      await screen.findByRole('dialog', { name: 'Ta bort förslaget och dess beroenden?' }),
    );
    expect(dialog.getAllByRole('listitem')).toHaveLength(4);
    await userEvent.click(dialog.getByRole('button', { name: 'Avbryt' }));
    expect(await read()).toEqual(before);
    await userEvent.click(remove);
    dialog = within(
      await screen.findByRole('dialog', { name: 'Ta bort förslaget och dess beroenden?' }),
    );
    await fixture.post('object-type', {
      id: 'newer-independent-type',
      baseRevision: null,
      value: { name: 'Nyare oberoende typ', description: '' },
    });
    const newer = await read();
    await userEvent.click(dialog.getByRole('button', { name: 'Ta bort' }));
    await waitFor(() =>
      expect(dialog.getByRole('alert').textContent).toContain('Borttagningen kunde inte bekräftas'),
    );
    expect(await read()).toEqual(newer);
    expect((dialog.getByRole('button', { name: 'Ta bort' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await userEvent.click(dialog.getByRole('button', { name: 'Hämta aktuellt utkast' }));
    await waitFor(() => expect(dialog.queryByRole('alert')).toBeNull());
    await userEvent.click(dialog.getByRole('button', { name: 'Ta bort' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const after = await read();
    expect(after.draft.changes.map(({ id }) => id)).toEqual(['draft-bike', 'draft-unresolved']);
    expect(after.draft.relationships?.map(({ id }) => id).sort()).toEqual([
      'draft-edge-none',
      'draft-edge-unknown',
    ]);
    expect(after.draft.objectTypes).toEqual(newer.draft.objectTypes);
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
    expect(await (await client.get(`${path}/history`)).json()).toEqual(history);
  });

  for (const delivered of [false, true]) {
    test(`lost independent removal ${delivered ? 'after commit verifies its absence' : 'before delivery retains its proposal and permits a reviewed retry'}`, async () => {
      const fixture = await reviewFixture();
      const before = await read();
      const actualFetch = authenticatedHttpFetch(client, installation.origin);
      let drop = true;
      vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        if (
          String(input).endsWith('/discard-review') &&
          JSON.parse(String(init?.body)).confirmation &&
          drop
        ) {
          drop = false;
          if (delivered) await actualFetch(input, init);
          throw new TypeError('Controlled lost HTTP delivery');
        }
        return actualFetch(input, init);
      });
      await userEvent.click(
        fixture.draft.getByRole('button', { name: 'Ta bort förslaget: Olöst fordon' }),
      );
      const dialog = within(
        await screen.findByRole('dialog', { name: 'Ta bort förslaget och dess beroenden?' }),
      );
      await waitFor(() =>
        expect(dialog.getByRole('alert').textContent).toContain(
          'Borttagningen kunde inte bekräftas',
        ),
      );
      expect((dialog.getByRole('button', { name: 'Ta bort' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      await userEvent.click(dialog.getByRole('button', { name: 'Hämta aktuellt utkast' }));
      if (!delivered) {
        await waitFor(() => expect(dialog.queryByRole('alert')).toBeNull());
        expect(await read()).toEqual(before);
        await userEvent.click(dialog.getByRole('button', { name: 'Ta bort' }));
      }
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      const after = await read();
      expect(after.draft).toEqual({
        ...before.draft,
        version: before.draft.version + 1,
        changes: before.draft.changes.filter(({ id }) => id !== 'draft-unresolved'),
      });
      expect(after.objects).toEqual(before.objects);
      expect(after.relationships).toEqual(before.relationships);
    });
  }

  test('whole draft discard preserves unsent conversation, while type removal warns and retains dependent full proposals', async () => {
    const fixture = await reviewFixture();
    await fixture.post('object-type', {
      id: 'temporary-type',
      baseRevision: null,
      value: { name: 'Tillfällig typ', description: '' },
    });
    await fixture.post('draft', {
      id: 'temporary-object',
      baseRevision: null,
      value: {
        name: 'Tillfälligt föremål',

        typeId: 'temporary-type',
        properties: [
          { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Behåll hela uppgiften' },
        ],
      },
    });
    // Refresh through the ordinary workspace owner before reading the new proposals.
    cleanup();
    renderHouseholdWork(householdId);
    const draft = await openDraftReview();
    const before = await read();
    await userEvent.click(draft.getByRole('button', { name: 'Ta bort förslaget: Tillfällig typ' }));
    let dialog = within(
      await screen.findByRole('dialog', { name: 'Ta bort förslaget och dess beroenden?' }),
    );
    expect(
      dialog.getByRole('list', { name: 'Förslag som blir kvar men påverkas' }).textContent,
    ).toContain('Objekttypen saknas');
    await userEvent.click(dialog.getByRole('button', { name: 'Ta bort' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await read()).draft.changes.find(({ id }) => id === 'temporary-object')).toEqual(
      before.draft.changes.find(({ id }) => id === 'temporary-object'),
    );
    const message = screen.getByLabelText('Meddelande till Skyttel');
    await userEvent.type(message, 'Min oskickade fråga finns kvar');
    await userEvent.click(draft.getByRole('button', { name: 'Kasta hela utkastet' }));
    dialog = within(await screen.findByRole('dialog', { name: 'Ta bort hela utkastet?' }));
    const current = await read();
    await userEvent.click(dialog.getByRole('button', { name: 'Avbryt' }));
    expect(await read()).toEqual(current);
    await userEvent.click(draft.getByRole('button', { name: 'Kasta hela utkastet' }));
    dialog = within(await screen.findByRole('dialog', { name: 'Ta bort hela utkastet?' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Ta bort hela utkastet' }));
    await waitFor(() => expect(draft.getByText('Utkastet är tomt.')).toBeTruthy());
    expect((message as HTMLTextAreaElement).value).toBe('Min oskickade fråga finns kvar');
    const after = await read();
    expect(after.draft.changes).toEqual([]);
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
  });

  async function conflictFixture() {
    return preparedConflict(prepareConflictContinuity);
  }

  for (const outcome of [
    'undelivered',
    'retained',
    'discarded',
    'saved-afterward',
    'changed-afterward',
  ] as const) {
    test(`explicit conflict outcome verification handles ${outcome} without inventing or replaying private changes`, async () => {
      const { app, other, dialog } = await conflictFixture();
      const before = await read();
      const discard = outcome === 'discarded';
      await userEvent.click(
        dialog.getByRole('button', {
          name: discard ? 'Namn: Sparat i kartan nu – Lo Berg' : 'Namn: Ditt förslag – Lo Lind',
        }),
      );
      await userEvent.click(
        dialog.getByRole('button', {
          name: discard
            ? 'Beskrivning · egenskap 1: Sparat i kartan nu – Beskrivning: Robins anteckning (Text)'
            : 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min anteckning (Text)',
        }),
      );
      const actualFetch = authenticatedHttpFetch(client, installation.origin);
      let drop = true;
      vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/resolve') && drop) {
          drop = false;
          if (outcome !== 'undelivered') await actualFetch(input, init);
          throw new TypeError('Controlled lost HTTP delivery');
        }
        return actualFetch(input, init);
      });
      await userEvent.click(dialog.getByRole('button', { name: 'Lägg valen i utkastet' }));
      await waitFor(() =>
        expect(dialog.getByRole('status').textContent).toContain('Det är oklart'),
      );
      expect(
        (dialog.getByRole('button', { name: 'Lägg valen i utkastet' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      if (outcome === 'saved-afterward')
        expect((await app.save(client, 'completed-after-resolution')).status()).toBe(200);
      if (outcome === 'changed-afterward') {
        await app.propose(other, 'draft', 'lo', {
          ...app.value,
          name: 'Lo Ås',

          properties: [
            {
              id: 'description',
              label: 'Beskrivning',
              kind: 'text',
              value: 'Senare sparad uppgift',
            },
          ],
        });
        expect((await app.save(other, 'changed-after-resolution')).status()).toBe(200);
      }
      const current = await read();
      await userEvent.click(
        dialog.getByRole('button', { name: 'Kontrollera om valet lades i utkastet' }),
      );
      const expected =
        outcome === 'undelivered'
          ? 'Kontrollen visar att valet inte lades'
          : outcome === 'saved-afterward'
            ? 'Konflikten finns inte längre i aktuellt underlag'
            : outcome === 'changed-afterward'
              ? 'Utkastet eller underlaget har ändrats'
              : discard
                ? 'Förslaget har tagits bort'
                : 'Valen finns i ditt utkast';
      await waitFor(() => expect(dialog.getByRole('status').textContent).toContain(expected));
      expect(await read()).toEqual(current);
      if (outcome === 'undelivered') {
        expect(current).toEqual(before);
        expect(
          dialog
            .getByRole('button', { name: 'Namn: Ditt förslag – Lo Lind' })
            .getAttribute('aria-pressed'),
        ).toBe('true');
        await userEvent.click(dialog.getByRole('button', { name: 'Lägg valen i utkastet' }));
        await waitFor(() =>
          expect(dialog.getByRole('status').textContent).toContain('Valen finns i ditt utkast'),
        );
        expect((await read()).draft.version).toBe(before.draft.version + 1);
      }
      if (outcome !== 'saved-afterward' && outcome !== 'changed-afterward')
        expect((await read()).objects).toEqual(before.objects);
    });
  }

  test('a rejected stale conflict keeps choices and requires a fresh comparison before applying current properties', async () => {
    const { app, other, dialog } = await conflictFixture();
    await userEvent.click(dialog.getByRole('button', { name: 'Namn: Ditt förslag – Lo Lind' }));
    await userEvent.click(
      dialog.getByRole('button', {
        name: 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min anteckning (Text)',
      }),
    );
    await app.propose(other, 'draft', 'lo', {
      ...app.value,
      name: 'Lo Ås',

      properties: [
        { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Robins anteckning' },
      ],
    });
    expect((await app.save(other, 'changed-during-review')).status()).toBe(200);
    const before = await read();
    await userEvent.click(dialog.getByRole('button', { name: 'Lägg valen i utkastet' }));
    await waitFor(() =>
      expect(dialog.getByRole('status').textContent).toContain('Underlaget har ändrats'),
    );
    expect(await read()).toEqual(before);
    expect(
      (dialog.getByRole('button', { name: 'Lägg valen i utkastet' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await userEvent.click(dialog.getByRole('button', { name: 'Visa aktuell jämförelse' }));
    await waitFor(() =>
      expect(dialog.getByRole('status').textContent).toContain('Aktuell jämförelse visas'),
    );
    expect(
      dialog
        .getByRole('button', {
          name: 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min anteckning (Text)',
        })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    await userEvent.click(dialog.getByRole('button', { name: 'Namn: Ditt förslag – Lo Lind' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Lägg valen i utkastet' }));
    await waitFor(() =>
      expect(dialog.getByRole('status').textContent).toContain('Valen finns i ditt utkast'),
    );
    expect((await read()).objects).toEqual(before.objects);
    expect((await read()).draft.changes.find(({ id }) => id === 'lo')?.after).toMatchObject({
      name: 'Lo Lind',
      properties: expect.arrayContaining([
        expect.objectContaining({ label: 'Beskrivning', value: 'Min anteckning' }),
      ]),
    });
  });

  async function preparedConflict<
    T extends { installation: Awaited<ReturnType<typeof createInstallation>>; path: string },
  >(prepare: (first: APIRequestContext, second: APIRequestContext) => Promise<T>) {
    const other = await request.newContext();
    otherClients.push(other);
    await installation.close();
    const app = await prepare(client, other);
    installation = app.installation;
    path = app.path;
    householdId = path.split('/households/')[1].split('/')[0];
    vi.stubGlobal('fetch', authenticatedHttpFetch(client, installation.origin));
    renderHouseholdWork(householdId);
    return { app, other, dialog: await openConflictReview() };
  }

  for (const kind of ['removed', 'duplicate', 'missing-endpoint'] as const) {
    test(`the ${kind} relationship comparison is read-only and discards only its private unusable proposal`, async () => {
      const { dialog } = await preparedConflict((first, second) =>
        prepareRelationshipSpecialConflict(first, second, kind),
      );
      const before = await read();
      const history = await (await client.get(`${path}/history`)).json();
      for (const name of ['Sparat i kartan nu', 'Ditt förslag'])
        expect(within(dialog.getByRole('region', { name })).queryByRole('button')).toBeNull();
      expect(dialog.getByRole('region', { name: 'Ditt förslag' }).textContent).toContain(
        'Osäkert uppgivet',
      );
      expect(dialog.getByRole('region', { name: 'Resultat av valen' }).textContent).toContain(
        kind === 'removed' ? 'Borttaget' : 'Tas bort ur ditt utkast',
      );
      await userEvent.click(
        dialog.getByRole('button', {
          name:
            kind === 'removed'
              ? 'Acceptera borttagningen och kasta ditt förslag'
              : 'Ta bort sambandet ur ditt utkast',
        }),
      );
      await waitFor(() =>
        expect(dialog.getByRole('status').textContent).toContain('Förslaget har tagits bort'),
      );
      const after = await read();
      expect(after.draft.relationships ?? []).toEqual([]);
      expect(after.draft.changes).toEqual(before.draft.changes);
      expect(after.objects).toEqual(before.objects);
      expect(after.relationships).toEqual(before.relationships);
      expect(await (await client.get(`${path}/history`)).json()).toEqual(history);
      expect(dialog.getByRole('navigation', { name: 'Alla konflikter' }).textContent).toContain(
        'Vald lösning',
      );
    });
  }

  test('a removed object cannot be restored by its edit and accepting removal preserves independent work', async () => {
    const { dialog } = await preparedConflict(prepareRemovedObjectConflict);
    const before = await read();
    expect(dialog.getByRole('region', { name: 'Ditt förslag' }).textContent).toContain(
      'Mitt förslag',
    );
    expect(dialog.getByRole('region', { name: 'Sparat i kartan nu' }).textContent).toContain(
      'Borttaget',
    );
    await userEvent.click(
      dialog.getByRole('button', { name: 'Acceptera borttagningen och kasta ditt förslag' }),
    );
    await waitFor(() =>
      expect(dialog.getByRole('status').textContent).toContain('Förslaget har tagits bort'),
    );
    expect((await read()).draft.changes).toEqual(
      before.draft.changes.filter(({ id }) => id !== 'lo'),
    );
    expect((await read()).objects).toEqual(before.objects);
  });

  for (const scenario of ['facts', 'connections', 'facts-and-connections'] as const) {
    test(`own object removal reviews ${scenario} and keeps deletion private until the separate atomic save`, async () => {
      const { dialog } = await preparedConflict((first, second) =>
        prepareOwnRemovalConflict(first, second, scenario),
      );
      const before = await read();
      const apply = dialog.getByRole('button', {
        name: 'Lägg valen i utkastet',
      }) as HTMLButtonElement;
      expect(apply.disabled).toBe(true);
      await userEvent.click(
        dialog.getByRole('button', { name: 'Objekt: Ditt förslag – Föreslagen borttagning' }),
      );
      if (scenario !== 'facts') {
        const saved = within(dialog.getByRole('region', { name: 'Sparat i kartan nu' }));
        await userEvent.click(saved.getByRole('button', { name: /^Samband:/ }));
        expect(dialog.getByRole('alert').textContent).toContain(
          'Objektet kan inte tas bort medan sambandet till det finns kvar',
        );
        expect(apply.disabled).toBe(true);
        expect(await read()).toEqual(before);
        await userEvent.click(
          dialog.getByRole('button', {
            name: 'Samband: Ditt förslag – Föreslagen borttagning av sambandet',
          }),
        );
      }
      expect(apply.disabled).toBe(false);
      await userEvent.click(apply);
      await waitFor(() =>
        expect(dialog.getByRole('status').textContent).toContain('Valen finns i ditt utkast'),
      );
      const staged = await read();
      expect(staged.objects).toEqual(before.objects);
      expect(staged.relationships).toEqual(before.relationships);
      expect(staged.draft.changes.find(({ id }) => id === 'lo')).toMatchObject({
        before: before.objects.find(({ id }) => id === 'lo'),
        after: null,
      });
      expect(staged.draft.changes.find(({ id }) => id === 'independent')).toEqual(
        before.draft.changes.find(({ id }) => id === 'independent'),
      );
      await userEvent.click(dialog.getByRole('button', { name: 'Stäng konfliktdialogen' }));
      await saveHouseholdDraft();
      const saved = await read();
      expect(saved.objects.some(({ id }) => id === 'lo')).toBe(false);
      expect(saved.objects.some(({ id }) => id === 'independent')).toBe(true);
      expect(saved.relationships).toEqual([]);
    });
  }

  for (const kind of ['object', 'relationship'] as const) {
    test(`a retained ${kind} definition without a removed revision permits private discard but never invented restoration`, async () => {
      const { dialog } = await preparedConflict((member, administrator) =>
        prepareArchiveConflict(
          administrator,
          member,
          kind === 'object' ? 'missing-object-definition' : 'missing-relationship-definition',
        ),
      );
      const before = await read();
      expect(before.removedDefinitions).toBeUndefined();
      const proposed = within(dialog.getByRole('region', { name: 'Ditt förslag' })).getByRole(
        'button',
      );
      expect(proposed.textContent).toContain('Min privata typbenämning');
      expect((proposed as HTMLButtonElement).disabled).toBe(true);
      expect(
        dialog.getByText(/Typdefinitionen kan inte återställas med det aktuella underlaget/),
      ).toBeTruthy();
      await userEvent.click(
        dialog.getByRole('button', { name: 'Typdefinition: Sparat i kartan nu – Borttaget' }),
      );
      await userEvent.click(dialog.getByRole('button', { name: 'Lägg valen i utkastet' }));
      await waitFor(() =>
        expect(dialog.getByRole('status').textContent).toContain('Förslaget har tagits bort'),
      );
      const after = await read();
      expect(after.draft[kind === 'object' ? 'objectTypes' : 'relationshipTypes'] ?? []).toEqual(
        [],
      );
      expect(after.draft.changes).toEqual(before.draft.changes);
      expect(after.types).toEqual(before.types);
      expect(after.relationshipTypes).toEqual(before.relationshipTypes);
    });

    test(`explicit ${kind} definition restoration verifies a lost private reply and restores identity only on a later save`, async () => {
      const { app, dialog } = await preparedConflict((member, administrator) =>
        prepareArchiveConflict(
          administrator,
          member,
          kind === 'object' ? 'removed-object-definition' : 'removed-relationship-definition',
        ),
      );
      const before = await read();
      const actualFetch = authenticatedHttpFetch(client, installation.origin);
      let submitted = 0;
      vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await actualFetch(input, init);
        if (String(input).endsWith('/resolve')) {
          submitted++;
          throw new TypeError('Controlled lost committed definition reply');
        }
        return response;
      });
      await userEvent.click(dialog.getByRole('button', { name: /^Typdefinition: Ditt förslag/ }));
      expect(dialog.getByRole('region', { name: 'Resultat av valen' }).textContent).toContain(
        'Min privata typbenämning',
      );
      await userEvent.click(dialog.getByRole('button', { name: 'Lägg valen i utkastet' }));
      await waitFor(() =>
        expect(dialog.getByRole('status').textContent).toContain('Det är oklart'),
      );
      await userEvent.click(
        dialog.getByRole('button', { name: 'Kontrollera om valet lades i utkastet' }),
      );
      await waitFor(() =>
        expect(dialog.getByRole('status').textContent).toContain('Valen finns i ditt utkast'),
      );
      expect(submitted).toBe(1);
      const staged = await read();
      const proposals = staged.draft[kind === 'object' ? 'objectTypes' : 'relationshipTypes'];
      expect(proposals?.[0]).toMatchObject({
        before: null,
        after: { id: app.typeId, name: 'Min privata typbenämning' },
        restoration: { contentVersion: before.contentVersion },
      });
      expect(staged.types).toEqual(before.types);
      expect(staged.relationshipTypes).toEqual(before.relationshipTypes);
      expect(staged.draft.changes).toEqual(before.draft.changes);
      await userEvent.click(dialog.getByRole('button', { name: 'Stäng konfliktdialogen' }));
      await saveHouseholdDraft();
      const saved = await read();
      expect(
        (kind === 'object' ? saved.types : saved.relationshipTypes).find(
          ({ id }) => id === app.typeId,
        ),
      ).toMatchObject({ name: 'Min privata typbenämning' });
      expect(saved.objects.some(({ name }) => name === 'Oberoende förslag')).toBe(true);
    });
  }

  test('invalid mixed relationship endpoints retain choices until the duplicate is corrected', async () => {
    const { dialog } = await preparedConflict(async (first, second) => {
      const app = await conflictCollaborators(first, second);
      const state = await app.read();
      const value = {
        typeId: state.relationshipTypes[0].id,
        sourceId: 'lo',
        targetId: 'service',
      };
      await app.propose(first, 'relationship', 'edge', value);
      await app.save(first, 'base-edge');
      await app.propose(first, 'relationship', 'existing', {
        ...value,
        sourceId: 'service',
        targetId: 'lo',
      });
      await app.propose(first, 'relationship', 'edge', {
        ...value,
        targetId: 'lo',
      });
      await app.propose(second, 'relationship', 'edge', { ...value, sourceId: 'service' });
      await app.save(second, 'concurrent');
      return app;
    });
    const before = await read();
    await userEvent.click(
      dialog.getByRole('button', { name: 'Från objekt: Sparat i kartan nu – Molnmusik' }),
    );
    await userEvent.click(
      dialog.getByRole('button', { name: 'Till objekt: Ditt förslag – Lo Exempel' }),
    );
    expect(dialog.getByRole('alert').textContent).toContain('finns redan i kartan');
    const apply = dialog.getByRole('button', {
      name: 'Lägg valen i utkastet',
    }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(
      dialog
        .getByRole('button', { name: 'Till objekt: Ditt förslag – Lo Exempel' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(await read()).toEqual(before);
    await userEvent.click(
      dialog.getByRole('button', { name: 'Från objekt: Ditt förslag – Lo Exempel' }),
    );
    expect(dialog.queryByRole('alert')).toBeNull();
    expect(apply.disabled).toBe(false);
    await userEvent.click(apply);
    await waitFor(() =>
      expect(dialog.getByRole('status').textContent).toContain('Valen finns i ditt utkast'),
    );
    expect(
      (await read()).draft.relationships?.find(({ id }) => id === 'edge')?.after,
    ).toMatchObject({
      sourceId: 'lo',
      targetId: 'lo',
    });
    expect((await read()).relationships).toEqual(before.relationships);
  });

  test('next conflict retains the other object choices and resolved preview without an implicit shared save', async () => {
    const { app, other, dialog } = await conflictFixture();
    await userEvent.click(dialog.getByRole('button', { name: 'Stäng konfliktdialogen' }));
    const service = {
      ...app.value,
      name: 'Min musiktjänst',
      properties: [
        { id: 'description', label: 'Beskrivning', kind: 'text' as const, value: 'Min tjänst' },
      ],
    };
    await app.propose(client, 'draft', 'service', service);
    await app.propose(other, 'draft', 'service', {
      ...service,
      name: 'Vår musiktjänst',

      properties: [
        { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Robins tjänst' },
      ],
    });
    expect((await app.save(other, 'second-conflict')).status()).toBe(200);
    cleanup();
    renderHouseholdWork(householdId);
    const review = await openConflictReview();
    const list = within(review.getByRole('navigation', { name: 'Alla konflikter' }));
    await userEvent.click(list.getByRole('button', { name: /^Objekt\s*Min musiktjänst/ }));
    await userEvent.click(
      review.getByRole('button', { name: 'Namn: Ditt förslag – Min musiktjänst' }),
    );
    await userEvent.click(
      review.getByRole('button', {
        name: 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min tjänst (Text)',
      }),
    );
    await userEvent.click(list.getByRole('button', { name: /^Objekt\s*Lo Lind/ }));
    await userEvent.click(review.getByRole('button', { name: 'Namn: Ditt förslag – Lo Lind' }));
    await userEvent.click(
      review.getByRole('button', {
        name: 'Beskrivning · egenskap 1: Ditt förslag – Beskrivning: Min anteckning (Text)',
      }),
    );
    const before = await read();
    await userEvent.click(review.getByRole('button', { name: 'Lägg valen i utkastet' }));
    await waitFor(() =>
      expect(review.getByRole('heading', { name: '✓ Valen finns i ditt utkast' })).toBeTruthy(),
    );
    await userEvent.click(review.getByRole('button', { name: 'Nästa konflikt' }));
    expect(review.getByRole('heading', { name: 'Min musiktjänst' })).toBeTruthy();
    expect(
      review
        .getByRole('button', { name: 'Namn: Ditt förslag – Min musiktjänst' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    await userEvent.click(list.getByRole('button', { name: /^Objekt\s*Lo Lind/ }));
    expect(review.getByRole('heading', { name: '✓ Valen finns i ditt utkast' })).toBeTruthy();
    expect((await read()).objects).toEqual(before.objects);
    expect((await read()).draft.changes.find(({ id }) => id === 'service')).toEqual(
      before.draft.changes.find(({ id }) => id === 'service'),
    );
  });

  test('a canceled pending removal keeps later composer focus and verifies a lost committed reply after a failed refresh', async () => {
    const fixture = await reviewFixture();
    const before = await read();
    const actualFetch = authenticatedHttpFetch(client, installation.origin);
    let release: (() => void) | undefined;
    let committed: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const changed = new Promise<void>((resolve) => {
      committed = resolve;
    });
    let failedRefresh = false;
    let hold = true;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await actualFetch(input, init);
      if (
        String(input).endsWith('/discard-review') &&
        JSON.parse(String(init?.body)).confirmation &&
        hold
      ) {
        hold = false;
        committed?.();
        await held;
        throw new TypeError('Controlled lost committed removal reply');
      }
      if (String(input) === path.replace(installation.origin, '') && failedRefresh) {
        failedRefresh = false;
        throw new TypeError('Controlled lost current draft reply');
      }
      return response;
    });
    try {
      await userEvent.click(
        fixture.draft.getByRole('button', { name: 'Ta bort förslaget: Ospecificerat fordon' }),
      );
      let dialog = within(
        await screen.findByRole('dialog', { name: 'Ta bort förslaget och dess beroenden?' }),
      );
      await userEvent.click(dialog.getByRole('button', { name: 'Ta bort' }));
      await changed;
      expect((dialog.getByRole('button', { name: 'Ta bort' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      expect(dialog.getByRole('status').textContent).toContain('Tar bort förslagen');
      await userEvent.click(dialog.getByRole('button', { name: 'Avbryt' }));
      const message = screen.getByLabelText('Meddelande till Skyttel');
      await userEvent.type(message, 'Behåll min senare fråga och fokus');
      release?.();
      await waitFor(() =>
        expect(
          screen.getByRole('status', { name: 'Utkastets åtgärdsstatus' }).textContent,
        ).toContain('Borttagningen kunde inte bekräftas'),
      );
      expect(document.activeElement).toBe(message);
      expect(screen.queryByRole('dialog')).toBeNull();
      await userEvent.click(
        fixture.draft.getByRole('button', { name: 'Kontrollera borttagningen' }),
      );
      dialog = within(
        await screen.findByRole('dialog', { name: 'Ta bort förslaget och dess beroenden?' }),
      );
      failedRefresh = true;
      await userEvent.click(dialog.getByRole('button', { name: 'Hämta aktuellt utkast' }));
      await waitFor(() =>
        expect(dialog.getByRole('alert').textContent).toContain(
          'Aktuellt utkast kunde inte hämtas',
        ),
      );
      expect((dialog.getByRole('button', { name: 'Ta bort' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      await userEvent.click(dialog.getByRole('button', { name: 'Hämta aktuellt utkast' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      const after = await read();
      expect(after.draft.version).toBe(before.draft.version + 1);
      expect(after.draft.changes.map(({ id }) => id)).toEqual(['draft-bike', 'draft-unresolved']);
      expect(after.objects).toEqual(before.objects);
      expect(after.relationships).toEqual(before.relationships);
      expect((message as HTMLTextAreaElement).value).toBe('Behåll min senare fråga och fokus');
    } finally {
      release?.();
    }
  });
});
