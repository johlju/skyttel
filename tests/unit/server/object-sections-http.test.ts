import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation, robin } from '../../support/installation.js';

let installation: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
let path: string;
const read = async (): Promise<MapState> => (await client.get(path)).json();
const post = (route: string, data: unknown) =>
  client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
const fields = [
  { id: 'note', name: 'Anteckning', description: '', kind: 'text', sectionId: 'facts' },
  { id: 'power', name: 'Effekt', description: '', kind: 'number', sectionId: '' },
  { id: 'date', name: 'Datum', description: '', kind: 'date', sectionId: 'facts' },
  { id: 'battery', name: 'Batteri', description: '', kind: 'boolean', sectionId: 'facts' },
];
const definition = {
  name: 'Solcellsanläggning',
  description: '',
  fields,
  sections: [
    { id: 'facts', name: 'Uppgifter' },
    { id: 'service', name: 'Service' },
  ],
};
const define = async (value: unknown = definition, baseRevision: number | null = null) =>
  post('object-type', { version: (await read()).draft.version, id: 'solar', baseRevision, value });

beforeEach(async () => {
  installation = await createInstallation();
  client = await request.newContext();
  await signIn(client, installation.origin);
  const { household } = await (await createHousehold(client, installation.origin)).json();
  path = `${installation.origin}/api/households/${household.id}/map`;
});
afterEach(async () => {
  await client.dispose();
  await installation.close();
});

async function member() {
  const other = await request.newContext();
  installation.setIdentity(robin);
  await signIn(other, installation.origin);
  const { user } = await (await other.get(`${installation.origin}/api/bootstrap`)).json();
  const { code } = await (
    await client.post(`${path.replace('/map', '')}/invitations`, {
      headers: { origin: installation.origin },
      data: { userId: user.id },
    })
  ).json();
  await other.post(`${installation.origin}/api/invitations/accept`, {
    headers: { origin: installation.origin },
    data: { code },
  });
  return other;
}

test('sections and hidden field identities survive atomic save, restart and legacy-client edits', async () => {
  expect((await define()).status()).toBe(200);
  expect((await read()).draft.objectTypes?.[0].after).toMatchObject(definition);
  const customValues = { note: 'Behåll', power: 0, battery: false };
  expect(
    (
      await post('draft', {
        version: 1,
        id: 'panels',
        baseRevision: null,
        value: { typeId: 'solar', name: 'Paneler', description: '', customValues },
      })
    ).status(),
  ).toBe(200);
  const response = await post('save', { version: 2, operationId: 'sections' });
  expect(response.status()).toBe(200);
  const { receipt } = await response.json();
  expect(receipt.objectTypes[0].after).toMatchObject(definition);
  expect(receipt.changes[0].type).toMatchObject(definition);
  await installation.restart();
  expect((await read()).types.find(({ id }) => id === 'solar')).toMatchObject(definition);
  expect((await read()).objects[0].customValues).toEqual(customValues);
  expect(
    (
      await define(
        {
          name: 'Solkraft',
          description: 'Äldre klient',
          fields: fields.map(({ sectionId: _placement, ...field }) => field),
        },
        1,
      )
    ).status(),
  ).toBe(200);
  expect((await read()).draft.objectTypes?.[0].after).toMatchObject({
    ...definition,
    name: 'Solkraft',
    description: 'Äldre klient',
  });
});

