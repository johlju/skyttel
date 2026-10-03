import { expect, type Page, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import {
  microphoneButton,
  openConversationText,
  startConversationWithText,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, textModel } from '../support/text-model.js';

const meter = (page: Page) => page.getByRole('meter', { name: 'Kontext', exact: true });
const symbol = (page: Page, percent: number) =>
  voiceBox(page).getByRole('img', { name: `Kontexten är ${percent} procent full`, exact: true });
const description = 'Så mycket av samtalets kontext som är fylld. Nytt samtal tömmer den.';
async function installation(page: Page) {
  let percent: number | null = null;
  const model = textModel(() => [modelMessage('Ett provsvar.')]);
  const modelFetch: typeof fetch = async (input, init) => {
    const response = await model.provider(input, init);
    if (percent === null) return response;
    const body = await response.json();
    body.usage.input_tokens = (1_050_000 * percent) / 100 - 30;
    body.usage.output_tokens = 30;
    body.usage.total_tokens = body.usage.input_tokens + body.usage.output_tokens;
    return Response.json(body, { headers: response.headers });
  };
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  await signIn(page.request, app.origin);
  await createHousehold(page.request, app.origin);
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(app.origin);
  return {
    app,
    live,
    setTextPercent: (value: number) => {
      percent = value;
    },
  };
}
async function send(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Meddelande till Skyttel' }).fill(text);
  await page.getByRole('button', { name: 'Skicka', exact: true }).click();
  await expect(page.getByRole('log', { name: 'Samtalstext' })).not.toContainText(
    'Skyttel arbetar…',
  );
}
function usage(live: ReturnType<typeof liveProvider>, ratio: unknown) {
  const id = [...live.channels.keys()].at(-1);
  if (!id) throw new Error('Missing voice provider session');
  live.emit(id, {
    type: 'session.usage.updated',
    event_id: crypto.randomUUID(),
    usage: { seconds: 1 },
    context_window: { usage_ratio: ratio },
  });
}

test('KONTEXT-04: textmätaren följer modellens mätning och nytt samtal tömmer den', async ({
  page,
}) => {
  const { app, setTextPercent } = await installation(page);
  try {
    await startConversationWithText(page);
    await expect(meter(page)).toHaveAttribute('value', '0');
    await expect(meter(page)).toHaveAccessibleDescription(description);
    const placement = await meter(page).evaluate((element) => ({
      y: element.getBoundingClientRect().y,
      headingBottom:
        document.querySelector('.text-view-heading')?.getBoundingClientRect().bottom ?? 0,
    }));
    expect(placement.y).toBeGreaterThanOrEqual(placement.headingBottom);
    setTextPercent(84);
    await send(page, 'Beskriv vad du kan göra.');
    await expect(meter(page)).toHaveAttribute('value', '84');
    await expect(meter(page)).toHaveAttribute('aria-valuetext', '84 procent');
    setTextPercent(92);
    await send(page, 'Beskriv det igen.');
    await expect(meter(page)).toHaveAttribute('value', '92');
    await page.getByRole('button', { name: 'Nytt samtal', exact: true }).click();
    await expect(meter(page)).toHaveAttribute('value', '0');
    await expect(page.getByRole('log', { name: 'Samtalstext' })).not.toContainText('Ett provsvar.');
  } finally {
    await app.close();
  }
});

test('KONTEXT-05: rösten visar procent från 85 och läser tröskeln en gång', async ({ page }) => {
  const { app, live } = await installation(page);
  try {
    await startConversationWithText(page);
    await turnMicrophoneOn(page);
    usage(live, 0.84);
    await expect(meter(page)).toHaveAttribute('value', '84');
    await expect(voiceBox(page).locator('.voice-context')).toHaveCount(0);
    const before = await voiceBox(page).boundingBox();
    if (!before) throw new Error('Missing voice box');
    await page.evaluate(() => {
      const words: string[] = [];
      let previous = '';
      const read = () => {
        const text = document.querySelector('.voice-context-announcement')?.textContent ?? '';
        if (text && text !== previous) words.push(text);
        previous = text;
      };
      new MutationObserver(read).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      Object.assign(window, { contextWords: words });
    });
    usage(live, 0.85);
    await expect(symbol(page, 85)).toBeVisible();
    await expect(page.locator('.voice-context-announcement')).toHaveText(
      'Kontexten är 85 procent full',
    );
    await expect(page.locator('.voice-context-announcement')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    const after = await voiceBox(page).boundingBox();
    expect(after?.height).toBe(before.height);
    expect(after?.width).toBeGreaterThan(before.width);
    usage(live, 0.88);
    await expect(symbol(page, 88)).toBeVisible();
    await expect(meter(page)).toHaveAttribute('value', '88');
    usage(live, 0.7);
    await expect(voiceBox(page).locator('.voice-context')).toHaveCount(0);
    usage(live, 0.85);
    await expect(symbol(page, 85)).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { contextWords: string[] }).contextWords),
    ).toEqual(['Kontexten är 85 procent full']);
    await microphoneButton(page).click();
    await turnMicrophoneOn(page);
    expect(
      await page.evaluate(() => (window as unknown as { contextWords: string[] }).contextWords),
    ).toEqual(['Kontexten är 85 procent full']);
    await page.getByRole('button', { name: 'Nytt samtal', exact: true }).click();
    await expect(meter(page)).toHaveAttribute('value', '0');
    await expect.poll(() => live.channels.size).toBe(1);
    await expect.poll(() => live.requests.length).toBe(2);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    usage(live, 0.85);
    await expect(symbol(page, 85)).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { contextWords: string[] }).contextWords),
      )
      .toEqual(['Kontexten är 85 procent full', 'Kontexten är 85 procent full']);
  } finally {
    await app.close();
  }
});

