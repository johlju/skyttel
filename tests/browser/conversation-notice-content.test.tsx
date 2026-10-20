import { cleanup } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { cdp, type Locator, page, userEvent } from 'vitest/browser';
import type { MapState } from '../../src/shared/map.js';
import { restoreDesktopPointer } from '../support/browser-touch.js';
import {
  closeConversationText,
  openConversationText,
  startConversationWithText,
} from '../support/conversation-browser.js';
import { openHouseholdConversation } from '../support/household-conversation-browser.js';
import {
  assertBrowserVoiceDisposedAndRestore,
  installBrowserVoiceFixture,
} from '../support/live-browser-mode.js';

const notice = () => page.getByRole('region', { name: 'Samtalsnotis', exact: true });
const textView = () => page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
const microphone = () => page.getByRole('button', { name: 'Prata med Skyttel', exact: true });
let restoreMedia: (() => void) | undefined;

afterEach(async () => {
  cleanup();
  try {
    await assertBrowserVoiceDisposedAndRestore(restoreMedia);
  } finally {
    restoreMedia = undefined;
    vi.unstubAllGlobals();
    localStorage.clear();
  }
});

// The original startup contains Lo in Alex's private draft, not an empty map.
function proposedLo(): MapState {
  const type = {
    id: 'person',
    householdId: 'home',
    revision: 0,
    name: 'Person',
    description: '',
  };
  return {
    userId: 'alex',
    contentVersion: 1,
    types: [type],
    relationshipTypes: [],
    relationships: [],
    objects: [],
    draft: {
      version: 1,
      changes: [
        {
          id: 'lo',
          before: null,
          after: {
            typeId: type.id,
            name: 'Lo Exempel',
            properties: [
              { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Påhittad uppgift' },
            ],
          },
          type,
        },
      ],
    },
  };
}

async function contentFits(scroll = false) {
  const card = notice().element();
  for (const child of card.querySelectorAll('p, button')) {
    if (scroll) child.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    await expect
      .poll(() => {
        const outer = card.getBoundingClientRect();
        const inner = child.getBoundingClientRect();
        return (
          inner.y >= outer.y &&
          inner.bottom <= outer.bottom &&
          inner.x >= outer.x &&
          inner.right <= outer.right
        );
      })
      .toBe(true);
  }
  if (textView().elements().length > 0) {
    const composer = document.querySelector('.text-view-message');
    if (!composer) throw new Error('Missing text composer');
    await expect
      .poll(() => card.getBoundingClientRect().bottom <= composer.getBoundingClientRect().y + 1)
      .toBe(true);
  }
}

async function focusReachable(control: Locator) {
  const element = control.element();
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  element.focus();
  await expect.element(control).toHaveFocus();
  await expect
    .poll(() => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return (
        box.width > 0 &&
        box.height > 0 &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.right <= innerWidth &&
        box.bottom <= innerHeight &&
        hit !== null &&
        element.contains(hit)
      );
    })
    .toBe(true);
}

for (const configuration of [
  { caseId: 'NOT-12', name: 'dator', width: 1280, height: 800, touch: false },
  { caseId: 'NOT-13', name: 'telefon', width: 390, height: 780, touch: true },
  { caseId: 'NOT-14', name: 'bred pekskärm', width: 1024, height: 1366, touch: true },
  { caseId: 'NOT-15', name: 'kort fönster', width: 844, height: 390, touch: true },
]) {
  test(`${configuration.caseId}: text och kontroller ryms i en händelse och ett hinder, även i textvyn på ${configuration.name}`, async ({
    onTestFinished,
  }) => {
    const session = cdp();
    onTestFinished(async () => {
      // Vitest runs onTestFinished after afterEach has disposed the household.
      await session.send('Emulation.clearDeviceMetricsOverride');
      await restoreDesktopPointer(session);
    });
    restoreMedia = installBrowserVoiceFixture();
    const state = proposedLo();
    await openHouseholdConversation(configuration.width, configuration.height, state, {
      ...state.draft,
      contentVersion: state.contentVersion,
      readyToSave: true,
      conflicts: [],
      unresolvedIdentities: [],
      pendingOperations: [],
      current: { types: state.types, relationshipTypes: [] },
    });
    // page.viewport uses Playwright's desktop context metrics; override after it
    // to preserve the source's mobile viewport and text-layout behavior too.
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: configuration.width,
      height: configuration.height,
      screenWidth: configuration.width,
      screenHeight: configuration.height,
      deviceScaleFactor: 1,
      mobile: configuration.touch,
      screenOrientation:
        configuration.touch && configuration.width < configuration.height
          ? { angle: 0, type: 'portraitPrimary' }
          : { angle: configuration.touch ? 90 : 0, type: 'landscapePrimary' },
    });
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: configuration.touch });
    const topWindow = window.top;
    if (!topWindow) throw new Error('Missing top-level browser');
    // Native metrics mirror Playwright CRPage._updateViewport's isMobile path.
    // Deprecated window.orientation does not change on this existing document.
    expect(topWindow.screen.width).toBe(configuration.width);
    expect(topWindow.screen.height).toBe(configuration.height);
    expect(topWindow.screen.orientation.angle).toBe(
      configuration.touch && configuration.width > configuration.height ? 90 : 0,
    );
    expect(topWindow.screen.orientation.type).toBe(
      configuration.touch && configuration.width < configuration.height
        ? 'portrait-primary'
        : 'landscape-primary',
    );
    expect(topWindow.navigator.maxTouchPoints > 0).toBe(configuration.touch);
    const { cssVisualViewport } = await session.send('Page.getLayoutMetrics');
    expect(cssVisualViewport.clientWidth).toBe(configuration.width);
    expect(cssVisualViewport.clientHeight).toBe(configuration.height);
    expect(cssVisualViewport.scale).toBe(1);
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(configuration.touch);
    expect(innerWidth).toBe(configuration.width);
    expect(innerHeight).toBe(configuration.height);
    await expect
      .element(page.getByRole('region', { name: 'Rymdkarta', exact: true }))
      .toMatchTextContent('Lo Exempel');
    await startConversationWithText();
    await closeConversationText();
    window.skyttelVoiceFixture.setMicrophone('deny');
    await microphone().click();
    await expect.element(notice()).toMatchTextContent('Webbläsaren tillåter inte mikrofonen.');
    await contentFits();
    await focusReachable(notice().getByRole('button', { name: 'Stäng notisen' }));
    await openConversationText();
    await contentFits(configuration.height < 520);
    expect(
      textView().getByRole('region', { name: 'Utkastets återkoppling' }).elements(),
    ).toHaveLength(0);
    window.skyttelVoiceFixture.setMicrophone('allow');
    window.skyttelVoiceFixture.setPlayback('blocked');
    await microphone().click();
    await expect.element(notice()).toMatchTextContent('Webbläsaren stoppade ljudet.');
    await expect.element(notice().getByRole('button', { name: 'Starta ljudet' })).toBeVisible();
    await contentFits(configuration.height < 520);
    await focusReachable(notice().getByRole('button', { name: 'Starta ljudet' }));
    await closeConversationText();
    await contentFits();
    const recovery = notice().getByRole('button', { name: 'Starta ljudet' });
    await focusReachable(recovery);
    window.skyttelVoiceFixture.setPlayback('allow');
    await userEvent.keyboard('{Enter}');
    await expect.element(notice()).not.toBeInTheDocument();
    await expect
      .element(page.getByRole('group', { name: 'Röstruta', exact: true }))
      .toHaveTextContent('Lyssnar');
  }, 20_000);
}
