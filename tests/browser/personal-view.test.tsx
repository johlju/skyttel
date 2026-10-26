import { cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, onTestFinished, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { FormLeaveProvider } from '../../src/client/FormLeave.js';
import { HouseholdMap } from '../../src/client/HouseholdMap.js';
import { openMap, openTable } from '../support/workspace-browser.js';
import '../../src/client/styles.css';
import { defaultViewSettings, type PersonalView } from '../../src/shared/personal-view.js';

const state = {
  userId: 'alex',
  contentVersion: 1,
  types: [{ id: 'person', householdId: 'home', revision: 1, name: 'Person', description: '' }],
  relationshipTypes: [],
  relationships: [],
  objects: [
    {
      id: 'lamp',
      householdId: 'home',
      typeId: 'person',
      revision: 1,
      name: 'Lampan',
    },
  ],
  draft: { version: 0, changes: [] },
};

function service(mapState = state) {
  let view: PersonalView = {
    contentVersion: 1,
    positions: [],
    settings: { ...defaultViewSettings, background: false, version: 0 },
  };
  let failure: 'network' | 'conflict' | 'denied' | 'uncertain' | null = null;
  let readFailure = false;
  let initialFailure = false;
  let pending: Promise<void> | undefined;
  const requests: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    requests.push(url);
    if (url.endsWith('/view')) {
      if (initialFailure || readFailure) throw new Error('Synthetic transport outage');
      if (failure === 'denied') return Response.json({ error: 'forbidden' }, { status: 403 });
      return Response.json(view);
    }
    if (url.includes('/view/')) {
      if (pending) await pending;
      if (failure === 'network') {
        readFailure = true;
        throw new Error('Synthetic transport outage');
      }
      if (failure === 'conflict') {
        failure = null;
        view = {
          contentVersion: 1,
          positions: [{ id: 'lamp', x: 1, y: 4, z: -2, version: 2 }],
          settings: { ...defaultViewSettings, background: false, axisPinned: true, version: 2 },
        };
        return Response.json(
          { error: url.endsWith('position') ? 'position_conflict' : 'view_settings_conflict' },
          { status: 409 },
        );
      }
      if (failure === 'denied') return Response.json({ error: 'forbidden' }, { status: 403 });
      if (failure === 'uncertain')
        return Response.json({ error: 'internal_error' }, { status: 500 });
      const body = JSON.parse(init?.body as string);
      if (url.endsWith('position')) {
        const position = { ...body.position, id: body.id, version: body.version + 1 };
        view = { ...view, contentVersion: 1, positions: [position] };
        return Response.json(position);
      }
      const settings = { ...body.settings, version: body.version + 1 };
      view = { ...view, settings };
      return Response.json(settings);
    }
    if (url.endsWith('/operations')) return Response.json({ operations: [] });
    if (url.includes('/map?')) return Response.json(mapState);
    throw new Error(`Unexpected HTTP request: ${url}`);
  });
  return {
    read: () => view,
    requests,
    fail(value: typeof failure) {
      failure = value;
      readFailure = false;
    },
    initialFailure(value: boolean) {
      initialFailure = value;
    },
    pause(value: Promise<void>) {
      pending = value;
    },
  };
}
function PersonalMap() {
  const [settingsMount, setSettingsMount] = useState<HTMLDivElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <>
      <HouseholdMap
        householdId="home"
        active={!settingsOpen}
        onSettings={() => setSettingsOpen(true)}
        mapSettingsTarget={settingsOpen ? settingsMount : null}
      />
      <section hidden={!settingsOpen} className="settings-screen">
        <h1>Rymdkartan</h1>
        <div ref={setSettingsMount} />
        <button type="button" onClick={() => setSettingsOpen(false)}>
          Tillbaka till kartan
        </button>
      </section>
    </>
  );
}
async function open(selectObject = true) {
  render(
    <FormLeaveProvider>
      <PersonalMap />
    </FormLeaveProvider>,
  );
  if (selectObject)
    await page.getByRole('button', { name: 'Välj objekt: Lampan', exact: true }).click();
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  await page.getByText('Ordna min vy', { exact: true }).click();
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('the public household editor saves personal movement and settings and reloads its latest view', async () => {
  const server = service();
  await open();
  await page.getByRole('button', { name: /^Flytta .+: uppåt$/ }).click();
  await expect
    .element(page.getByText('Din personliga vy är sparad.', { exact: true }))
    .toBeVisible();
  expect(server.read().positions).toHaveLength(1);
  await page.getByRole('button', { name: /^Flytta .+: höger$/ }).click();
  await expect.poll(() => server.read().positions[0].version).toBe(2);
  await page.getByRole('button', { name: 'Visa verktygens namn', exact: true }).click();
  await page.getByRole('button', { name: 'Inställningar', exact: true }).click();
  await page.getByLabelText('Visa bakgrund', { exact: true }).click();
  await expect.poll(() => server.read().settings.background).toBe(true);
  await page.getByRole('button', { name: 'Tillbaka till kartan', exact: true }).click();
  await expect
    .element(page.getByRole('button', { name: 'Visa verktygens namn', exact: true }))
    .toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Läs in min aktuella vy', exact: true }).click();
  await expect
    .element(page.getByText('Aktuell personlig vy är inläst.', { exact: true }))
    .toBeVisible();
  await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
  await page.getByRole('button', { name: 'Återställ vy', exact: true }).click();
  expect(server.read().settings.version).toBe(1);
});

test('PLACERING-17: failed personal positions retain recovery outside Navigation after selection and mode changes', async () => {
  const original = { width: window.innerWidth, height: window.innerHeight };
  onTestFinished(() => page.viewport(original.width, original.height));
  for (const viewport of [
    { width: 390, height: 740 },
    { width: 320, height: 250 },
  ]) {
    await page.viewport(viewport.width, viewport.height);
    const server = service({
      ...state,
      objects: [...state.objects, { ...state.objects[0], id: 'bike', name: 'Cykeln' }],
    });
    await open();
    server.fail('uncertain');
    await page.getByRole('button', { name: 'Flytta Lampan: uppåt', exact: true }).click();
    await page.getByRole('button', { name: 'Visa mininavigering', exact: true }).click();
    await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
    await openTable();
    await page
      .getByRole('region', { name: 'Hushållets tabell', exact: true })
      .getByRole('button', { name: 'Cykeln', exact: true })
      .click();
    await openMap();
    const recovery = page.getByRole('group', { name: 'Position för Lampan', exact: true });
    await expect
      .element(recovery.getByText('Positionen är inte sparad', { exact: true }))
      .toBeVisible();
    server.fail(null);
    await recovery.getByRole('button', { name: 'Försök igen', exact: true }).click();
    await expect
      .element(page.getByText('Lampan: Positionen är sparad.', { exact: true }))
      .toBeVisible();
    await openTable();
    await page
      .getByRole('region', { name: 'Hushållets tabell', exact: true })
      .getByRole('button', { name: 'Lampan', exact: true })
      .click();
    await openMap();
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    server.fail('uncertain');
    await page.getByRole('button', { name: 'Flytta Lampan: höger', exact: true }).click();
    await page.getByRole('button', { name: 'Visa normal navigering', exact: true }).click();
    await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
    server.fail(null);
    await recovery.getByRole('button', { name: 'Läs in sparad position', exact: true }).click();
    const result = page.getByText('Lampan: Sparad position är inläst.', { exact: true });
    await expect.element(result).toBeVisible();
    await expect.element(result).toHaveFocus();
    await expect
      .element(page.getByRole('region', { name: 'Osparade personliga positioner' }))
      .not.toBeInTheDocument();
    cleanup();
    vi.unstubAllGlobals();
  }
});

test.each(['position', 'settings'] as const)(
  'concurrent %s automatically saves positions and preserves settings refusal',
  async (kind) => {
    const server = service();
    await open();
    server.fail('conflict');
    if (kind === 'position') await page.getByRole('button', { name: /^Flytta .+: uppåt$/ }).click();
    else {
      await page.getByRole('button', { name: 'Visa verktygens namn', exact: true }).click();
      await page.getByRole('button', { name: 'Inställningar', exact: true }).click();
      await page.getByLabelText('Visa bakgrund', { exact: true }).click();
    }
    if (kind === 'settings')
      await expect
        .poll(() => page.getByRole('status').element().textContent)
        .toContain('Din äldre ändring sparades inte');
    else {
      await expect
        .element(page.getByText('Din personliga vy är sparad.', { exact: true }))
        .toBeVisible();
      expect(server.read().positions[0].version).toBe(3);
    }
    if (kind === 'settings') {
      await expect.element(page.getByLabelText('Visa bakgrund', { exact: true })).not.toBeChecked();
      await page.getByRole('button', { name: 'Tillbaka till kartan', exact: true }).click();
      await expect
        .element(page.getByRole('button', { name: 'Visa verktygens namn', exact: true }))
        .toHaveAttribute('aria-expanded', 'false');
    }
    await expect
      .element(page.getByLabelText('Visa axlar hela tiden', { exact: true }))
      .toBeChecked();
    expect(server.read().settings.background).toBe(false);
    const previous = server.read().positions[0];
    server.fail(null);
    await page.getByRole('button', { name: /^Flytta .+: nedåt$/ }).click();
    await expect
      .poll(() => server.read().positions[0])
      .toEqual({ ...previous, y: previous.y - 1, version: previous.version + 1 });
  },
);

test.each(['network', 'uncertain', 'denied'] as const)(
  'an interrupted personal write handles %s without silently confirming it',
  async (failure) => {
    const server = service();
    await open();
    server.fail(failure);
    await page.getByRole('button', { name: /^Flytta .+: uppåt$/ }).click();
    if (failure === 'denied') {
      await expect
        .element(page.getByRole('alert'))
        .toHaveTextContent(
          'Du har inte längre tillgång. Logga in och kontrollera din tillgång till hushållet.',
        );
      await expect
        .element(page.getByRole('button', { name: 'Välj objekt: Lampan', exact: true }))
        .not.toBeInTheDocument();
    } else {
      await expect
        .element(page.getByText('Positionen är inte sparad', { exact: true }))
        .toBeVisible();
      await expect.element(page.getByRole('button', { name: /^Flytta .+: uppåt$/ })).toBeEnabled();
    }
    expect(server.read().positions).toEqual([]);
  },
);

test('an initial read outage is recoverable and a revoked refresh clears personal content', async () => {
  const server = service();
  server.initialFailure(true);
  await open(false);
  await expect.element(page.getByText(/Din vy kunde inte sparas/)).toBeVisible();
  await page.getByRole('button', { name: 'Läs in min aktuella vy', exact: true }).click();
  server.initialFailure(false);
  await page.getByRole('button', { name: 'Läs in min aktuella vy', exact: true }).click();
  await expect
    .element(page.getByText('Aktuell personlig vy är inläst.', { exact: true }))
    .toBeVisible();
  server.fail('denied');
  await page.getByRole('button', { name: 'Läs in min aktuella vy', exact: true }).click();
  await expect
    .element(page.getByRole('alert'))
    .toHaveTextContent(
      'Du har inte längre tillgång. Logga in och kontrollera din tillgång till hushållet.',
    );
});

test('leaving the editor during an in-flight personal write does not render a late confirmation', async () => {
  const server = service();
  let finish = () => {};
  server.pause(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  await open();
  await page.getByRole('button', { name: /^Flytta .+: uppåt$/ }).click();
  await expect.element(page.getByRole('button', { name: /^Flytta .+: uppåt$/ })).toBeEnabled();
  cleanup();
  finish();
  await expect
    .element(page.getByText('Din personliga vy är sparad.', { exact: true }))
    .not.toBeInTheDocument();
});
