import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { MapState, ObjectType, SaveReceipt } from '../../../src/shared/map.js';
import { createHousehold, restartWithSession, signIn } from '../../support/client.js';
import { createInstallation, robin } from '../../support/installation.js';

let installation: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
let path: string;
const read = async (): Promise<MapState> => (await client.get(path)).json();
const post = (route: string, data: unknown) =>
  client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
const definition: Pick<
  ObjectType,
  'name' | 'description' | 'fields' | 'sections' | 'builtins' | 'propertyOrder'
> = {
  name: 'Husavtal',
  description: '',
  sections: [
    { id: 'facts', name: 'Uppgifter' },
    { id: 'dates', name: 'Datum' },
  ],
  fields: [
    { id: 'note', name: 'Egen anteckning', description: '', kind: 'text', sectionId: 'facts' },
  ],
  builtins: [
    { key: 'description', name: 'Avtalstext', sectionId: 'facts' },
    { key: 'debt', name: 'Skuld', sectionId: 'facts' },
    { key: 'startDate', name: 'Avtalsstart', sectionId: 'dates' },
  ],
  propertyOrder: ['builtin:description', 'field:note', 'builtin:debt', 'builtin:startDate'],
};
const financialFacts = {
  debt: { knowledge: 'uncertain', value: '12 300', reportedOn: '2026-09-01' },
  price: { knowledge: 'unknown' },
  currency: { knowledge: 'none' },
  startDate: { knowledge: 'known', value: '2026-08-01' },
  usedCredit: { knowledge: 'none', reportedOn: '2026-09-02' },
};
const define = async (value: unknown = definition) => {
  const state = await read();
  return post('object-type', {
    version: state.draft.version,
    id: 'contract',
    baseRevision: state.types.find(({ id }) => id === 'contract')?.revision ?? null,
    value,
  });
};
async function save(operationId: string): Promise<SaveReceipt> {
  const response = await post('save', { version: (await read()).draft.version, operationId });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()).receipt;
}
async function object(id = 'loan') {
  const state = await read();
  expect(
    (
      await post('draft', {
        version: state.draft.version,
        id,
        baseRevision: null,
        value: {
          typeId: 'contract',
          name: 'Husets lån',
          description: 'Gemensam text',
          financialFacts,
          customValues: { note: 'Bevarat' },
        },
      })
    ).status(),
  ).toBe(200);
}
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

test('canonical presentation and complete facts survive atomic receipt, restart and older-client omission', async () => {
  expect((await define()).status()).toBe(200);
  await object();
  const before = await read();
  expect(before.objects).toEqual([]);
  expect(before.types.some(({ id }) => id === 'contract')).toBe(false);
  const receipt = await save('initial');
  expect(receipt.objectTypes?.[0].after).toMatchObject(definition);
  expect(receipt.changes[0]).toMatchObject({
    type: definition,
    after: { financialFacts, description: 'Gemensam text' },
  });
  client = await restartWithSession(client, () => installation.restart());
  expect((await read()).types.find(({ id }) => id === 'contract')).toMatchObject(definition);
  const shared = (await read()).objects[0];
  expect(shared.financialFacts).toEqual(financialFacts);
  expect(shared.financialFacts).not.toHaveProperty('endDate');
  expect(
    (
      await define({
        name: 'Äldre klient',
        description: 'Ny typtext',
        fields: definition.fields?.map(({ sectionId: _section, ...field }) => field),
      })
    ).status(),
  ).toBe(200);
  expect((await read()).draft.objectTypes?.[0].after).toMatchObject({
    builtins: definition.builtins,
    propertyOrder: definition.propertyOrder,
    sections: definition.sections,
  });
  await save('older-client');
  expect((await read()).objects[0]).toEqual(shared);
});

