import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { chromium, expect } from '@playwright/test';
import {
  prepareDraftRemovalFocus,
  prepareDraftRemovalMeaning,
  prepareRemovalMember,
} from '../tests/support/draft-removal.js';
import { prepareDraftReview } from '../tests/support/draft-review.js';
import { createInstallation } from '../tests/support/installation.js';
import { readRemovalHistory, readRemovalProposals } from '../tests/support/removal-reading.js';

// Only delivery is controlled; every proposal and discard uses public HTTP and real SQLite.
let app = await createInstallation();
const browser = await chromium
  .launch({
    channel: process.argv.includes('--chrome') ? 'chrome' : undefined,
    headless: process.argv.includes('--headless'),
  })
  .catch(async (failure) => {
    await app.close();
    throw failure;
  });
const page = await browser.newPage();
console.log(
  `Browser: ${process.argv.includes('--chrome') ? 'Chrome' : 'Chromium'} ${browser.version()}`,
);
let input: ReturnType<typeof createInterface> | undefined;
let data!: Awaited<ReturnType<typeof prepareDraftReview>>;
let hold = false;
let lostResponse = false;
let unsent = false;
let release: (() => void) | undefined;
let prepared = false;
let member: Awaited<ReturnType<typeof prepareRemovalMember>> | undefined;
process.once('SIGINT', () => input?.close());
process.once('SIGTERM', () => input?.close());
async function fresh(kind: string) {
  await member?.context.close();
  member = undefined;
  release?.();
  hold = lostResponse = unsent = false;
  if (prepared) {
    await page.goto('about:blank');
    await app.close();
    app = await createInstallation();
  }
  prepared = true;
  data =
    kind === 'new-focus'
      ? await prepareDraftRemovalFocus(page.request, app.origin)
      : kind === 'new-object-meaning' || kind === 'new-relationship-meaning'
        ? await prepareDraftRemovalMeaning(
            page.request,
            app.origin,
            kind === 'new-object-meaning' ? 'objectType' : 'relationshipType',
          )
        : await prepareDraftReview(page.request, app.origin);
  await page.goto(`${app.origin}/households/${data.household.id}`);
}
async function command(command: string) {
  if (['new-base', 'new-focus', 'new-object-meaning', 'new-relationship-meaning'].includes(command))
    await fresh(command);
  else if (command === 'other-member') {
    await member?.context.close();
    member = await prepareRemovalMember(browser, page.request, app, data.household.id);
    console.log('Robin: separate admitted session and full native private proposal ready.');
  } else if (command === 'newer-type')
    await data.post('object-type', {
      id: 'newer-independent-type',
      baseRevision: null,
      value: { name: 'Nyare oberoende typ', description: '' },
    });
  else if (command === 'hold') hold = true;
  else if (command === 'release') {
    hold = false;
    release?.();
  } else if (command === 'lost-response') lostResponse = true;
  else if (command === 'lost-unsent') unsent = true;
  else if (command === 'network-ok') lostResponse = unsent = false;
  else if (command === 'result')
    console.log(
      JSON.stringify(
        {
          map: await data.read(),
          history: await (await page.request.get(`${data.path}/history`)).json(),
        },
        null,
        2,
      ),
    );
  else if (command === 'screen')
    await page.screenshot({ path: '/tmp/skyttel-draft-removal.png', fullPage: true });
  else console.log('Unknown command.');
}