test('malformed sections and placements reject the whole proposal without changing its version', async () => {
  const before = await read();
  for (const value of [
    { ...definition, sections: null },
    { ...definition, sections: [definition.sections[0], definition.sections[0]] },
    { ...definition, sections: [{ id: '__proto__', name: 'Fel' }] },
    { ...definition, sections: [{ id: 'facts', name: ' ' }] },
    { ...definition, sections: [{ id: 'facts', name: 'x'.repeat(201) }] },
    {
      ...definition,
      sections: Array.from({ length: 101 }, (_, i) => ({ id: `s${i}`, name: 'Avsnitt' })),
    },
    { ...definition, fields: [{ ...fields[0], sectionId: 'missing' }] },
    { ...definition, fields: [{ ...fields[0], sectionId: null }] },
    { ...definition, fields: [{ ...fields[0], sectionId: undefined }] },
    { ...definition, sections: undefined },
  ]) {
    const response = await define(value);
    expect(response.status(), JSON.stringify(value)).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_type_definition' });
    expect(await read()).toEqual(before);
  }
});

test('a legacy default with an explicitly hidden field retains that placement when an older client omits metadata', async () => {
  const field = { id: 'note', name: 'Anteckning', description: '', kind: 'text' };
  expect(
    (
      await define({ name: 'Solkraft', description: '', fields: [{ ...field, sectionId: '' }] })
    ).status(),
  ).toBe(200);
  expect((await post('save', { version: 1, operationId: 'hidden-default' })).status()).toBe(200);
  expect(
    (await define({ name: 'Solkraft', description: 'Äldre klient', fields: [field] }, 1)).status(),
  ).toBe(200);
  expect((await read()).draft.objectTypes?.[0].after?.fields).toEqual([
    { ...field, sectionId: '' },
  ]);
});

test('undo reverses section order and field placement while preserving independent names and values', async () => {
  const save = async (operationId: string) =>
    post('save', { version: (await read()).draft.version, operationId });
  await define();
  await save('created');
  const rearranged = {
    ...definition,
    sections: [...definition.sections].reverse(),
    fields: [...fields]
      .reverse()
      .map((field) => ({ ...field, sectionId: field.id === 'note' ? '' : field.sectionId })),
  };
  expect((await define(rearranged, 1)).status()).toBe(200);
  const rearrangedSave = await save('rearranged');
  expect(rearrangedSave.status()).toBe(200);
  const { receipt } = await rearrangedSave.json();
  const independent = {
    ...rearranged,
    sections: rearranged.sections.map((section) => ({
      ...section,
      name: section.id === 'service' ? 'Underhåll' : section.name,
    })),
    fields: rearranged.fields.map((field) => ({
      ...field,
      name: field.id === 'power' ? 'Kapacitet' : field.name,
    })),
  };
  await define(independent, 2);
  await post('draft', {
    version: (await read()).draft.version,
    id: 'panels',
    baseRevision: null,
    value: {
      typeId: 'solar',
      name: 'Paneler',
      description: '',
      customValues: { note: 'Dolt men bevarat', power: 0, battery: false },
    },
  });
  expect((await save('independent')).status()).toBe(200);
  const undone = await post('undo', {
    version: (await read()).draft.version,
    operationId: 'rearranged',
    userId: receipt.userId,
  });
  expect(undone.status()).toBe(200);
  const after = (await read()).draft.objectTypes?.[0].after;
  expect(after?.sections).toEqual([
    { id: 'facts', name: 'Uppgifter' },
    { id: 'service', name: 'Underhåll' },
  ]);
  expect(after?.fields?.map(({ id }) => id)).toEqual(['note', 'power', 'date', 'battery']);
  expect(after?.fields?.[0].sectionId).toBe('facts');
  expect(after?.fields?.[1].name).toBe('Kapacitet');
  expect((await save('undo-rearranged')).status()).toBe(200);
  expect((await read()).objects[0].customValues).toEqual({
    note: 'Dolt men bevarat',
    power: 0,
    battery: false,
  });
});