test('older clients can insert, reorder and remove custom definitions while canonical references remain anchored', async () => {
  await define();
  const receipt = await save('initial');
  const added = {
    id: 'new',
    name: 'Ny anteckning',
    description: '',
    kind: 'text',
    sectionId: 'facts',
  };
  const omitted = {
    name: definition.name,
    description: '',
    sections: definition.sections,
    fields: [added, ...(definition.fields ?? [])],
  };
  expect((await define(omitted)).status()).toBe(200);
  let type = (await read()).draft.objectTypes?.[0].after;
  expect(type?.builtins).toEqual(definition.builtins);
  expect(type?.propertyOrder).toEqual([
    'builtin:description',
    'field:new',
    'field:note',
    'builtin:debt',
    'builtin:startDate',
  ]);
  await save('inserted');
  expect(
    (await define({ ...omitted, fields: [...(definition.fields ?? []), added] })).status(),
  ).toBe(200);
  type = (await read()).draft.objectTypes?.[0].after;
  expect(type?.propertyOrder).toEqual([
    'builtin:description',
    'field:note',
    'builtin:debt',
    'builtin:startDate',
    'field:new',
  ]);
  await save('reordered');
  expect((await define({ ...omitted, fields: [added] })).status()).toBe(200);
  type = (await read()).draft.objectTypes?.[0].after;
  expect(type?.propertyOrder).toEqual([
    'builtin:description',
    'builtin:debt',
    'builtin:startDate',
    'field:new',
  ]);
  expect(type?.builtins).toEqual(definition.builtins);
  await save('removed');
  expect(
    (
      await post('undo', {
        version: (await read()).draft.version,
        operationId: 'removed',
        userId: receipt.userId,
      })
    ).status(),
  ).toBe(200);
  expect((await read()).draft.objectTypes?.[0].after?.propertyOrder).toEqual([
    'builtin:description',
    'field:note',
    'builtin:debt',
    'builtin:startDate',
    'field:new',
  ]);
  await save('restore-field');
  client = await restartWithSession(client, () => installation.restart());
  expect((await read()).types.find(({ id }) => id === 'contract')?.builtins).toEqual(
    definition.builtins,
  );
});

test('older-client label edits retain an explicit mixed order when custom membership and order are unchanged', async () => {
  const arranged = {
    ...definition,
    fields: [
      ...(definition.fields ?? []),
      {
        id: 'extra',
        name: 'Extra fält',
        description: '',
        kind: 'text',
        sectionId: 'facts',
      },
    ],
    propertyOrder: [
      'builtin:debt',
      'field:extra',
      'builtin:description',
      'field:note',
      'builtin:startDate',
    ],
  };
  expect((await define(arranged)).status()).toBe(200);
  await save('arranged');
  expect(
    (
      await define({
        name: 'Äldre klient rättar namn',
        description: '',
        fields: arranged.fields,
        sections: arranged.sections,
      })
    ).status(),
  ).toBe(200);
  expect((await read()).draft.objectTypes?.[0].after).toMatchObject({
    builtins: arranged.builtins,
    propertyOrder: arranged.propertyOrder,
  });
  await save('label-only');
  client = await restartWithSession(client, () => installation.restart());
  expect((await read()).types.find(({ id }) => id === 'contract')?.propertyOrder).toEqual(
    arranged.propertyOrder,
  );
});

test('invalid canonical keys, kinds, duplicate references and relationship properties reject atomically', async () => {
  const before = await read();
  for (const value of [
    { ...definition, builtins: null },
    { ...definition, builtins: [{ key: 'name', name: 'Namn', sectionId: 'facts' }] },
    { ...definition, builtins: [{ key: 'price', name: 'Pris', sectionId: 'missing' }] },
    {
      ...definition,
      builtins: [{ key: 'debt', name: 'Skuld', sectionId: 'facts', kind: 'number' }],
    },
    { ...definition, builtins: [definition.builtins?.[0], definition.builtins?.[0]] },
    { ...definition, propertyOrder: ['builtin:description', 'builtin:description'] },
    {
      ...definition,
      propertyOrder: ['builtin:description', 'field:debt', 'builtin:debt', 'builtin:startDate'],
    },
    { ...definition, propertyOrder: ['builtin:description'] },
    { ...definition, fields: [{ ...definition.fields?.[0], builtin: 'debt' }] },
  ]) {
    expect((await define(value)).status(), JSON.stringify(value)).toBe(400);
    expect(await read()).toEqual(before);
  }
  expect(
    (
      await post('relationship-type', {
        version: 0,
        id: 'edge',
        baseRevision: null,
        value: {
          name: 'Avtalspart',
          description: '',
          forwardLabel: 'Har',
          reverseLabel: 'Tillhör',
          builtins: [],
        },
      })
    ).status(),
  ).toBe(400);
  expect(await read()).toEqual(before);
  expect((await define()).status()).toBe(200);
  for (const invalid of [
    { name: '', description: '' },
    {
      name: 'Fel',
      description: '',
      financialFacts: { debt: { knowledge: 'known', value: '10', reportedOn: '2026-02-30' } },
    },
    {
      name: 'Fel',
      description: '',
      financialFacts: { price: { knowledge: 'known', value: '10', reportedOn: '2026-09-01' } },
    },
    { name: 'Fel', description: '', customValues: { debt: 10 } },
  ])
    expect(
      (
        await post('draft', {
          version: 1,
          id: 'invalid',
          baseRevision: null,
          value: { typeId: 'contract', ...invalid },
        })
      ).status(),
    ).toBe(400);
  expect(
    (
      await post('draft', {
        version: 1,
        id: 'unresolved',
        baseRevision: null,
        value: {
          typeId: 'contract',
          name: 'Vilket avtal',
          description: '',
          identity: 'unresolved',
        },
      })
    ).status(),
  ).toBe(200);
  expect((await post('save', { version: 2, operationId: 'unresolved' })).status()).toBe(409);
  expect((await read()).objects).toEqual([]);
});

