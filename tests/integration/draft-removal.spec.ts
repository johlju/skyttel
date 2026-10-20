import { request } from '@playwright/test';
import { draftChangeCount } from '../../src/shared/map.js';
import { closeTextView, openDraftReview } from '../support/client.js';
import { editTableObject, openObjectRelationships } from '../support/domain-work.js';
import {
  prepareDraftRemovalFocus,
  prepareDraftRemovalMeaning,
  prepareRemovalMember,
  stageNewRemovalType,
} from '../support/draft-removal.js';
import { prepareDraftReview } from '../support/draft-review.js';
import { createInstallation } from '../support/installation.js';
import { openProperties, propertyRow } from '../support/property-controls.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { readRemovalHistory, readRemovalProposals } from '../support/removal-reading.js';
import { expect, test } from '../support/test.js';

test('UTKAST-150: absent independent removal retains complete proposals until actual checking permits one fresh removal', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  let member: Awaited<ReturnType<typeof prepareRemovalMember>> | undefined;
  try {
    const data = await prepareDraftReview(page.request, installation.origin);
    member = await prepareRemovalMember(browser, page.request, installation, data.household.id);
    const before = await data.read();
    const history = await (await page.request.get(`${data.path}/history`)).json();
    let confirmations = 0;
    let dropBefore = true;
    await page.route('**/map/discard-review', async (route) => {
      if (!route.request().postDataJSON().confirmation) return route.continue();
      confirmations++;
      if (dropBefore) return route.abort();
      return route.continue();
    });
    await page.goto(`${installation.origin}/households/${data.household.id}`);
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    await readRemovalProposals(page, before);
    await member.assertPrivate(page, before);
    const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
    const remove = draft.getByRole('button', {
      name: 'Ta bort förslaget: Olöst fordon',
      exact: true,
    });
    await remove.click();
    const dialog = page.getByRole('dialog', {
      name: 'Ta bort förslaget och dess beroenden?',
      exact: true,
    });
    await expect(dialog.getByRole('alert')).toContainText('Borttagningen kunde inte bekräftas');
    await expect(dialog.getByRole('button', { name: 'Ta bort', exact: true })).toBeDisabled();
    expect(await data.read()).toEqual(before);
    await page.keyboard.press('Escape');
    await readRemovalProposals(page, before);
    await draft.getByRole('button', { name: 'Kontrollera borttagningen', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Ta bort', exact: true })).toBeDisabled();
    expect(confirmations).toBe(1);
    await member.assertUnchanged();
    await member.assertPrivate(page, await data.read());
    await dialog.getByRole('button', { name: 'Hämta aktuellt utkast', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Ta bort', exact: true })).toBeEnabled();
    await expect(dialog.getByRole('listitem')).toHaveCount(1);
    expect(await data.read()).toEqual(before);
    await member.assertUnchanged();
    await member.assertPrivate(page, await data.read());
    dropBefore = false;
    await dialog.getByRole('button', { name: 'Ta bort', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(remove).toHaveCount(0);
    expect(confirmations).toBe(2);
    const after = await data.read();
    expect(after.draft).toEqual({
      ...before.draft,
      version: before.draft.version + 1,
      changes: before.draft.changes.filter(({ id }) => id !== 'draft-unresolved'),
    });
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
    expect(await (await page.request.get(`${data.path}/history`)).json()).toEqual(history);
    await readRemovalProposals(page, after);
    await member.assertUnchanged();
    await member.assertPrivate(page, after);
    await readRemovalHistory(page);
  } finally {
    await member?.context.close();
    await installation.close();
  }
});

test('UTKAST-46: removal of the final rows focuses the previous control and then the draft heading', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const data = await prepareDraftRemovalFocus(page.request, installation.origin);
    await page.goto(`${installation.origin}/households/${data.household.id}`);
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
    await readRemovalProposals(page, await data.read());
    const controls = draft.getByRole('button', { name: /^Ta bort förslaget:/ });
    await expect(controls).toHaveCount(2);
    await controls.last().click();
    await expect(controls).toHaveCount(1);
    await expect(controls.first()).toBeFocused();
    await controls.first().click();
    await expect(controls).toHaveCount(0);
    await expect(draft.getByRole('heading', { name: 'Utkast', exact: true })).toBeFocused();
    expect(draftChangeCount((await data.read()).draft)).toBe(0);
    await readRemovalProposals(page, await data.read());
    await readRemovalHistory(page);
  } finally {
    await installation.close();
  }
});

for (const preserveLaterFocus of [false, true]) {
  test(`${preserveLaterFocus ? 'UTKAST-146' : 'UTKAST-145'}: delayed removal restores a disappearing draft tool and preserves later focus (${preserveLaterFocus ? 'later control' : 'draft tool'})`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    let release: (() => void) | undefined;
    try {
      const data = await prepareDraftReview(page.request, installation.origin);
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let applied: (() => void) | undefined;
      const changed = new Promise<void>((resolve) => {
        applied = resolve;
      });
      await page.route('**/map/discard-review', async (route) => {
        if (!route.request().postDataJSON().confirmation) return route.continue();
        const response = await route.fetch();
        applied?.();
        await held;
        await route.fulfill({ response });
      });
      await page.goto(`${installation.origin}/households/${data.household.id}`);
      const tools = page.getByRole('navigation', { name: 'Kartans verktyg' });
      await tools.getByRole('button', { name: 'Utkast', exact: true }).click();
      await readRemovalProposals(page, await data.read());
      await page.getByRole('button', { name: 'Kasta hela utkastet', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Ta bort hela utkastet?', exact: true });
      await dialog.getByRole('button', { name: 'Ta bort hela utkastet', exact: true }).click();
      await changed;
      await dialog.getByRole('button', { name: 'Avbryt', exact: true }).click();
      await page.getByRole('button', { name: 'Stäng textvyn', exact: true }).click();
      const write = tools.getByRole('button', { name: /^Skriv till Skyttel/ });
      await tools.getByRole('button', { name: 'Utkast', exact: true }).focus();
      if (preserveLaterFocus)
        await tools.getByRole('button', { name: 'Tabell', exact: true }).focus();
      release?.();
      await expect(tools.getByRole('button', { name: 'Utkast', exact: true })).toHaveCount(0);
      await expect(
        preserveLaterFocus ? tools.getByRole('button', { name: 'Tabell', exact: true }) : write,
      ).toBeFocused();
      await expect(page.getByRole('status', { name: 'Utkastets åtgärdsstatus' })).toContainText(
        'Hela ditt utkast har tagits bort',
      );
      await readRemovalProposals(page, await data.read());
      await readRemovalHistory(page);
    } finally {
      release?.();
      await installation.close();
    }
  });
}

test('UTKAST-48: authoritative discard rejects forged or unauthorized requests and recovers an applied removal after a lost reply', async ({
  page,
}) => {
  const installation = await createInstallation();
  const anonymous = await request.newContext();
  try {
    const data = await prepareDraftReview(page.request, installation.origin);
    const before = await data.read();
    const history = await (await page.request.get(`${data.path}/history`)).json();
    const body = {
      kind: 'all',
      version: before.draft.version,
      contentVersion: before.contentVersion,
    };
    const preview = await (
      await page.request.post(`${data.path}/discard-review`, {
        headers: { origin: installation.origin },
        data: body,
      })
    ).json();
    const forged = await page.request.post(`${data.path}/discard-review`, {
      headers: { origin: installation.origin },
      data: { ...body, confirmation: { ...preview.plan, removed: [] } },
    });
    expect(forged.status()).toBe(409);
    const stale = await page.request.post(`${data.path}/discard-review`, {
      headers: { origin: installation.origin },
      data: { ...body, version: before.draft.version - 1, confirmation: preview.plan },
    });
    expect(stale.status()).toBe(409);
    const unauthorized = await anonymous.post(`${data.path}/discard-review`, {
      headers: { origin: installation.origin },
      data: { ...body, confirmation: preview.plan },
    });
    expect(unauthorized.status()).toBe(401);
    expect(await data.read()).toEqual(before);
    await page.route('**/map/discard-review', async (route) => {
      if (!route.request().postDataJSON().confirmation) return route.continue();
      await route.fetch();
      await route.abort();
    });
    await page.goto(`${installation.origin}/households/${data.household.id}`);
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
    await readRemovalProposals(page, await data.read());
    await draft.getByRole('button', { name: 'Kasta hela utkastet', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Ta bort hela utkastet?', exact: true });
    await dialog.getByRole('button', { name: 'Ta bort hela utkastet', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Borttagningen kunde inte bekräftas');
    await expect(
      dialog.getByRole('button', { name: 'Ta bort hela utkastet', exact: true }),
    ).toBeDisabled();
    expect(draftChangeCount((await data.read()).draft)).toBe(0);
    await dialog.getByRole('button', { name: 'Hämta aktuellt utkast', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(draft).toContainText('Utkastet är tomt');
    await expect(draft.getByRole('heading', { name: 'Utkast', exact: true })).toBeFocused();
    const after = await data.read();
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
    expect(await (await page.request.get(`${data.path}/history`)).json()).toEqual(history);
    await readRemovalProposals(page, await data.read());
    await readRemovalHistory(page);
  } finally {
    await anonymous.dispose();
    await installation.close();
  }
});

for (const kind of ['objectType', 'relationshipType'] as const) {
  test(`${kind === 'objectType' ? 'UTKAST-47' : 'UTKAST-147'}: discarding an edited ${kind} retains free properties until explicit review against the saved type`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      const data = await prepareDraftRemovalMeaning(page.request, installation.origin, kind);
      const before = await data.read();
      const history = await (await page.request.get(`${data.path}/history`)).json();
      await page.goto(`${installation.origin}/households/${data.household.id}`);
      await page.getByRole('button', { name: 'Utkast', exact: true }).click();
      const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
      await readRemovalProposals(page, await data.read());
      await draft
        .getByRole('button', { name: `Ta bort förslaget: ${data.type.name}`, exact: true })
        .click();
      const dialog = page.getByRole('dialog', {
        name: 'Ta bort förslaget och dess beroenden?',
        exact: true,
      });
      const affected = dialog.getByRole('list', { name: 'Förslag som blir kvar men påverkas' });
      const dependents = (
        kind === 'objectType' ? before.draft.changes : before.draft.relationships
      )?.filter(({ after }) => after?.typeId === data.type.id);
      await expect(affected.getByRole('listitem')).toHaveCount(dependents?.length ?? 0);
      const reviewWarning =
        'Typens uppgifter skiljer sig från förslagets underlag. Rätta förslaget i det ordinarie flödet.';
      await expect(affected).toContainText(reviewWarning);
      await dialog.getByRole('button', { name: 'Ta bort', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const after = await data.read();
      const changes = kind === 'objectType' ? after.draft.changes : after.draft.relationships;
      const change = changes?.find(({ id }) => id === data.proposalId);
      expect(change).toEqual(
        (kind === 'objectType' ? before.draft.changes : before.draft.relationships)?.find(
          ({ id }) => id === data.proposalId,
        ),
      );
      if (!change?.after)
        throw new Error('Discarding the type must retain the individual proposal');
      expect(change.after.properties).toEqual(
        (kind === 'objectType' ? before.draft.changes : before.draft.relationships)?.find(
          ({ id }) => id === data.proposalId,
        )?.after?.properties,
      );
      const row = draft.locator('tr').filter({
        has: page.locator(
          `#draft-read-${kind === 'objectType' ? 'object' : 'relationship'}-${data.proposalId}`,
        ),
      });
      await expect(row.locator('.draft-row-warning')).toHaveText(reviewWarning);
      await row.getByRole('button', { name: /^Visa förslaget:/ }).click();
      const details = page.getByRole('dialog');
      await expect(details).toContainText('Ny uppgift');
      await expect(details).toContainText('Behåll hela mitt värde');
      await page.keyboard.press('Escape');
      expect(await data.read()).toEqual(after);
      await closeTextView(page);
      if (kind === 'objectType') {
        const editor = await editTableObject(page, 'Alex blå cykel');
        await expect(editor.getByLabel('Objekttyp', { exact: true })).toHaveValue(data.type.id);
        await openProperties(editor);
        await expect(
          propertyRow(editor, 'Ny uppgift').getByLabel('Värde', { exact: true }),
        ).toHaveValue('Behåll hela mitt värde');
        expect(await data.read()).toEqual(after);
        await editor
          .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
          .click();
        await expect(editor).not.toBeVisible();
      } else {
        const editor = await openObjectRelationships(page, 'Alex blå cykel');
        const relationship = editor
          .getByRole('listitem')
          .filter({ hasText: 'Behåll hela mitt värde' });
        await expect(relationship).toHaveCount(1);
        await relationship.getByRole('button', { name: 'Redigera samband', exact: true }).click();
        await expect(editor.getByLabel('Sambandstyp', { exact: true })).toHaveValue(data.type.id);
        await expect(editor.getByLabel('Från objekt', { exact: true })).toHaveValue('draft-bike');
        await expect(editor.getByLabel('Till objekt', { exact: true })).toHaveValue('draft-bike');
        await expect(
          propertyRow(editor, 'Ny uppgift').getByLabel('Värde', { exact: true }),
        ).toHaveValue('Behåll hela mitt värde');
        expect(await data.read()).toEqual(after);
        await stageRelationshipAndClose(page);
      }
      const reviewed = await data.read();
      const reviewedChange = (
        kind === 'objectType' ? reviewed.draft.changes : reviewed.draft.relationships
      )?.find(({ id }) => id === data.proposalId);
      expect(reviewedChange).toEqual({
        ...change,
        type: data.type,
        proposedAt: expect.any(String),
        ...(kind === 'objectType' ? { stagingId: expect.any(String) } : {}),
      });
      expect(reviewedChange?.after?.properties).toEqual(change?.after?.properties);
      expect(
        reviewed.draft.changes.filter(({ id }) => kind !== 'objectType' || id !== data.proposalId),
      ).toEqual(
        after.draft.changes.filter(({ id }) => kind !== 'objectType' || id !== data.proposalId),
      );
      expect(
        reviewed.draft.relationships?.filter(
          ({ id }) => kind !== 'relationshipType' || id !== data.proposalId,
        ),
      ).toEqual(
        after.draft.relationships?.filter(
          ({ id }) => kind !== 'relationshipType' || id !== data.proposalId,
        ),
      );
      expect(reviewed.draft.objectTypes).toEqual(after.draft.objectTypes);
      expect(reviewed.draft.relationshipTypes).toEqual(after.draft.relationshipTypes);
      await openDraftReview(page);
      await expect(row.locator('.draft-row-warning')).toHaveCount(0);
      await expect(
        draft.locator('.draft-row-warning').filter({ hasText: reviewWarning }),
      ).toHaveCount((dependents?.length ?? 0) - 1);
      expect(after.objects).toEqual(before.objects);
      expect(after.relationships).toEqual(before.relationships);
      expect(after.types).toEqual(before.types);
      expect(after.relationshipTypes).toEqual(before.relationshipTypes);
      expect(reviewed.objects).toEqual(before.objects);
      expect(reviewed.relationships).toEqual(before.relationships);
      expect(reviewed.types).toEqual(before.types);
      expect(reviewed.relationshipTypes).toEqual(before.relationshipTypes);
      expect(await (await page.request.get(`${data.path}/history`)).json()).toEqual(history);
      await readRemovalProposals(page, await data.read());
      await readRemovalHistory(page);
    } finally {
      await installation.close();
    }
  });
}

test('UTKAST-148: lost independent removal checks actual draft before offering another removal', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const data = await prepareDraftReview(page.request, installation.origin);
    const before = await data.read();
    await page.route('**/map/discard-review', async (route) => {
      if (!route.request().postDataJSON().confirmation) return route.continue();
      await route.fetch();
      await route.abort();
    });
    await page.goto(`${installation.origin}/households/${data.household.id}`);
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
    await readRemovalProposals(page, await data.read());
    await draft
      .getByRole('button', { name: 'Ta bort förslaget: Olöst fordon', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Ta bort förslaget och dess beroenden?',
      exact: true,
    });
    await expect(dialog.getByRole('alert')).toContainText('Borttagningen kunde inte bekräftas');
    await expect(dialog.getByRole('button', { name: 'Ta bort', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Hämta aktuellt utkast', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      draft.getByRole('button', { name: 'Ta bort förslaget: Olöst fordon', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('status', { name: 'Utkastets åtgärdsstatus' })).toContainText(
      'Förslaget finns inte längre',
    );
    const after = await data.read();
    expect(after.draft).toEqual({
      ...before.draft,
      version: before.draft.version + 1,
      changes: before.draft.changes.filter(({ id }) => id !== 'draft-unresolved'),
    });
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
    await readRemovalProposals(page, await data.read());
    await readRemovalHistory(page);
  } finally {
    await installation.close();
  }
});

test('UTKAST-149: a delayed independent removal failure preserves later composer focus and exposes persistent recovery', async ({
  page,
}) => {
  const installation = await createInstallation();
  let release: (() => void) | undefined;
  try {
    const data = await prepareDraftReview(page.request, installation.origin);
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let applied: (() => void) | undefined;
    const changed = new Promise<void>((resolve) => {
      applied = resolve;
    });
    await page.route('**/map/discard-review', async (route) => {
      if (!route.request().postDataJSON().confirmation) return route.continue();
      await route.fetch();
      applied?.();
      await held;
      await route.abort();
    });
    await page.goto(`${installation.origin}/households/${data.household.id}`);
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
    await readRemovalProposals(page, await data.read());
    await draft
      .getByRole('button', { name: 'Ta bort förslaget: Olöst fordon', exact: true })
      .click();
    await changed;
    const message = page.getByLabel('Meddelande till Skyttel', { exact: true });
    await message.fill('Min senare text och fokus ska finnas kvar');
    release?.();
    await expect(page.getByRole('status', { name: 'Utkastets åtgärdsstatus' })).toContainText(
      'Borttagningen kunde inte bekräftas',
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(message).toBeFocused();
    await expect(message).toHaveValue('Min senare text och fokus ska finnas kvar');
    await expect(
      draft.getByRole('button', { name: 'Ta bort förslaget: Olöst fordon', exact: true }),
    ).toBeDisabled();
    await draft.getByRole('button', { name: 'Kontrollera borttagningen', exact: true }).click();
    const dialog = page.getByRole('dialog', {
      name: 'Ta bort förslaget och dess beroenden?',
      exact: true,
    });
    await expect(dialog.getByRole('button', { name: 'Avbryt', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(
      draft.getByRole('button', { name: 'Kontrollera borttagningen', exact: true }),
    ).toBeFocused();
    await draft.getByRole('button', { name: 'Kontrollera borttagningen', exact: true }).click();
    await dialog.getByRole('button', { name: 'Hämta aktuellt utkast', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      draft.getByRole('button', { name: 'Ta bort förslaget: Olöst fordon', exact: true }),
    ).toHaveCount(0);
    await expect(message).toHaveValue('Min senare text och fokus ska finnas kvar');
    await readRemovalProposals(page, await data.read());
    await readRemovalHistory(page);
  } finally {
    release?.();
    await installation.close();
  }
});

test('UTKAST-41: independent removal preserves other proposals and history and focuses the next control', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const data = await prepareDraftReview(page.request, installation.origin);
    const before = await data.read();
    const history = await (await page.request.get(`${data.path}/history`)).json();
    await page.goto(`${installation.origin}/households/${data.household.id}`);
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
    await readRemovalProposals(page, await data.read());
    const remove = draft.getByRole('button', {
      name: 'Ta bort förslaget: Olöst fordon',
      exact: true,
    });
    const nextName = await draft
      .getByRole('button', { name: /^Ta bort förslaget:/ })
      .nth(3)
      .getAttribute('aria-label');
    if (!nextName) throw new Error('Expected the next proposal control');
    await remove.focus();
    await page.keyboard.press('Enter');
    await expect(remove).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(draft.getByRole('button', { name: nextName, exact: true })).toBeFocused();
    const after = await data.read();
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
    expect(after.draft).toEqual({
      ...before.draft,
      version: before.draft.version + 1,
      changes: before.draft.changes.filter(({ id }) => id !== 'draft-unresolved'),
    });
    expect(await (await page.request.get(`${data.path}/history`)).json()).toEqual(history);
    await expect(page.getByRole('status', { name: 'Utkastets åtgärdsstatus' })).toContainText(
      'Förslaget är borttaget',
    );
    await readRemovalProposals(page, await data.read());
    await readRemovalHistory(page);
  } finally {
    await installation.close();
  }
});

for (const width of [1280, 320]) {
  test(`${width === 1280 ? 'UTKAST-42' : 'UTKAST-142'}: dependent object removal shows its actual edge proposals and cancellation changes nothing at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      const data = await prepareDraftReview(page.request, installation.origin);
      const before = await data.read();
      const history = await (await page.request.get(`${data.path}/history`)).json();
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${installation.origin}/households/${data.household.id}`);
      await page.getByRole('button', { name: 'Utkast', exact: true }).click();
      const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
      await readRemovalProposals(page, await data.read());
      const remove = draft.getByRole('button', {
        name: 'Ta bort förslaget: Ospecificerat fordon',
        exact: true,
      });
      await remove.click();
      const dialog = page.getByRole('dialog', {
        name: 'Ta bort förslaget och dess beroenden?',
        exact: true,
      });
      await expect(dialog.getByRole('button', { name: 'Avbryt', exact: true })).toBeFocused();
      await expect(dialog.getByRole('listitem')).toHaveCount(4);
      await expect(dialog).toContainText('Ospecificerat fordon');
      await expect(dialog.getByRole('listitem').filter({ hasText: 'Samband' })).toHaveCount(3);
      await expect(dialog).not.toContainText('Olöst fordon');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(remove).toBeFocused();
      expect(await data.read()).toEqual(before);
      await readRemovalProposals(page, before);
      await remove.click();
      await dialog.getByRole('button', { name: 'Ta bort', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(remove).toHaveCount(0);
      await expect(
        draft.getByRole('button', { name: 'Ta bort förslaget: Olöst fordon', exact: true }),
      ).toBeFocused();
      const after = await data.read();
      expect(after.draft.changes.map(({ id }) => id)).toEqual(['draft-bike', 'draft-unresolved']);
      expect(after.draft.relationships?.map(({ id }) => id)).toEqual([
        'draft-edge-unknown',
        'draft-edge-none',
      ]);
      expect(after.draft.relationships).toEqual(
        before.draft.relationships?.filter(({ id }) =>
          ['draft-edge-unknown', 'draft-edge-none'].includes(id),
        ),
      );
      expect(after.draft.objectTypes).toEqual(before.draft.objectTypes);
      expect(after.draft.relationshipTypes).toEqual(before.draft.relationshipTypes);
      expect(after.objects).toEqual(before.objects);
      expect(after.relationships).toEqual(before.relationships);
      expect(await (await page.request.get(`${data.path}/history`)).json()).toEqual(history);
      await expect(page.getByRole('status', { name: 'Utkastets åtgärdsstatus' })).toContainText(
        'Förslagen är borttagna',
      );
      await readRemovalProposals(page, await data.read());
      await readRemovalHistory(page);
    } finally {
      await installation.close();
    }
  });
}

for (const width of [1280, 320]) {
  test(`${width === 1280 ? 'UTKAST-44' : 'UTKAST-144'}: whole draft discard requires confirmation and preserves unsent conversation and shared history at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      const data = await prepareDraftReview(page.request, installation.origin);
      const before = await data.read();
      const history = await (await page.request.get(`${data.path}/history`)).json();
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${installation.origin}/households/${data.household.id}`);
      await page.getByRole('button', { name: 'Utkast', exact: true }).click();
      const message = page.getByLabel('Meddelande till Skyttel', { exact: true });
      await message.fill('Min oskickade fråga ska finnas kvar');
      const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
      await readRemovalProposals(page, await data.read());
      const discard = draft.getByRole('button', { name: 'Kasta hela utkastet', exact: true });
      await discard.click();
      const dialog = page.getByRole('dialog', { name: 'Ta bort hela utkastet?', exact: true });
      await expect(dialog.getByRole('button', { name: 'Avbryt', exact: true })).toBeFocused();
      await expect(dialog.getByRole('listitem')).toHaveCount(draftChangeCount(before.draft));
      await dialog.getByRole('button', { name: 'Avbryt', exact: true }).click();
      await expect(discard).toBeFocused();
      expect(await data.read()).toEqual(before);
      await readRemovalProposals(page, before);
      await discard.click();
      await dialog.getByRole('button', { name: 'Ta bort hela utkastet', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(draft.getByRole('heading', { name: 'Utkast', exact: true })).toBeFocused();
      await expect(draft).toContainText('Utkastet är tomt');
      await expect(
        page
          .getByRole('navigation', { name: 'Kartans verktyg' })
          .getByRole('button', { name: 'Utkast', exact: true }),
      ).toHaveCount(0);
      await expect(message).toHaveValue('Min oskickade fråga ska finnas kvar');
      const after = await data.read();
      expect(draftChangeCount(after.draft)).toBe(0);
      expect(after.objects).toEqual(before.objects);
      expect(after.relationships).toEqual(before.relationships);
      expect(after.types).toEqual(before.types);
      expect(after.relationshipTypes).toEqual(before.relationshipTypes);
      expect(await (await page.request.get(`${data.path}/history`)).json()).toEqual(history);
      await expect(page.getByRole('status', { name: 'Utkastets åtgärdsstatus' })).toContainText(
        'Hela ditt utkast har tagits bort',
      );
      await readRemovalProposals(page, await data.read());
      await readRemovalHistory(page);
    } finally {
      await installation.close();
    }
  });
}

test('UTKAST-45: a stale discard confirmation preserves newer proposals and refreshes its actual plan', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const data = await prepareDraftReview(page.request, installation.origin);
    await page.goto(`${installation.origin}/households/${data.household.id}`);
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
    await readRemovalProposals(page, await data.read());
    await draft
      .getByRole('button', { name: 'Ta bort förslaget: Ospecificerat fordon', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: 'Ta bort förslaget och dess beroenden?',
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await data.post('object-type', {
      id: 'newer-independent-type',
      baseRevision: null,
      value: { name: 'Nyare oberoende typ', description: '' },
    });
    const newer = await data.read();
    await dialog.getByRole('button', { name: 'Ta bort', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Borttagningen kunde inte bekräftas');
    expect(await data.read()).toEqual(newer);
    await expect(dialog.getByRole('button', { name: 'Ta bort', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Hämta aktuellt utkast', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Avbryt', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Ta bort', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Avbryt', exact: true })).toBeFocused();
    await expect(dialog.getByRole('listitem')).toHaveCount(4);
    await expect(dialog).not.toContainText('Nyare oberoende typ');
    await dialog.getByRole('button', { name: 'Ta bort', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(draft).toContainText('Nyare oberoende typ');
    const result = await data.read();
    expect(result.draft.objectTypes?.find(({ id }) => id === 'newer-independent-type')).toEqual(
      newer.draft.objectTypes?.find(({ id }) => id === 'newer-independent-type'),
    );
    expect(result.objects).toEqual(newer.objects);
    await readRemovalProposals(page, await data.read());
    await readRemovalHistory(page);
  } finally {
    await installation.close();
  }
});

for (const kind of ['objectType', 'relationshipType'] as const) {
  test(`${kind === 'objectType' ? 'UTKAST-43' : 'UTKAST-143'}: removing a new ${kind} preserves dependent proposals with a truthful type warning`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      const data = await prepareDraftReview(page.request, installation.origin);
      await page.goto(`${installation.origin}/households/${data.household.id}`);
      await stageNewRemovalType(page, kind);
      const before = await data.read();
      const type = (
        kind === 'objectType' ? before.draft.objectTypes : before.draft.relationshipTypes
      )?.find(({ after }) => after?.name === 'Tillfällig typ');
      if (!type) throw new Error('Missing native type proposal');
      expect(type.after).toMatchObject({
        name: 'Tillfällig typ',
        description: 'Hela den tillfälliga typens betydelse',
      });
      if (kind === 'relationshipType')
        expect(type.after).toMatchObject({ forwardLabel: 'granskar', reverseLabel: 'granskas av' });
      const proposal = (
        kind === 'objectType' ? before.draft.changes : before.draft.relationships
      )?.find(({ after }) => after?.typeId === type.id);
      if (!proposal) throw new Error('Missing native dependent proposal');
      expect(proposal.after).toMatchObject(
        kind === 'objectType'
          ? {
              typeId: type.id,
              name: 'Tillfälligt föremål',
              properties: [
                {
                  id: expect.any(String),
                  label: 'Beskrivning',
                  kind: 'text' as const,
                  value: 'Hela den tillfälliga berättelsen',
                },
              ],
            }
          : {
              typeId: type.id,
              sourceId: 'draft-bike',
              targetId: 'draft-bike',
              properties: [
                {
                  id: expect.any(String),
                  label: 'Uppgiftens säkerhet',
                  kind: 'text' as const,
                  value: 'Okänt',
                },
              ],
            },
      );
      const history = await (await page.request.get(`${data.path}/history`)).json();
      await page.goto(`${installation.origin}/households/${data.household.id}`);
      await page.getByRole('button', { name: 'Utkast', exact: true }).click();
      const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
      await readRemovalProposals(page, await data.read());
      await draft
        .getByRole('button', { name: 'Ta bort förslaget: Tillfällig typ', exact: true })
        .click();
      const dialog = page.getByRole('dialog', {
        name: 'Ta bort förslaget och dess beroenden?',
        exact: true,
      });
      await expect(dialog.getByRole('button', { name: 'Avbryt', exact: true })).toBeFocused();
      await expect(
        dialog.getByRole('heading', { name: 'Förslag som blir kvar men påverkas' }),
      ).toBeVisible();
      const affected = dialog.getByRole('list', { name: 'Förslag som blir kvar men påverkas' });
      await expect(affected.getByRole('listitem')).toHaveCount(1);
      await expect(affected).toContainText(
        kind === 'objectType' ? 'Tillfälligt föremål' : 'granskar',
      );
      await expect(affected).toContainText(
        kind === 'objectType' ? 'Objekttypen saknas' : 'Sambandstypen saknas',
      );
      await dialog.getByRole('button', { name: 'Avbryt', exact: true }).click();
      expect(await data.read()).toEqual(before);
      await readRemovalProposals(page, before);
      await draft
        .getByRole('button', { name: 'Ta bort förslaget: Tillfällig typ', exact: true })
        .click();
      await dialog.getByRole('button', { name: 'Ta bort', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const after = await data.read();
      const changes = kind === 'objectType' ? after.draft.changes : after.draft.relationships;
      expect(changes?.find(({ id }) => id === proposal.id)?.after?.typeId).toBe(type.id);
      expect(changes?.find(({ id }) => id === proposal.id)).toEqual(proposal);
      expect(after.objects).toEqual(before.objects);
      expect(after.relationships).toEqual(before.relationships);
      await expect(draft).toContainText(
        kind === 'objectType' ? 'Objekttypen saknas' : 'Sambandstypen saknas',
      );
      expect(await (await page.request.get(`${data.path}/history`)).json()).toEqual(history);
      await readRemovalProposals(page, await data.read());
      await readRemovalHistory(page);
    } finally {
      await installation.close();
    }
  });
}