test.each(['saved', 'proposed'])(
  'a %s section conflict choice protects atomic values and independent presentation facts',
  async (choice) => {
    const other = await member();
    try {
      await define();
      await post('save', { version: 1, operationId: 'initial' });
      const own = {
        ...definition,
        sections: [...definition.sections].reverse(),
        fields: fields.map((field) => (field.id === 'note' ? { ...field, sectionId: '' } : field)),
      };
      await define(own, 1);
      await post('draft', {
        version: (await read()).draft.version,
        id: 'panels',
        baseRevision: null,
        value: {
          typeId: 'solar',
          name: 'Paneler',
          description: '',
          customValues: { note: 'Mitt värde', power: 0, battery: false },
        },
      });
      const shared = {
        ...definition,
        sections: [{ id: 'facts', name: 'Fakta' }, definition.sections[1]],
        fields: fields.map((field) =>
          field.id === 'date' ? { ...field, sectionId: 'service' } : field,
        ),
      };
      const send = (route: string, data: unknown) =>
        other.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
      expect(
        (
          await send('object-type', { version: 0, id: 'solar', baseRevision: 1, value: shared })
        ).status(),
      ).toBe(200);
      expect((await send('save', { version: 1, operationId: 'other' })).status()).toBe(200);
      const before = await read();
      expect(
        (await post('save', { version: before.draft.version, operationId: 'stale' })).status(),
      ).toBe(409);
      expect(await read()).toEqual(before);
      const current = before.types.find(({ id }) => id === 'solar');
      expect(
        (
          await post('resolve', {
            version: before.draft.version,
            choice,
            conflict: { kind: 'objectType', id: 'solar', current },
          })
        ).status(),
      ).toBe(200);
      const state = await read();
      expect(state.draft.changes[0].type.sections?.find(({ id }) => id === 'facts')?.name).toBe(
        'Fakta',
      );
      expect(state.draft.changes[0].type.fields?.find(({ id }) => id === 'date')?.sectionId).toBe(
        'service',
      );
      expect(state.draft.changes[0].type.fields?.find(({ id }) => id === 'note')?.sectionId).toBe(
        choice === 'saved' ? 'facts' : '',
      );
      const response = await post('save', { version: state.draft.version, operationId: 'fresh' });
      expect(response.status()).toBe(200);
      expect((await read()).objects[0].customValues).toEqual({
        note: 'Mitt värde',
        power: 0,
        battery: false,
      });
    } finally {
      await other.dispose();
    }
  },
);

test('restoring deleted values also restores their removed section without losing current presentation', async () => {
  const save = async (operationId: string) => {
    const response = await post('save', { version: (await read()).draft.version, operationId });
    expect(response.status()).toBe(200);
    return (await response.json()).receipt;
  };
  await define();
  await post('draft', {
    version: 1,
    id: 'panels',
    baseRevision: null,
    value: {
      typeId: 'solar',
      name: 'Paneler',
      description: '',
      customValues: { note: 'Återställ', power: 0 },
    },
  });
  await save('initial');
  await post('draft', {
    version: (await read()).draft.version,
    id: 'panels',
    baseRevision: 1,
    value: null,
  });
  const receipt = await save('deleted');
  await define(
    { ...definition, fields: [], sections: [{ id: 'current', name: 'Dagens avsnitt' }] },
    1,
  );
  await save('removed-fields');
  const undo = await post('undo', {
    version: (await read()).draft.version,
    operationId: receipt.operationId,
    userId: receipt.userId,
  });
  expect(undo.status(), await undo.text()).toBe(200);
  const state = await read();
  expect(state.draft.objectTypes?.[0].after?.sections).toEqual([
    { id: 'current', name: 'Dagens avsnitt' },
    { id: 'facts', name: 'Uppgifter' },
  ]);
  expect(state.draft.objectTypes?.[0].after?.fields).toEqual(fields.slice(0, 2));
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        choice: 'proposed',
        conflict: {
          kind: 'objectType',
          id: 'solar',
          current: state.types.find(({ id }) => id === 'solar'),
        },
      })
    ).status(),
  ).toBe(200);
  await save('restored');
  await installation.restart();
  expect((await read()).objects[0].customValues).toEqual({ note: 'Återställ', power: 0 });
});
