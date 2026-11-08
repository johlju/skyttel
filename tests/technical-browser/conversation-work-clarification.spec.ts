import type { MapState } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { startConversationWithText } from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';
import { modelTool, textModel } from '../support/text-model.js';

test('a concurrent draft discard asks a visible question and requires explicit abandonment before a fresh instruction and save', {
  tag: '@technical',
}, async ({ page }) => {
  let workCalls = 0;
  let typeId: string;
  const freshInstruction = 'Lägg bara till Mira. Spara hela utkastet.';
  const model = textModel((body) => {
    const current = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    );
    const fresh = current.message === freshInstruction;
    return [
      modelTool('submit_changes', {
        version: current.draft.version,
        contentVersion: current.draft.contentVersion,
        completion: fresh ? 'save' : 'draft',
        continueResponse: !fresh && model.requests.length === 1,
        operations: (fresh ? ['mira'] : model.requests.length === 1 ? ['lo'] : ['lo', 'mira']).map(
          (id) => ({
            name: 'propose_object',
            arguments: {
              id,
              baseRevision: null,
              value: { typeId, name: id === 'lo' ? 'Lo' : 'Mira' },
            },
          }),
        ),
      }),
    ];
  });
  const app = await createInstallation(undefined, {
    modelFetch: async (input, init) => {
      const body = JSON.parse(String(init?.body));
      if (!body.instructions.startsWith('SKYTTEL_TURN_') && ++workCalls === 2)
        return Response.json(
          { error: { message: 'Controlled partial-work outage' } },
          { status: 503 },
        );
      return model.provider(input, init);
    },
  });
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const map = `${app.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(map)).json();
    typeId = (await read()).types[0].id;
    await page.goto(app.origin);
    await startConversationWithText(page);
    const view = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
    const field = view.getByRole('textbox', { name: 'Meddelande till Skyttel' });
    const send = view.getByRole('button', { name: 'Skicka', exact: true });
    await field.fill('Lägg till Lo och Mira. Spara hela utkastet.');
    await send.click();
    const notice = page.getByRole('region', { name: 'Samtalsnotis', exact: true });
    await expect(notice.getByRole('button', { name: 'Försök igen', exact: true })).toBeVisible();
    const changed = await read();
    expect(changed.draft.changes).toMatchObject([{ id: 'lo', after: { name: 'Lo' } }]);
    // Another manual client uses the real public draft endpoint. The browser
    // must ask about these current facts rather than re-create the old proposal.
    expect(
      (
        await page.request.post(`${map}/discard`, {
          headers: { origin: app.origin },
          data: {
            version: changed.draft.version,
            contentVersion: changed.contentVersion,
          },
        })
      ).status(),
    ).toBe(200);
    await notice.getByRole('button', { name: 'Försök igen', exact: true }).click();
    await expect(notice).toContainText('Hur vill du fortsätta med dina aktuella ändringar?');
    await notice.locator('summary').click();
    await expect(
      notice.getByText('Lägg till Lo och Mira. Spara hela utkastet.', { exact: true }),
    ).toBeVisible();
    await expect(notice.getByRole('button', { name: 'Försök igen', exact: true })).toHaveCount(0);
    await field.fill(freshInstruction);
    await expect(field).toBeEditable();
    await expect(send).toBeDisabled();
    const callsBeforeAbandon = workCalls;
    const abandon = notice.getByRole('button', {
      name: 'Avstå från det oavslutade arbetet',
      exact: true,
    });
    await abandon.focus();
    await page.keyboard.press('Enter');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(freshInstruction);
    await expect(send).toBeEnabled();
    expect(workCalls).toBe(callsBeforeAbandon);
    await send.click();
    await expect(view.getByRole('log', { name: 'Samtalstext' })).toContainText('Sparat');
    const final = await read();
    expect(final.objects).toMatchObject([{ id: 'mira', name: 'Mira' }]);
    expect(final.objects.some(({ id }) => id === 'lo')).toBe(false);
    expect(final.draft.changes).toEqual([]);
    expect((await (await page.request.get(`${map}/operations`)).json()).operations).toHaveLength(1);
    expect((await (await page.request.get(`${map}/history`)).json()).history).toHaveLength(1);
  } finally {
    await app.close();
  }
});