test('undo reverses mixed order and hiding while retaining independent names, new-before-old entries and whole facts', async () => {
  await define();
  await object();
  await save('initial');
  const arranged = {
    ...definition,
    propertyOrder: ['builtin:debt', 'field:note', 'builtin:description', 'builtin:startDate'],
    builtins: definition.builtins?.map((field) =>
      field.key === 'description' ? { ...field, sectionId: '' } : field,
    ),
  };
  expect((await define(arranged)).status()).toBe(200);
  const receipt = await save('arranged');
  expect(
    (
      await define({
        ...arranged,
        builtins: [
          ...(arranged.builtins ?? []).map((field) =>
            field.key === 'debt' ? { ...field, name: 'Återstående skuld' } : field,
          ),
          { key: 'currency', name: 'Valuta', sectionId: 'facts' },
        ],
        fields: [
          { id: 'new', name: 'Ny anteckning', description: '', kind: 'text', sectionId: 'facts' },
          ...(definition.fields ?? []),
        ],
        propertyOrder: ['builtin:currency', 'field:new', ...(arranged.propertyOrder ?? [])],
      })
    ).status(),
  ).toBe(200);
  await save('independent');
  expect(
    (
      await post('undo', {
        version: (await read()).draft.version,
        operationId: 'arranged',
        userId: receipt.userId,
      })
    ).status(),
  ).toBe(200);
  const proposed = (await read()).draft.objectTypes?.[0].after;
  expect(proposed?.propertyOrder).toEqual([
    'builtin:currency',
    'field:new',
    'builtin:description',
    'field:note',
    'builtin:debt',
    'builtin:startDate',
  ]);
  expect(proposed?.builtins?.find(({ key }) => key === 'debt')?.name).toBe('Återstående skuld');
  expect(proposed?.builtins?.find(({ key }) => key === 'description')?.sectionId).toBe('facts');
  await save('undone');
  expect((await read()).objects[0]).toMatchObject({
    financialFacts,
    description: 'Gemensam text',
    customValues: { note: 'Bevarat' },
  });
});

