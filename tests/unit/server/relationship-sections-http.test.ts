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
  { id: 'amount', name: 'Belopp', description: '', kind: 'number', sectionId: '' },
  { id: 'start', name: 'Startdatum', description: '', kind: 'date', sectionId: 'facts' },
  { id: 'active', name: 'Bekräftat', description: '', kind: 'boolean', sectionId: 'facts' },
];
const definition = {
  name: 'Förvaring',
  description: 'Förvaringsplats',
  forwardLabel: 'förvaras i',
  reverseLabel: 'innehåller',
  fields,
  sections: [
    { id: 'facts', name: 'Uppgifter' },
    { id: 'service', name: 'Service' },
  ],
};
const values = { note: 'Låst skåp', amount: 0, active: false };
const define = async (value: unknown = definition, baseRevision: number | null = null) =>
  post('relationship-type', {
    version: (await read()).draft.version,
    id: 'storage',
    baseRevision,
    value,
  });
const save = async (operationId: string) =>
  post('save', { version: (await read()).draft.version, operationId });

beforeEach(async () => {
  installation = await createInstallation();
  client = await request.newContext();
  await signIn(client, installation.origin);
  const { household } = await (await createHousehold(client, installation.origin)).json();
  path = `${installation.origin}/api/households/${household.id}/map`;
  for (const id of ['bike', 'garage']) {
    const state = await read();
    await post('draft', {
      version: state.draft.version,
      id,
      baseRevision: null,
      value: { typeId: state.types[0].id, name: id, description: '' },
    });
  }
  expect((await save('objects')).status()).toBe(200);
});
afterEach(async () => {
  await client.dispose();
  await installation.close();
});

test('relationship sections retain field identity and hidden answers through atomic save, restart and old-client edits', async () => {
  expect((await define()).status()).toBe(200);
  expect(
    (
      await post('relationship', {
        version: (await read()).draft.version,
        id: 'edge',
        baseRevision: null,
        value: {
          typeId: 'storage',
          sourceId: 'bike',
          targetId: 'garage',
          knowledge: 'known',
          customValues: values,
        },
      })
    ).status(),
  ).toBe(200);
  const response = await save('sections');
  expect(response.status()).toBe(200);
  const { receipt } = await response.json();
  expect(receipt.relationshipTypes[0].after).toMatchObject(definition);
  expect(receipt.relationships[0].type).toMatchObject(definition);
  await installation.restart();
  expect((await read()).relationshipTypes.find(({ id }) => id === 'storage')).toMatchObject(
    definition,
  );
  expect((await read()).relationships[0].customValues).toEqual(values);
  const { sections: _sections, ...legacy } = definition;
  expect(
    (
      await define(
        {
          ...legacy,
          description: 'Äldre klient',
          fields: [...fields].reverse().map(({ sectionId: _placement, ...field }) => field),
        },
        1,
      )
    ).status(),
  ).toBe(200);
  expect((await read()).draft.relationshipTypes?.[0].after).toMatchObject({
    ...definition,
    description: 'Äldre klient',
  });
  expect((await save('legacy')).status()).toBe(200);
  expect((await read()).relationships[0].customValues).toEqual(values);
  const { fields: _fields, ...labels } = legacy;
  expect((await define(labels, 2)).status()).toBe(200);
  expect((await read()).draft.relationshipTypes?.[0].after).toMatchObject(definition);
  const added = { id: 'new', name: 'Ny uppgift', description: '', kind: 'text' };
  expect((await define({ ...legacy, fields: [added, ...legacy.fields] }, 2)).status()).toBe(200);
  expect((await read()).draft.relationshipTypes?.[0].after?.fields).toEqual([
    ...fields,
    { ...added, sectionId: 'facts' },
  ]);
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
    expect(await response.json()).toEqual({ error: 'invalid_relationship_type' });
    expect(await read()).toEqual(before);
  }
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
    sections: [
      ...rearranged.sections.map((section) => ({
        ...section,
        name: section.id === 'service' ? 'Underhåll' : section.name,
      })),
      { id: 'later', name: 'Senare avsnitt' },
    ],
    fields: [
      ...rearranged.fields.map((field) => ({
        ...field,
        name: field.id === 'amount' ? 'Kapacitet' : field.name,
      })),
      { id: 'later', name: 'Senare fält', description: '', kind: 'text', sectionId: 'later' },
    ],
  };
  await define(independent, 2);
  await post('relationship', {
    version: (await read()).draft.version,
    id: 'edge',
    baseRevision: null,
    value: {
      typeId: 'storage',
      sourceId: 'bike',
      targetId: 'garage',
      knowledge: 'known',
      customValues: { note: 'Dolt men bevarat', amount: 0, active: false },
    },
  });
  expect((await save('independent')).status()).toBe(200);
  const undone = await post('undo', {
    version: (await read()).draft.version,
    operationId: 'rearranged',
    userId: receipt.userId,
  });
  expect(undone.status()).toBe(200);
  const after = (await read()).draft.relationshipTypes?.[0].after;
  expect(after?.sections).toEqual([
    { id: 'facts', name: 'Uppgifter' },
    { id: 'later', name: 'Senare avsnitt' },
    { id: 'service', name: 'Underhåll' },
  ]);
  expect(after?.fields?.map(({ id }) => id)).toEqual([
    'note',
    'later',
    'amount',
    'start',
    'active',
  ]);
  expect(after?.fields?.[0].sectionId).toBe('facts');
  expect(after?.fields?.find(({ id }) => id === 'amount')?.name).toBe('Kapacitet');
  expect((await save('undo-rearranged')).status()).toBe(200);
  expect((await read()).relationships[0].customValues).toEqual({
    note: 'Dolt men bevarat',
    amount: 0,
    active: false,
  });
});

