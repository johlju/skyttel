import type { APIRequestContext } from '@playwright/test';
import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import { createHousehold, signIn, utilityButton } from '../support/client.js';
import { readCommittedHistoryCard } from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

async function setup(client: APIRequestContext, origin: string) {
  await signIn(client, origin);
  const { household } = await (await createHousehold(client, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await client.get(path)).json();
  const post = (route: string, data: unknown) =>
    client.post(`${path}/${route}`, { headers: { origin }, data });
  const object = async (id: string, name: string, extra = {}) => {
    const state = await read();
    const before = state.objects.find((item) => item.id === id);
    expect(
      (
        await post('draft', {
          version: state.draft.version,
          id,
          baseRevision: before?.revision ?? null,
          value: { typeId: state.types[0].id, ...before, name, ...extra },
        })
      ).ok(),
    ).toBe(true);
  };
  const save = async (operationId: string): Promise<SaveReceipt> => {
    const response = await post('save', { version: (await read()).draft.version, operationId });
    expect(response.ok()).toBe(true);
    return (await response.json()).receipt;
  };
  return { household, path, read, post, object, save };
}

test('HISTORIK-01: Reports preserves table work and lists only completed saves latest first', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const data = await setup(page.request, installation.origin);
    await data.object('person', 'Lo Exempel');
    const initialReceipt = await data.save('initial');
    await data.object('person', 'Lo Lind');
    const renameReceipt = await data.save('rename');
    await data.object('private', 'Privat person');
    const before = await data.read();
    await page.goto(`${installation.origin}/households/${data.household.id}`);
    await (await utilityButton(page, 'Tabell')).click();
    const search = page.getByRole('searchbox', { name: 'Sök objekt i tabellen' });
    await search.fill('Lo Lind');
    await (await utilityButton(page, 'Rapporter')).click();
    const reports = page.getByRole('region', { name: 'Rapporter', exact: true });
    await expect(reports.getByRole('tab').first()).toHaveAccessibleName('Ändringshistorik');
    const history = reports.getByRole('region', { name: 'Ändringshistorik', exact: true });
    await expect(history.getByRole('article')).toHaveCount(2);
    const first = history.getByRole('article').first();
    await expect(first).toContainText('Lo Lind');
    await expect(first).toContainText('Alex Exempel');
    for (const [index, receipt] of [renameReceipt, initialReceipt].entries()) {
      await expect(history.getByRole('article').nth(index)).toHaveAttribute(
        'data-save',
        receipt.operationId,
      );
      await readCommittedHistoryCard(history, receipt);
    }
    await expect(history).not.toContainText('Privat person');
    await first.getByText('Visa ändringarna', { exact: true }).click();
    await expect(first.getByText('Namn: Lo Exempel.', { exact: true })).toBeVisible();
    await expect(first.getByText('Namn: Lo Lind.', { exact: true })).toBeVisible();
    await reports.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('Lo Lind');
    expect((await data.read()).draft).toEqual(before.draft);
  } finally {
    await installation.close();
  }
});