test.each(['new section', 'deleted by current', 'deleted by proposed'])(
  'definition conflict resolution preserves independent canonical placement: %s',
  async (scenario) => {
    await define();
    await object();
    await save('initial');
    const other = await request.newContext();
    try {
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
      const placement = scenario === 'new section' ? 'new' : 'dates';
      const placed = {
        ...definition,
        sections:
          scenario === 'new section'
            ? [...(definition.sections ?? []), { id: 'new', name: 'Nytt avsnitt' }]
            : definition.sections,
        builtins: definition.builtins?.map((field) =>
          field.key === 'debt' ? { ...field, sectionId: placement } : field,
        ),
      };
      const removed = {
        ...definition,
        sections: [{ id: 'facts', name: 'Gemensamma uppgifter' }],
        builtins: definition.builtins?.map((field) =>
          field.key === 'startDate' ? { ...field, sectionId: '' } : field,
        ),
      };
      const own = scenario === 'deleted by proposed' ? removed : placed;
      const shared = scenario === 'deleted by proposed' ? placed : removed;
      await define(own);
      expect(
        (
          await other.post(`${path}/object-type`, {
            headers: { origin: installation.origin },
            data: { version: 0, id: 'contract', baseRevision: 1, value: shared },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await other.post(`${path}/save`, {
            headers: { origin: installation.origin },
            data: { version: 1, operationId: 'other' },
          })
        ).status(),
      ).toBe(200);
      const stale = await read();
      expect(
        (await post('save', { version: stale.draft.version, operationId: 'stale' })).status(),
      ).toBe(409);
      expect(await read()).toEqual(stale);
      expect(
        (
          await post('resolve', {
            version: stale.draft.version,
            choice: 'proposed',
            conflict: {
              kind: 'objectType',
              id: 'contract',
              current: stale.types.find(({ id }) => id === 'contract'),
            },
          })
        ).status(),
      ).toBe(200);
      const type = (await read()).draft.objectTypes?.[0].after;
      expect(type?.sections).toEqual([
        { id: 'facts', name: 'Gemensamma uppgifter' },
        scenario === 'new section'
          ? { id: 'new', name: 'Nytt avsnitt' }
          : { id: 'dates', name: 'Datum' },
      ]);
      expect(type?.builtins?.find(({ key }) => key === 'debt')?.sectionId).toBe(placement);
      expect(type?.builtins?.find(({ key }) => key === 'startDate')?.sectionId).toBe('');
      await save('resolved');
      expect((await read()).objects[0].financialFacts).toEqual(financialFacts);
    } finally {
      await other.dispose();
    }
  },
);

test('restoring object values keeps present hidden presentation while restoring a deleted type recovers its canonical layout', async () => {
  await define();
  await object();
  await save('initial');
  expect(
    (
      await post('draft', {
        version: (await read()).draft.version,
        id: 'loan',
        baseRevision: 1,
        value: null,
      })
    ).status(),
  ).toBe(200);
  const deleted = await save('deleted');
  expect(
    (
      await define({
        name: definition.name,
        description: '',
        fields: [],
        sections: [],
        builtins: [],
        propertyOrder: [],
      })
    ).status(),
  ).toBe(200);
  await save('hidden');
  expect(
    (
      await post('undo', {
        version: (await read()).draft.version,
        operationId: 'deleted',
        userId: deleted.userId,
      })
    ).status(),
  ).toBe(200);
  let state = await read();
  expect(state.draft.objectTypes?.[0].after).toMatchObject({
    builtins: [],
    propertyOrder: ['field:note'],
  });
  expect(state.draft.changes[0].after).toMatchObject({
    description: 'Gemensam text',
    financialFacts,
  });
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        choice: 'proposed',
        conflict: {
          kind: 'objectType',
          id: 'contract',
          current: state.types.find(({ id }) => id === 'contract'),
        },
      })
    ).status(),
  ).toBe(200);
  await save('restored-value');
  expect((await read()).objects[0].financialFacts).toEqual(financialFacts);
  expect((await define(definition)).status()).toBe(200);
  await save('shown');
  state = await read();
  expect(
    (
      await post('draft', {
        version: state.draft.version,
        id: 'loan',
        baseRevision: state.objects[0].revision,
        value: null,
      })
    ).status(),
  ).toBe(200);
  await save('deleted-again');
  expect((await define(null)).status()).toBe(200);
  const typeDeleted = await save('type-deleted');
  expect(
    (
      await post('undo', {
        version: (await read()).draft.version,
        operationId: 'type-deleted',
        userId: typeDeleted.userId,
      })
    ).status(),
  ).toBe(200);
  expect((await read()).draft.objectTypes?.[0].after).toMatchObject(definition);
  await save('type-restored');
  client = await restartWithSession(client, () => installation.restart());
  expect((await read()).types.find(({ id }) => id === 'contract')).toMatchObject(definition);
});

test('undo rejects an overlapping private canonical edit and combines a separate private label edit', async () => {
  await define();
  await object();
  await save('initial');
  const hidden = {
    ...definition,
    builtins: definition.builtins?.map((field) =>
      field.key === 'debt' ? { ...field, sectionId: '' } : field,
    ),
  };
  await define(hidden);
  const receipt = await save('hidden');
  await define({
    ...hidden,
    builtins: hidden.builtins?.map((field) =>
      field.key === 'debt' ? { ...field, sectionId: 'dates' } : field,
    ),
  });
  const privatePlacement = await read();
  expect(
    (
      await post('undo', {
        version: privatePlacement.draft.version,
        operationId: 'hidden',
        userId: receipt.userId,
      })
    ).status(),
  ).toBe(409);
  expect(await read()).toEqual(privatePlacement);
  await define({
    ...hidden,
    builtins: hidden.builtins?.map((field) =>
      field.key === 'debt' ? { ...field, name: 'Min privata etikett' } : field,
    ),
  });
  expect(
    (
      await post('undo', {
        version: (await read()).draft.version,
        operationId: 'hidden',
        userId: receipt.userId,
      })
    ).status(),
  ).toBe(200);
  expect((await read()).draft.objectTypes?.[0].after?.builtins).toContainEqual({
    key: 'debt',
    name: 'Min privata etikett',
    sectionId: 'facts',
  });
  await save('combined');
  client = await restartWithSession(client, () => installation.restart());
  expect((await read()).objects[0].financialFacts).toEqual(financialFacts);
  expect((await read()).types.find(({ id }) => id === 'contract')?.builtins).toContainEqual({
    key: 'debt',
    name: 'Min privata etikett',
    sectionId: 'facts',
  });
});
