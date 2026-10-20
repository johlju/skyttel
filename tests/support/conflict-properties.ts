import { type APIRequestContext, expect, type Locator, type Page } from '@playwright/test';
import type { MapState, ObjectValue, RelationshipValue } from '../../src/shared/map.js';
import { createHousehold, signIn } from './client.js';
import { createInstallation, type Identity, robin } from './installation.js';
export async function conflictCollaborators(
  first: APIRequestContext,
  second: APIRequestContext,
  seeds = [
    ['lo', 'Lo Exempel'],
    ['service', 'Molnmusik'],
  ],
  memberIdentity: Identity = robin,
) {
  const installation = await createInstallation();
  await signIn(first, installation.origin);
  const { household } = await (await createHousehold(first, installation.origin)).json();
  const path = `${installation.origin}/api/households/${household.id}/map`;
  const post = (client: APIRequestContext, route: string, data: unknown) =>
    client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
  const read = async (client = first): Promise<MapState> => (await client.get(path)).json();
  async function propose(
    client: APIRequestContext,
    kind: 'draft' | 'relationship',
    id: string,
    value: ObjectValue | RelationshipValue | null,
  ) {
    const state = await read(client);
    const previous = (kind === 'draft' ? state.objects : state.relationships).find(
      (item) => item.id === id,
    );
    expect(
      (
        await post(client, kind, {
          version: state.draft.version,
          contentVersion: state.contentVersion,
          id,
          baseRevision: previous?.revision ?? null,
          value,
        })
      ).status(),
    ).toBe(200);
  }
  const save = async (client: APIRequestContext, operationId: string) => {
    const state = await read(client);
    return post(client, 'save', {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      operationId,
    });
  };
  installation.setIdentity(memberIdentity);
  await signIn(second, installation.origin);
  const { user } = await (await second.get(`${installation.origin}/api/bootstrap`)).json();
  const { code } = await (
    await first.post(`${installation.origin}/api/households/${household.id}/invitations`, {
      headers: { origin: installation.origin },
      data: { userId: user.id },
    })
  ).json();
  expect(
    (
      await second.post(`${installation.origin}/api/invitations/accept`, {
        headers: { origin: installation.origin },
        data: { code },
      })
    ).status(),
  ).toBe(200);
  const state = await read();
  for (const [id, name] of seeds) {
    await propose(first, 'draft', id, { typeId: state.types[0].id, name });
  }
  expect((await save(first, 'initial')).status()).toBe(200);
  return { installation, path, post, read, propose, save, userId: user.id };
}

export type ConflictPropertyChoice = 'saved' | 'proposed';

/** Choose one side of actual differing properties and apply through the native dialog. */
export async function applyConflictPropertyChoices(
  page: Page,
  choice: ConflictPropertyChoice,
  savedText?: string,
) {
  await page.getByRole('button', { name: /^\d+ konflikt(?:er)? i ditt utkast$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
  await expect(
    dialog.getByRole('button', { name: 'Stäng konfliktdialogen', exact: true }),
  ).toBeEnabled();
  if (savedText)
    await expect(dialog.getByRole('region', { name: 'Sparat i kartan nu' })).toContainText(
      savedText,
    );
  const refresh = dialog.getByRole('button', { name: 'Visa aktuell jämförelse' });
  if (await refresh.isVisible()) await refresh.click();
  await chooseConflictProperties(dialog, choice);
  await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText(
    choice === 'saved' ? 'Förslaget har tagits bort ur ditt utkast' : 'Valen finns i ditt utkast',
  );
  await page.keyboard.press('Escape');
}

/** Select actual enabled ordinary property rows without submitting them. */
export async function chooseConflictProperties(dialog: Locator, choice: ConflictPropertyChoice) {
  await expect(
    dialog.getByRole('button', { name: 'Stäng konfliktdialogen', exact: true }),
  ).toBeEnabled();
  const proposed = dialog
    .getByRole('region', { name: 'Ditt förslag', exact: true })
    .getByRole('button');
  const saved = dialog
    .getByRole('region', { name: 'Sparat i kartan nu', exact: true })
    .getByRole('button');
  for (let index = 0; index < (await proposed.count()); index++) {
    const field = proposed.nth(index);
    if (await field.isDisabled()) {
      await expect(field.getByText('Samma värde', { exact: true })).toBeVisible();
      continue;
    }
    if (
      choice === 'proposed' &&
      (await field.getByText('Ditt föreslagna värde', { exact: true }).count())
    )
      await field.click();
    else await saved.nth(index).click();
  }
}

/** Preserve the existing proposed-choice API for retained public scenarios. */
export async function applyProposedConflictChanges(page: Page, savedText?: string) {
  await applyConflictPropertyChoices(page, 'proposed', savedText);
}