test.each(['saved', 'proposed'])(
  'a %s section conflict choice protects atomic values and independent presentation facts',
  async (choice) => {
    const other = await member();
    try {
      await define();
      expect((await save('initial')).status()).toBe(200);
      const own = {
        ...definition,
        sections: [...definition.sections].reverse(),
        fields: fields.map((field) => (field.id === 'note' ? { ...field, sectionId: '' } : field)),
      };
      await define(own, 1);
      await post('relationship', {
        version: (await read()).draft.version,
        id: 'edge',
        baseRevision: null,
        value: {
          typeId: 'storage',
          sourceId: 'bike',
          targetId: 'garage',
          knowledge: 'known',
          customValues: { note: 'Mitt värde', amount: 0, active: false },
        },
      });
      const shared = {
        ...definition,
        sections: [{ id: 'facts', name: 'Fakta' }, definition.sections[1]],
        fields: fields.map((field) =>
          field.id === 'start' ? { ...field, sectionId: 'service' } : field,
        ),
      };
      const send = (route: string, data: unknown) =>
        other.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
      expect(
        (
          await send('relationship-type', {
            version: 0,
            id: 'storage',
            baseRevision: 1,
            value: shared,
          })
        ).status(),
      ).toBe(200);
      expect((await send('save', { version: 1, operationId: 'other' })).status()).toBe(200);
      const before = await read();
      expect(
        (await post('save', { version: before.draft.version, operationId: 'stale' })).status(),
      ).toBe(409);
      expect(await read()).toEqual(before);
      const current = before.relationshipTypes.find(({ id }) => id === 'storage');
      expect(
        (
          await post('resolve', {
            version: before.draft.version,
            choice,
            conflict: { kind: 'relationshipType', id: 'storage', current },
          })
        ).status(),
      ).toBe(200);
      const state = await read();
      expect(
        state.draft.relationships?.[0].type.sections?.find(({ id }) => id === 'facts')?.name,
      ).toBe('Fakta');
      expect(
        state.draft.relationships?.[0].type.fields?.find(({ id }) => id === 'start')?.sectionId,
      ).toBe('service');
      expect(
        state.draft.relationships?.[0].type.fields?.find(({ id }) => id === 'note')?.sectionId,
      ).toBe(choice === 'saved' ? 'facts' : '');
      const response = await post('save', { version: state.draft.version, operationId: 'fresh' });
      expect(response.status()).toBe(200);
      expect((await read()).relationships[0].customValues).toEqual({
        note: 'Mitt värde',
        amount: 0,
        active: false,
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
  await post('relationship', {
    version: (await read()).draft.version,
    id: 'edge',
    baseRevision: null,
    value: {
      typeId: 'storage',
      sourceId: 'bike',
      targetId: 'garage',
      knowledge: 'known',
      customValues: { note: 'Återställ', amount: 0 },
    },
  });
  await save('initial');
  await post('relationship', {
    version: (await read()).draft.version,
    id: 'edge',
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
  expect(state.draft.relationshipTypes?.[0].after?.sections).toEqual([
    { id: 'current', name: 'Dagens avsnitt' },
    { id: 'facts', name: 'Uppgifter' },
  ]);
  expect(state.draft.relationshipTypes?.[0].after?.fields).toEqual(fields.slice(0, 2));
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        choice: 'proposed',
        conflict: {
          kind: 'relationshipType',
          id: 'storage',
          current: state.relationshipTypes.find(({ id }) => id === 'storage'),
        },
      })
    ).status(),
  ).toBe(200);
  await save('restored');
  await installation.restart();
  expect((await read()).relationships[0].customValues).toEqual({ note: 'Återställ', amount: 0 });
});

test.each(['proposed-removal', 'current-removal'] as const)(
  'explicit resolution keeps a section needed by an independent field after %s',
  async (direction) => {
    const other = await member();
    try {
      await define();
      await save('initial');
      const removed = {
        ...definition,
        sections: [definition.sections[0]],
        fields: fields.map((field) => ({
          ...field,
          sectionId: field.sectionId === 'service' ? '' : field.sectionId,
        })),
      };
      const moved = {
        ...definition,
        fields: fields.map((field) =>
          field.id === 'start' ? { ...field, sectionId: 'service' } : field,
        ),
      };
      expect((await define(direction === 'proposed-removal' ? removed : moved, 1)).status()).toBe(
        200,
      );
      const send = (route: string, data: unknown) =>
        other.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
      expect(
        (
          await send('relationship-type', {
            version: 0,
            id: 'storage',
            baseRevision: 1,
            value: direction === 'proposed-removal' ? moved : removed,
          })
        ).status(),
      ).toBe(200);
      expect((await send('save', { version: 1, operationId: 'other' })).status()).toBe(200);
      const state = await read();
      expect(
        (
          await post('resolve', {
            version: state.draft.version,
            choice: 'proposed',
            conflict: {
              kind: 'relationshipType',
              id: 'storage',
              current: state.relationshipTypes.find(({ id }) => id === 'storage'),
            },
          })
        ).status(),
      ).toBe(200);
      const after = (await read()).draft.relationshipTypes?.[0].after;
      expect(after?.fields?.find(({ id }) => id === 'start')?.sectionId).toBe('service');
      expect(after?.sections).toEqual(definition.sections);
      expect((await save('resolved')).status()).toBe(200);
    } finally {
      await other.dispose();
    }
  },
);

test('conflict resolution places new fields and sections before old items while retaining independent additions', async () => {
  const other = await member();
  try {
    await define();
    await save('initial');
    const added = {
      id: 'own-field',
      name: 'Egen uppgift',
      description: '',
      kind: 'text',
      sectionId: 'own-section',
    };
    await define(
      {
        ...definition,
        sections: [{ id: 'own-section', name: 'Först' }, ...definition.sections],
        fields: [added, ...fields],
      },
      1,
    );
    const send = (route: string, data: unknown) =>
      other.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    expect(
      (
        await send('relationship-type', {
          version: 0,
          id: 'storage',
          baseRevision: 1,
          value: {
            ...definition,
            sections: [...definition.sections, { id: 'other-section', name: 'Senare' }],
            fields: [...fields, { ...added, id: 'other-field', sectionId: 'other-section' }],
          },
        })
      ).status(),
    ).toBe(200);
    expect((await send('save', { version: 1, operationId: 'other' })).status()).toBe(200);
    const state = await read();
    expect(
      (
        await post('resolve', {
          version: state.draft.version,
          choice: 'proposed',
          conflict: {
            kind: 'relationshipType',
            id: 'storage',
            current: state.relationshipTypes.find(({ id }) => id === 'storage'),
          },
        })
      ).status(),
    ).toBe(200);
    const after = (await read()).draft.relationshipTypes?.[0].after;
    expect(after?.sections?.map(({ id }) => id)).toEqual([
      'own-section',
      'facts',
      'service',
      'other-section',
    ]);
    expect(after?.fields?.map(({ id }) => id)).toEqual([
      'own-field',
      'note',
      'amount',
      'start',
      'active',
      'other-field',
    ]);
    expect((await save('resolved')).status()).toBe(200);
  } finally {
    await other.dispose();
  }
});

test('undo retains a currently hidden field while restoring missing historical fields and section names', async () => {
  await define();
  expect(
    (
      await post('relationship', {
        version: (await read()).draft.version,
        id: 'edge',
        baseRevision: null,
        value: {
          typeId: 'storage',
          sourceId: 'bike',
          targetId: 'garage',
          knowledge: 'known',
          customValues: { ...values, start: '2026-09-27' },
        },
      })
    ).status(),
  ).toBe(200);
  await save('initial');
  await post('relationship', {
    version: (await read()).draft.version,
    id: 'edge',
    baseRevision: 1,
    value: null,
  });
  const { receipt } = await (await save('removed')).json();
  await define(
    {
      ...definition,
      sections: [{ id: 'facts', name: 'Dagens uppgifter' }],
      fields: [{ ...fields[0], sectionId: '' }],
    },
    1,
  );
  await save('current');
  expect(
    (
      await post('undo', {
        version: (await read()).draft.version,
        operationId: receipt.operationId,
        userId: receipt.userId,
      })
    ).status(),
  ).toBe(200);
  const state = await read();
  expect(state.draft.relationshipTypes?.[0].after).toMatchObject({
    sections: [{ id: 'facts', name: 'Dagens uppgifter' }],
    fields: [{ ...fields[0], sectionId: '' }, fields[1], fields[3], fields[2]],
  });
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        choice: 'proposed',
        conflict: {
          kind: 'relationshipType',
          id: 'storage',
          current: state.relationshipTypes.find(({ id }) => id === 'storage'),
        },
      })
    ).status(),
  ).toBe(200);
  expect((await save('restored')).status()).toBe(200);
  expect((await read()).relationships[0].customValues).toEqual({ ...values, start: '2026-09-27' });
});

test('undo rejects an overlapping private presentation edit without changing either definition', async () => {
  await define();
  await save('initial');
  const hidden = { ...definition, fields: fields.map((field) => ({ ...field, sectionId: '' })) };
  await define(hidden, 1);
  const { receipt } = await (await save('hidden')).json();
  await define(definition, 2);
  const before = await read();
  const response = await post('undo', {
    version: before.draft.version,
    operationId: receipt.operationId,
    userId: receipt.userId,
  });
  expect(response.status()).toBe(409);
  expect(await response.json()).toEqual({ error: 'undo_draft_overlap' });
  expect(await read()).toEqual(before);
});