test('KONTEXT-06: ogiltig mätning och gamla rösthändelser ändrar inte den nya kontexten', async ({
  page,
}) => {
  const { app, live } = await installation(page);
  try {
    await startConversationWithText(page);
    await turnMicrophoneOn(page);
    usage(live, 0.85);
    await expect(meter(page)).toHaveAttribute('value', '85');
    for (const invalid of ['0.99', -1, null, undefined]) usage(live, invalid);
    await page.evaluate(() =>
      window.skyttelVoiceFixture.emit({
        type: 'session.usage.updated',
        event_id: 'untrusted-context',
        usage: { seconds: 1 },
        context_window: { usage_ratio: 1 },
      }),
    );
    await page.waitForTimeout(600);
    await expect(meter(page)).toHaveAttribute('value', '85');
    const old = [...live.channels.values()][0];
    await page.getByRole('button', { name: 'Nytt samtal', exact: true }).click();
    await expect(meter(page)).toHaveAttribute('value', '0');
    await expect.poll(() => live.requests.length).toBe(2);
    old.emit('session.usage.updated', {
      type: 'session.usage.updated',
      usage: { seconds: 1 },
      context_window: { usage_ratio: 0.99 },
    });
    usage(live, 0.2);
    await expect(meter(page)).toHaveAttribute('value', '20');
    await expect(voiceBox(page).locator('.voice-context')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

for (const width of [390, 820])
  test.describe(`pekskärm ${width}`, () => {
    test.use({
      viewport: { width, height: 1180 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    test('KONTEXT-07: mätaren och röstrutans procent går att läsa på pekskärm', async ({
      page,
    }) => {
      const { app, live, setTextPercent } = await installation(page);
      try {
        await startConversationWithText(page);
        setTextPercent(88);
        await send(page, 'Ett prov på pekskärm.');
        await expect(meter(page)).toHaveAttribute('value', '88');
        await turnMicrophoneOn(page);
        usage(live, 0.88);
        await expect(meter(page)).toHaveAttribute('value', '88');
        await expect(meter(page)).toHaveAccessibleDescription(description);
        await expect(symbol(page, 88)).toBeVisible();
        await openConversationText(page);
        await expect(meter(page)).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
      } finally {
        await app.close();
      }
    });
  });
