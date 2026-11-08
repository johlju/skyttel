import type { MapState } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import {
  microphoneButton,
  startConversationWithText,
  turnMicrophoneOn,
} from '../support/conversation-page.js';
import { readDraftProposal } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { expect, test } from '../support/test.js';
import { modelMessage, modelTool, readOnlyScope, textModel } from '../support/text-model.js';

test('TEXT-18: återförsök och avstående fortsätter bara återstående arbete', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  let release = () => {};
  let held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let workCalls = 0;
  let typeId: string;
  const model = textModel((body) => {
    const current = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    );
    if (current.message.startsWith('Beskriv'))
      return [
        modelMessage(
          current.message === 'Beskriv kartan.'
            ? 'Kartan har ännu inga sparade objekt.'
            : 'Ett utkast innehåller dina osparade ändringar.',
        ),
      ];
    if (current.message.startsWith('Ändra Mira'))
      return [
        modelTool('submit_changes', {
          version: current.draft.version,
          contentVersion: current.draft.contentVersion,
          completion: 'draft',
          continueResponse: true,
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'retry-mira',
                baseRevision: null,
                value: { typeId, name: 'Mira Lind' },
              },
            },
          ],
        }),
      ];
    return [
      modelTool('submit_changes', {
        version: current.draft.version,
        contentVersion: current.draft.contentVersion,
        completion: 'draft',
        continueResponse: model.requests.length === 1,
        operations: (model.requests.length === 1 ? ['lo'] : ['lo', 'retry-mira']).map((id) => ({
          name: 'propose_object',
          arguments: {
            id,
            baseRevision: null,
            value:
              id === 'lo'
                ? {
                    typeId,
                    name: 'Lo Lind',
                    properties: [
                      {
                        id: 'description',
                        label: 'Beskrivning',
                        kind: 'text',
                        value: 'Påhittad uppgift',
                      },
                    ],
                  }
                : { typeId, name: 'Mira' },
          },
        })),
      }),
    ];
  });
  const read = textModel(() => [], readOnlyScope);
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    liveFetch: live.provider,
    liveSideband: live.attach,
    modelFetch: async (input, init) => {
      const body = JSON.parse(String(init?.body));
      if (
        body.instructions.startsWith('SKYTTEL_TURN_SCOPE') &&
        JSON.parse(String(body.input[0].content)).current.startsWith('Beskriv')
      )
        return read.provider(input, init);
      if (!body.instructions.startsWith('SKYTTEL_TURN_') && [2, 6].includes(++workCalls)) {
        await held;
        return Response.json(
          { error: { message: 'Controlled temporary failure' } },
          { status: 503 },
        );
      }
      return model.provider(input, init);
    },
  });
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const map = `${app.origin}/api/households/${household.id}/map`;
    const initial: MapState = await (await page.request.get(map)).json();
    typeId = initial.types[0].id;
    expect(
      (
        await page.request.post(`${map}/draft`, {
          headers: { origin: app.origin },
          data: {
            version: initial.draft.version,
            contentVersion: initial.contentVersion,
            id: 'lo',
            baseRevision: null,
            value: {
              typeId,
              name: 'Lo Exempel',
              properties: [
                {
                  id: 'description',
                  label: 'Beskrivning',
                  kind: 'text',
                  value: 'Påhittad uppgift',
                },
              ],
            },
          },
        })
      ).status(),
    ).toBe(200);
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await page.goto(app.origin);
    await startConversationWithText(page);
    const view = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
    const field = view.getByRole('textbox', { name: 'Meddelande till Skyttel' });
    await field.fill('Ändra Lo Exempel till Lo Lind och lägg till Mira. Spara hela utkastet.');
    await view.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect.poll(() => workCalls).toBe(2);
    await field.fill('Beskriv vad ett utkast är.');
    await view.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(field).toHaveValue('');
    release();
    const notice = page.getByRole('region', { name: 'Samtalsnotis', exact: true });
    const retry = notice.getByRole('button', { name: 'Försök igen', exact: true });
    await expect(retry).toBeVisible();
    await expect(notice).toContainText('Modellen är tillfälligt otillgänglig.');
    const lo = await readDraftProposal(page, 'Lo Lind');
    await expect(lo).toContainText('Påhittad uppgift');
    await page.keyboard.press('Escape');
    const choice = view.getByRole('button', { name: /^Modell och resonemang:/ });
    await choice.click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'GPT-6.1 Terra', exact: true })
      .click();
    const sol = page.getByRole('radio', { name: 'GPT-6.1 Sol', exact: true });
    await sol.click();
    await expect(sol).toBeChecked();
    await page.keyboard.press('Escape');
    await choice.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Medium', exact: true }).click();
    await page.keyboard.press('Escape');
    expect(workCalls).toBe(2);
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(view.getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Ett utkast innehåller dina osparade ändringar.',
    );
    await expect(field).toBeFocused();
    const mira = await readDraftProposal(page, 'Mira');
    await expect(mira).toContainText('Person');
    await page.keyboard.press('Escape');
    const afterRetry: MapState = await (await page.request.get(map)).json();
    expect(afterRetry.objects).toEqual([]);
    expect(afterRetry.draft.changes.map((change) => change.after?.name)).toEqual([
      'Lo Lind',
      'Mira',
    ]);
    held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await turnMicrophoneOn(page);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    const liveId = [...live.channels.keys()][0];
    if (!liveId) throw new Error('Missing controlled voice connection');
    live.emit(liveId, {
      type: 'session.input_transcript.delta',
      event_id: crypto.randomUUID(),
      delta: 'Ändra Mira till Mira Lind. Beskriv sedan hushållets typer.',
      start_ms: 0,
      end_ms: 100,
    });
    live.emit(liveId, {
      type: 'session.delegation.created',
      event_id: crypto.randomUUID(),
      offset_ms: 100,
      delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
    });
    await expect.poll(() => workCalls).toBe(6);
    await field.fill('Beskriv kartan.');
    await view.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(field).toHaveValue('');
    release();
    const abandon = notice.getByRole('button', {
      name: 'Avstå från det oavslutade arbetet',
      exact: true,
    });
    await expect(abandon).toBeVisible();
    const changedMira = await readDraftProposal(page, 'Mira Lind');
    await expect(changedMira).toContainText('Person');
    await page.keyboard.press('Escape');
    expect(workCalls).toBe(6);
    await abandon.focus();
    await page.keyboard.press('Enter');
    await expect(view.getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Kartan har ännu inga sparade objekt.',
    );
    await expect(field).toBeFocused();
    const final: MapState = await (await page.request.get(map)).json();
    expect(final.objects).toEqual([]);
    expect(final.draft.changes.map((change) => change.after?.name)).toEqual([
      'Lo Lind',
      'Mira Lind',
    ]);
    expect(workCalls).toBe(7);
  } finally {
    release();
    await app.close();
  }
});
