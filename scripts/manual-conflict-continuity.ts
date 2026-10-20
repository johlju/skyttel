import assert from 'node:assert/strict';
import { createInterface } from 'node:readline';
import { type APIRequestContext, chromium } from '@playwright/test';
import { conflictBasis } from '../src/shared/conflict-properties.js';
import { draftConflicts } from '../src/shared/draft-conflicts.js';
import type { MapState, ObjectType, RelationshipType } from '../src/shared/map.js';
import {
  downloadConflictArchive,
  importConflictArchive,
  prepareArchiveConflict,
} from '../tests/support/conflict-archive.js';
import {
  prepareConflictContinuity,
  prepareConflictReferenceContinuity,
  prepareConflictTypeContinuity,
  resolveConflictElsewhere,
  saveConflictElsewhere,
  saveNewerConflictType,
} from '../tests/support/conflict-continuity.js';
import type { conflictCollaborators } from '../tests/support/conflict-properties.js';
import {
  prepareOwnRemovalConflict,
  prepareRelationshipSpecialConflict,
  prepareRemovedObjectConflict,
} from '../tests/support/conflict-special.js';

// Only transport delivery is controlled. All data and results use public HTTP and real SQLite.
const endpointIndex = process.argv.indexOf('--browser-ws');
const browserEndpoint = endpointIndex === -1 ? undefined : process.argv[endpointIndex + 1];
if (endpointIndex !== -1 && (!browserEndpoint || !/^wss?:\/\//.test(browserEndpoint)))
  throw new Error('--browser-ws requires the supplied Chromium DevTools WebSocket endpoint.');
const browser = browserEndpoint
  ? await chromium.connectOverCDP(browserEndpoint)
  : await chromium.launch({
      channel: process.argv.includes('--chrome') ? 'chrome' : undefined,
      headless: process.argv.includes('--headless'),
    });
console.log(
  `Browser: ${process.argv.includes('--chrome') ? 'Chrome' : 'Chromium'} ${browser.version()}`,
);
let page = await browser.newPage();
let other = await browser.newContext();
let app: Awaited<ReturnType<typeof conflictCollaborators>> | undefined;
let historicalDefinition: ObjectType | RelationshipType | undefined;
let previousDefinitionReview: Record<string, unknown> | undefined;
const preparations = {
  'new-base': () => prepareConflictContinuity(page.request, other.request),
  'new-two': () => prepareConflictContinuity(page.request, other.request),
  'new-type': () => prepareConflictTypeContinuity(page.request, other.request),
  'new-reference': () => prepareConflictReferenceContinuity(page.request, other.request),
  'new-removed-object': () => prepareRemovedObjectConflict(page.request, other.request),
  'new-removed-relationship': () =>
    prepareRelationshipSpecialConflict(page.request, other.request, 'removed'),
  'new-duplicate': () =>
    prepareRelationshipSpecialConflict(page.request, other.request, 'duplicate'),
  'new-missing-endpoint': () =>
    prepareRelationshipSpecialConflict(page.request, other.request, 'missing-endpoint'),
  'new-edited-missing-endpoint': () =>
    prepareRelationshipSpecialConflict(page.request, other.request, 'edited-missing-endpoint'),
  'new-own-removal': () => prepareOwnRemovalConflict(page.request, other.request),
  'new-connections': () => prepareOwnRemovalConflict(page.request, other.request, 'connections'),
  'new-combined-removal': () =>
    prepareOwnRemovalConflict(page.request, other.request, 'facts-and-connections'),
  'new-missing-object-type': () =>
    prepareArchiveConflict(other.request, page.request, 'missing-object-type'),
  'new-missing-relationship-type': () =>
    prepareArchiveConflict(other.request, page.request, 'missing-relationship-type'),
  'new-multiple-blockers': () =>
    prepareArchiveConflict(other.request, page.request, 'missing-relationship-type', {
      missingEndpoint: true,
    }),
  'new-no-removed-object-definition': () =>
    prepareArchiveConflict(other.request, page.request, 'missing-object-definition'),
  'new-no-removed-relationship-definition': () =>
    prepareArchiveConflict(other.request, page.request, 'missing-relationship-definition'),
  'new-object-restoration': () =>
    prepareArchiveConflict(other.request, page.request, 'removed-object-definition'),
  'new-relationship-restoration': () =>
    prepareArchiveConflict(other.request, page.request, 'removed-relationship-definition'),
  'new-restoration-two': () =>
    prepareArchiveConflict(other.request, page.request, 'removed-object-definition', {
      administratorDefinitionProposal: true,
    }),
};
let input: ReturnType<typeof createInterface> | undefined;
let hold = false;
let delivery: 'normal' | 'lost' | 'unsent' = 'normal';
let release: (() => void) | undefined;
let kind = 'new-base';
process.once('SIGINT', () => input?.close());
process.once('SIGTERM', () => input?.close());
async function fresh(command: keyof typeof preparations) {
  console.log(`Preparing: ${command}`);
  release?.();
  hold = false;
  delivery = 'normal';
  await page.unroute('**/map');
  await page.goto('about:blank');
  console.log(`Browser cleared: ${command}`);
  if (app) {
    // A new installation retires both old sessions and their HTTP socket pools.
    await page.context().close();
    await other.close();
    await app.installation.close();
    page = await browser.newPage();
    other = await browser.newContext();
    await installDeliveryControl();
  }
  console.log(`Previous installation closed: ${command}`);
  kind = command;
  const prepared: Awaited<ReturnType<typeof conflictCollaborators>> & {
    historicalType?: ObjectType | RelationshipType;
  } = await preparations[command]();
  app = prepared;
  console.log(`Installation prepared: ${command}`);
  historicalDefinition = prepared.historicalType;
  previousDefinitionReview = undefined;
  if (command === 'new-two') {
    const state = await app.read();
    const value = {
      typeId: state.types[0].id,
      name: 'Min musiktjänst',
      properties: [
        { id: 'description', label: 'Beskrivning', kind: 'text' as const, value: 'Min tjänst' },
      ],
    };
    await app.propose(page.request, 'draft', 'service', value);
    await app.propose(other.request, 'draft', 'service', {
      ...value,
      name: 'Vår musiktjänst',
      properties: [
        { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Robins tjänst' },
      ],
    });
    await app.save(other.request, 'second-conflict');
  }
  await page.goto(app.installation.origin);
  console.log(`Ready: ${command}, ${app.installation.origin}`);
}
async function rejectedWithoutChanges(
  prepared: NonNullable<typeof app>,
  client: APIRequestContext,
  route: string,
  body: unknown,
  label: string,
) {
  const current = async () => ({
    member: await (await page.request.get(prepared.path)).json(),
    administrator: await (await other.request.get(prepared.path)).json(),
    history: await readHistory(prepared),
  });
  const before = await current();
  const response = await prepared.post(client, route, body);
  assert.equal(response.status(), 409, await response.text());
  assert.deepEqual(await current(), before);
  console.log(`${label}: HTTP 409; both private drafts, shared facts and history unchanged.`);
}
async function readHistory(prepared: NonNullable<typeof app>) {
  // Archive fixtures put Robin in the window and Alex in the other session.
  const client = historicalDefinition ? other.request : page.request;
  const response = await client.get(`${prepared.path}/history`);
  assert.equal(response.status(), 200, await response.text());
  const document = await response.json();
  assert.ok(Array.isArray(document.history), 'Missing actual administrator history');
  return document;
}
async function installDeliveryControl() {
  await page.route('**/map/resolve', async (route) => {
    if (hold) {
      console.log('Request held before delivery. Use release.');
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      release = undefined;
    }
    if (delivery === 'unsent') return route.abort();
    const response = await route.fetch();
    if (delivery === 'lost') await route.abort();
    else await route.fulfill({ response });
  });
}
try {
  await installDeliveryControl();
  await fresh('new-base');
  console.log(
    `Commands: ${Object.keys(preparations).join(', ')}, remove-new-connection, probe-unavailable-restoration, newer-name, newer-type, newer-reference, newer-private, newer-definition, reimport-restoration, probe-definition-guards, probe-reused-definition, forge-restoration, try-restoration-save, resolve-elsewhere, save-elsewhere, hold, release, lose-applied, lose-unsent, check-error, network-ok, restart, result, quit`,
  );
  input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const command of input) {
    if (command === 'quit') break;
    if (Object.hasOwn(preparations, command)) await fresh(command as keyof typeof preparations);
    else if (command === 'hold') hold = true;
    else if (command === 'release') {
      hold = false;
      release?.();
    } else if (command === 'lose-applied') delivery = 'lost';
    else if (command === 'lose-unsent') delivery = 'unsent';
    else if (command === 'check-error') await page.route('**/map', (route) => route.abort());
    else if (command === 'network-ok') {
      delivery = 'normal';
      await page.unroute('**/map');
    } else if (app && command === 'restart') {
      await app.installation.restart();
      console.log(`Restarted: ${kind}, ${app.installation.origin}`);
    } else if (app && command === 'remove-new-connection' && kind === 'new-combined-removal') {
      await app.propose(other.request, 'relationship', 'new-edge', null);
      assert.equal((await app.save(other.request, 'remove-only-connection')).status(), 200);
      console.log('Only the new connection was removed; changed saved object facts remain.');
    } else if (
      app &&
      command === 'probe-unavailable-restoration' &&
      kind.startsWith('new-no-removed-')
    ) {
      const state = await app.read();
      const conflict = draftConflicts(state).find(
        (conflict) =>
          conflict.kind === (kind.includes('relationship') ? 'relationshipType' : 'objectType'),
      );
      if (!conflict) throw new Error('Missing retained definition conflict');
      assert.equal(state.removedDefinitions, undefined);
      await rejectedWithoutChanges(
        app,
        page.request,
        'resolve',
        {
          conflict,
          command: 'definition-choice',
          definitionChoice: 'proposed',
          basis: conflictBasis(state, conflict),
          version: state.draft.version,
          contentVersion: state.contentVersion,
        },
        'Restoration without an actual removed definition',
      );
    } else if (
      app &&
      historicalDefinition &&
      command === 'forge-restoration' &&
      kind.includes('restoration')
    ) {
      const state = await app.read();
      const response = await app.post(
        page.request,
        kind.includes('relationship') ? 'relationship-type' : 'object-type',
        {
          id: historicalDefinition.id,
          version: state.draft.version,
          contentVersion: state.contentVersion,
          baseRevision: null,
          value: {
            name: 'Förfalskat återställningsförslag',
            ...('forwardLabel' in historicalDefinition
              ? {
                  forwardLabel: historicalDefinition.forwardLabel,
                  reverseLabel: historicalDefinition.reverseLabel,
                }
              : {}),
          },
          restoration: { contentVersion: state.contentVersion, definition: historicalDefinition },
        },
      );
      console.log(`Ordinary creation response: ${response.status()} ${await response.text()}`);
    } else if (app && command === 'try-restoration-save' && kind.includes('restoration')) {
      const response = await app.save(page.request, 'stale-restoration');
      console.log(`Save response: ${response.status()} ${await response.text()}`);
    } else if (app && command === 'probe-definition-guards' && kind === 'new-restoration-two') {
      const state = await app.read();
      const conflict = draftConflicts(state).find((conflict) => conflict.kind === 'objectType');
      if (!conflict) throw new Error('Missing member definition conflict');
      const review = {
        conflict,
        basis: conflictBasis(state, conflict),
        command: 'definition-choice',
        definitionChoice: 'proposed',
        version: state.draft.version,
        contentVersion: state.contentVersion,
      };
      previousDefinitionReview = review;
      await rejectedWithoutChanges(
        app,
        page.request,
        'resolve',
        { ...review, basis: {} },
        'Incorrect basis',
      );
      await rejectedWithoutChanges(app, other.request, 'resolve', review, 'Other private owner');
    } else if (app && command === 'probe-reused-definition' && previousDefinitionReview) {
      await rejectedWithoutChanges(
        app,
        page.request,
        'resolve',
        previousDefinitionReview,
        'Reused comparison',
      );
    } else if (
      app &&
      command === 'reimport-restoration' &&
      kind.startsWith('new-') &&
      kind.includes('restoration')
    ) {
      await importConflictArchive(
        app,
        other.request,
        await downloadConflictArchive(app, other.request),
      );
    } else if (app && command === 'newer-definition' && kind === 'new-restoration-two') {
      const state: MapState = await (await other.request.get(app.path)).json();
      const conflict = draftConflicts(state).find((conflict) => conflict.kind === 'objectType');
      if (!conflict) throw new Error('Missing administrator definition conflict');
      const reviewed = await app.post(other.request, 'resolve', {
        conflict,
        basis: conflictBasis(state, conflict),
        command: 'definition-choice',
        definitionChoice: 'proposed',
        version: state.draft.version,
        contentVersion: state.contentVersion,
      });
      if (reviewed.status() !== 200) throw new Error('Administrator definition review failed');
      if ((await app.save(other.request, 'other-restoration')).status() !== 200)
        throw new Error('Administrator restoration save failed');
      const current: MapState = await (await other.request.get(app.path)).json();
      const type = current.types.find((type) => type.id === conflict.id);
      if (!type) throw new Error('Missing current definition');
      await rejectedWithoutChanges(
        app,
        other.request,
        'object-type',
        {
          id: type.id,
          version: current.draft.version,
          contentVersion: current.contentVersion,
          baseRevision: type.revision,
          value: null,
        },
        'Deletion while another private restoration remains',
      );
      const staged = await app.post(other.request, 'object-type', {
        id: type.id,
        version: current.draft.version,
        contentVersion: current.contentVersion,
        baseRevision: type.revision,
        value: {
          name: 'Ny gemensam typbenämning',
          description: type.description,
        },
      });
      if (
        staged.status() !== 200 ||
        (await app.save(other.request, 'newer-active-definition')).status() !== 200
      )
        throw new Error('Newer definition save failed');
    } else if (app && command === 'newer-name') {
      const saved = (await app.read()).objects.find(({ id }) => id === 'lo');
      if (!saved) throw new Error('Missing fixture object');
      await app.propose(other.request, 'draft', 'lo', { ...saved, name: 'Lo Ås' });
      await app.save(other.request, 'newer-name');
    } else if (app && command === 'newer-type' && kind === 'new-type') {
      await saveNewerConflictType(app, other.request);
    } else if (app && command === 'newer-reference' && kind === 'new-reference') {
      const saved = (await app.read()).objects.find(({ id }) => id === 'service');
      if (!saved) throw new Error('Missing fixture reference');
      await app.propose(other.request, 'draft', 'service', { ...saved, name: 'Ny musiktjänst' });
      await app.save(other.request, 'newer-reference');
    } else if (app && command === 'newer-private') {
      const state = await app.read();
      await app.propose(page.request, 'draft', 'independent', {
        typeId: state.types[0].id,
        name: 'Privat stol',
      });
    } else if (app && command === 'resolve-elsewhere' && kind === 'new-base') {
      await resolveConflictElsewhere(app, page.request);
    } else if (app && command === 'save-elsewhere' && kind === 'new-base') {
      await saveConflictElsewhere(app, page.request);
    } else if (app && command === 'result') {
      console.log(
        JSON.stringify(
          {
            map: await app.read(),
            history: await readHistory(app),
          },
          null,
          2,
        ),
      );
    } else console.log('Unknown command or incompatible fixture.');
  }
} finally {
  release?.();
  input?.close();
  await browser.close();
  await app?.installation.close();
}