try {
  await page.route('**/map/discard-review', async (route) => {
    if (!route.request().postDataJSON().confirmation) return route.continue();
    if (unsent) return route.abort();
    const response = await route.fetch();
    if (hold) {
      console.log('Removal applied; reply held. Use release.');
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      release = undefined;
    }
    if (lostResponse) await route.abort();
    else await route.fulfill({ response });
  });
  await fresh('new-base');
  console.log(
    'Commands: new-base, new-focus, new-object-meaning, new-relationship-meaning, other-member, newer-type, hold, release, lost-response, lost-unsent, network-ok, result, screen, quit',
  );
  if (process.argv.includes('--smoke')) {
    await command('new-focus');
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    await readRemovalProposals(page, await data.read());
    const focusControls = page
      .getByRole('region', { name: 'Utkastet', exact: true })
      .getByRole('button', { name: /^Ta bort förslaget:/ });
    await expect(focusControls).toHaveCount(2);
    await focusControls.last().click();
    await focusControls.first().click();
    await expect(page.getByRole('region', { name: 'Utkastet', exact: true })).toContainText(
      'Utkastet är tomt',
    );
    await readRemovalHistory(page);
    console.log('Smoke empty: native empty draft and complete saved/history readback.');
    await command('new-base');
    await command('other-member');
    if (!member) throw new Error('Missing independent member preparation');
    const before = await data.read();
    const history = await (await page.request.get(`${data.path}/history`)).json();
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    await readRemovalProposals(page, before);
    await member.assertPrivate(page, before);
    await command('lost-unsent');
    await page
      .getByRole('button', { name: 'Ta bort förslaget: Olöst fordon', exact: true })
      .click();
    const single = page.getByRole('dialog', {
      name: 'Ta bort förslaget och dess beroenden?',
      exact: true,
    });
    await expect(single.getByRole('alert')).toContainText('Borttagningen kunde inte bekräftas');
    await expect(single.getByRole('button', { name: 'Ta bort', exact: true })).toBeDisabled();
    expect(await data.read()).toEqual(before);
    await page.keyboard.press('Escape');
    await readRemovalProposals(page, before);
    await page.getByRole('button', { name: 'Kontrollera borttagningen', exact: true }).click();
    await member.assertUnchanged();
    await member.assertPrivate(page, await data.read());
    await single.getByRole('button', { name: 'Hämta aktuellt utkast', exact: true }).click();
    await expect(single.getByRole('button', { name: 'Ta bort', exact: true })).toBeEnabled();
    expect(await data.read()).toEqual(before);
    await member.assertUnchanged();
    await member.assertPrivate(page, await data.read());
    await command('network-ok');
    await single.getByRole('button', { name: 'Ta bort', exact: true }).click();
    await expect(single).toHaveCount(0);
    const absentAfter = await data.read();
    expect(absentAfter.draft).toEqual({
      ...before.draft,
      version: before.draft.version + 1,
      changes: before.draft.changes.filter(({ id }) => id !== 'draft-unresolved'),
    });
    expect(absentAfter.objects).toEqual(before.objects);
    expect(absentAfter.relationships).toEqual(before.relationships);
    expect(await (await page.request.get(`${data.path}/history`)).json()).toEqual(history);
    await readRemovalProposals(page, absentAfter);
    await member.assertUnchanged();
    await member.assertPrivate(page, absentAfter);
    await readRemovalHistory(page);
    console.log(
      'Smoke absent: complete unchanged draft before actual check and one fresh native removal.',
    );
    await command('new-base');
    const appliedBefore = await data.read();
    const appliedHistory = await (await page.request.get(`${data.path}/history`)).json();
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    await readRemovalProposals(page, appliedBefore);
    await command('lost-response');
    await page.getByRole('button', { name: 'Kasta hela utkastet', exact: true }).click();
    const all = page.getByRole('dialog', { name: 'Ta bort hela utkastet?', exact: true });
    await all.getByRole('button', { name: 'Ta bort hela utkastet', exact: true }).click();
    await expect(all.getByRole('alert')).toContainText('Borttagningen kunde inte bekräftas');
    await expect(
      all.getByRole('button', { name: 'Ta bort hela utkastet', exact: true }),
    ).toBeDisabled();
    await all.getByRole('button', { name: 'Hämta aktuellt utkast', exact: true }).click();
    await expect(all).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Utkastet', exact: true })).toContainText(
      'Utkastet är tomt',
    );
    const appliedAfter = await data.read();
    expect(appliedAfter.objects).toEqual(appliedBefore.objects);
    expect(appliedAfter.relationships).toEqual(appliedBefore.relationships);
    expect(appliedAfter.types).toEqual(appliedBefore.types);
    expect(appliedAfter.relationshipTypes).toEqual(appliedBefore.relationshipTypes);
    expect(await (await page.request.get(`${data.path}/history`)).json()).toEqual(appliedHistory);
    await readRemovalHistory(page);
    await command('network-ok');
    await command('release');
    console.log(
      'Smoke applied: full pre-removal values, truthful lost reply, complete saved/history preservation.',
    );
  } else {
    input = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const commandLine of input) {
      if (commandLine === 'quit') break;
      await command(commandLine);
    }
  }
} finally {
  release?.();
  input?.close();
  await member?.context.close();
  await browser.close();
  await app.close();
  expect(existsSync(app.directory)).toBe(false);
  console.log('Closed: temporary installation removed.');
}