for (const [width, caseId] of [
  [1280, 'HISTORIK-06'],
  [390, 'HISTORIK-14'],
  [320, 'HISTORIK-15'],
] as const) {
  test(`${caseId}: Reports exposes complete historical values with keyboard at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 850 });
      const data = await setup(page.request, installation.origin);
      await data.object('subscription', 'Familjeabonnemang', {
        properties: [
          {
            id: 'description',
            label: 'Beskrivning',
            kind: 'text' as const,
            value: 'Hushållets musik',
          },
          { id: 'debt', label: 'Senast uppgiven skuld', kind: 'text' as const, value: '1 200 SEK' },
          {
            id: 'debt-certainty',
            label: 'Senast uppgiven skuld: uppgiftens säkerhet',
            kind: 'text' as const,
            value: 'Osäkert uppgivet',
          },
          {
            id: 'debt-reportedOn',
            label: 'Senast uppgiven skuld: datum för uppgiften',
            kind: 'date' as const,
            value: '2026-06-01',
          },
        ],
      });
      await data.save('initial');
      await data.object('subscription', 'Musik för familjen');
      await data.save('rename');
      await page.goto(`${installation.origin}/households/${data.household.id}`);
      await (await utilityButton(page, 'Rapporter')).click();
      const history = page.getByRole('region', { name: 'Ändringshistorik', exact: true });
      const card = history.getByRole('article').first();
      await card.getByText('Visa ändringarna', { exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(card.getByText('Namn: Familjeabonnemang.', { exact: true })).toBeVisible();
      await expect(card.getByText('Namn: Musik för familjen.', { exact: true })).toBeVisible();
      for (const side of ['Före sparandet', 'Efter sparandet']) {
        await expect(
          card
            .getByRole('heading', { name: side, exact: true })
            .locator('xpath=following-sibling::ol[1]')
            .getByText('Beskrivning: Hushållets musik (Text)', { exact: true }),
        ).toBeVisible();
      }
      await expect(card).toContainText('1 200');
      await expect(card).toContainText('Osäkert uppgivet');
      await expect(card).toContainText('2026-06-01');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    } finally {
      await installation.close();
    }
  });
}

test('HISTORIK-07: failed and delayed Reports reads preserve newer focus and retry real saves', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const data = await setup(page.request, installation.origin);
    await data.object('person', 'Lo Exempel');
    await data.save('initial');
    await page.goto(`${installation.origin}/households/${data.household.id}`);
    await page.route('**/map/history?**', (route) => route.abort(), { times: 1 });
    await (await utilityButton(page, 'Rapporter')).click();
    await expect(page.getByRole('alert')).toContainText('Historiken kunde inte hämtas');
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      '**/map/history?**',
      async (route) => {
        await waiting;
        await route.continue();
      },
      { times: 1 },
    );
    await page.getByRole('button', { name: 'Hämta historik igen' }).click();
    await expect(
      page.getByRole('heading', { name: 'Ändringshistorik', exact: true }),
    ).toBeFocused();
    const back = page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true });
    await back.focus();
    release();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(back).toBeFocused();
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    await installation.close();
  }
});

test('HISTORIK-10: a direct save link reads historical types after their definitions change', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const data = await setup(page.request, installation.origin);
    await data.object('person', 'Lo Exempel');
    const receipt = await data.save('initial');
    const state = await data.read();
    const type = state.types[0];
    expect(
      (
        await data.post('object-type', {
          version: state.draft.version,
          id: type.id,
          baseRevision: type.revision,
          value: { name: 'Dagens personbenämning', description: type.description },
        })
      ).ok(),
    ).toBe(true);
    await data.save('type-rename');
    await page.goto(
      `${installation.origin}/households/${data.household.id}?report=history&save=${receipt.operationId}&savedBy=${encodeURIComponent(receipt.userId)}`,
    );
    const card = page.getByRole('article').filter({ hasText: 'Sparande: initial' });
    await expect(card.getByText(`Objekttyp: ${type.name}.`, { exact: true })).toBeVisible();
    await expect(card.getByRole('heading', { level: 3 })).toBeFocused();
    await expect(card).not.toContainText('Dagens personbenämning');
    await expect(
      card.getByRole('link', { name: 'Länk till sparandet', exact: true }),
    ).toHaveAttribute('href', /report=history.*save=initial/);
    await expect(page.getByRole('region', { name: 'Samtal med Skyttel', exact: true })).toHaveCount(
      0,
    );
  } finally {
    await installation.close();
  }
});

test('HISTORIK-11: private rejected and pending save attempts never enter shared Reports', async ({
  page,
}) => {
  const installation = await createInstallation();
  let releaseRecovery = () => {};
  try {
    const data = await setup(page.request, installation.origin);
    await data.object('person', 'Lo Exempel');
    await data.save('completed');
    await data.object('private', 'Osparad person');
    const before = await data.read();
    const rejected = await data.post('operations', {
      operationId: 'private-rejected',
      version: before.draft.version - 1,
      contentVersion: before.contentVersion,
    });
    expect(rejected.ok()).toBe(true);
    expect((await rejected.json()).operation.status).toBe('rejected');
    const pending = await data.post('operations', {
      operationId: 'private-pending',
      version: before.draft.version,
      contentVersion: before.contentVersion,
    });
    expect(pending.ok()).toBe(true);
    expect((await pending.json()).operation.status).toBe('pending');
    const operationsBefore = await (await page.request.get(`${data.path}/operations`)).json();
    let recoveryStarted = () => {};
    const started = new Promise<void>((resolve) => {
      recoveryStarted = resolve;
    });
    const held = new Promise<void>((resolve) => {
      releaseRecovery = resolve;
    });
    await page.route(
      `${installation.origin}/api/households/${data.household.id}/text-assistant/recover`,
      async (route) => {
        expect(route.request().method()).toBe('POST');
        expect(route.request().postDataJSON().operationIds).toContain('private-pending');
        recoveryStarted();
        await held;
        await route.abort('failed');
      },
      { times: 1 },
    );
    await page.goto(`${installation.origin}/households/${data.household.id}`);
    await (await utilityButton(page, 'Rapporter')).click();
    // Recovery completes pending attempts. Hold before the transaction so the
    // pending-history boundary and return reading cannot depend on its timer.
    await started;
    const history = page.getByRole('region', { name: 'Ändringshistorik', exact: true });
    await expect(history.getByRole('article')).toHaveCount(1);
    await expect(history).toContainText('Lo Exempel');
    await expect(history).not.toContainText('Osparad person');
    await expect(history).not.toContainText('private-rejected');
    await expect(history).not.toContainText('private-pending');
    expect(await data.read()).toEqual(before);
    expect(await (await page.request.get(`${data.path}/operations`)).json()).toEqual(
      operationsBefore,
    );
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await (await utilityButton(page, 'Tabell')).click();
    await expect(
      page.getByRole('region', { name: 'Hushållets tabell', exact: true }),
    ).toContainText('Osparad person');
    expect(await data.read()).toEqual(before);
    expect(await (await page.request.get(`${data.path}/operations`)).json()).toEqual(
      operationsBefore,
    );
  } finally {
    releaseRecovery();
    await page.unrouteAll({ behavior: 'wait' });
    await installation.close();
  }
});

for (const viewport of [
  { width: 1280, height: 720, caseId: 'HISTORIK-12' },
  { width: 390, height: 844, caseId: 'HISTORIK-16' },
  { width: 320, height: 640, caseId: 'HISTORIK-17' },
])
  test(`${viewport.caseId}: following save links preserves table search and unsent conversation text${viewport.width === 1280 ? '' : ` at ${viewport.width}px`}`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize(viewport);
      const data = await setup(page.request, installation.origin);
      await data.object('person', 'Lo Exempel');
      await data.save('initial');
      await data.object('person', 'Lo Lind');
      await data.save('rename');
      await data.object('private', 'Privat person');
      const before = await data.read();
      await page.goto(`${installation.origin}/households/${data.household.id}`);
      const conversationWrites: string[] = [];
      page.on('request', (request) => {
        if (
          request.method() === 'POST' &&
          /\/(text-assistant|conversation-consent)(\/|$)/.test(new URL(request.url()).pathname)
        )
          conversationWrites.push(request.url());
      });
      await (await utilityButton(page, 'Skriv till Skyttel')).click();
      const notice = page.getByRole('region', { name: 'Samtalsnotis', exact: true });
      await expect(notice).toContainText('Samtal med Skyttel är inte tillgängligt just nu.');
      const message = page.getByLabel('Meddelande till Skyttel', { exact: true });
      await message.fill('Bevara mitt oskickade meddelande');
      await page.getByRole('button', { name: 'Stäng textvyn', exact: true }).click();
      await (await utilityButton(page, 'Tabell')).click();
      const search = page.getByRole('searchbox', { name: 'Sök objekt i tabellen' });
      await search.fill('Lo Lind');
      await (await utilityButton(page, 'Rapporter')).click();
      const history = page.getByRole('region', { name: 'Ändringshistorik', exact: true });
      for (const id of ['initial', 'rename']) {
        const card = history.getByRole('article').filter({ hasText: `Sparande: ${id}` });
        await card.getByRole('link', { name: 'Länk till sparandet', exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`save=${id}`));
        await expect(card.getByRole('heading', { level: 3 })).toBeFocused();
        await expect(card.getByText('Namn: Lo Exempel.', { exact: true })).toBeVisible();
      }
      const back = page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true });
      await expect(notice).toBeVisible();
      await back.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          back.evaluate((button) => {
            const bounds = button.getBoundingClientRect();
            const hit = document.elementFromPoint(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            );
            return hit !== null && button.contains(hit);
          }),
        )
        .toBe(true);
      await back.click();
      await expect(search).toHaveValue('Lo Lind');
      await expect(search).toBeFocused();
      await (await utilityButton(page, 'Skriv till Skyttel')).click();
      await expect(message).toHaveValue('Bevara mitt oskickade meddelande');
      await expect(
        page.getByRole('dialog', { name: 'Samtal med Skyttel', exact: true }),
      ).toHaveCount(0);
      expect(conversationWrites).toEqual([]);
      expect(await data.read()).toEqual(before);
    } finally {
      await installation.close();
    }
  });
