import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import {
  ConversationNoticeAnnouncements,
  ConversationNoticeCard,
  useConversationNotice,
} from '../../../src/client/ConversationNotice.js';
import {
  type ConversationNoticeConditions,
  firstConversationNotice,
} from '../../../src/client/conversation-notice.js';
import { VoiceSessionContext } from '../../../src/client/voice-session-context.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';

afterEach(cleanup);

test.each([
  ['saveChecking', 'polite'],
  ['saveCheckFailed', 'assertive'],
  ['disconnectedActive', 'assertive'],
  ['disconnectedIdle', 'assertive'],
  ['unavailable', 'assertive'],
  ['contextFull', 'assertive'],
  ['microphoneDenied', 'assertive'],
  ['microphoneMissing', 'assertive'],
  ['microphoneBusy', 'assertive'],
  ['voiceUnsupported', 'assertive'],
  ['voiceStartFailed', 'assertive'],
  ['voiceSessionExpired', 'assertive'],
  ['voiceInterrupted', 'assertive'],
  ['voiceAdministration', 'assertive'],
  ['consentRevoked', 'assertive'],
  ['actionBlocked', 'assertive'],
  ['taskFailed', 'polite'],
  ['playbackStopped', 'polite'],
] as const)('%s announces its text and action in the specified %s region', (id, live) => {
  function Screen() {
    const state = useConversationNotice({
      conditions: { [id]: true },
      ongoing: true,
      requested: 0,
      eventKey: 'occurrence',
    });
    return <ConversationNoticeAnnouncements announcement={state.announcement} />;
  }
  render(<Screen />);
  const definition = firstConversationNotice({ [id]: true });
  const action = definition && 'action' in definition ? definition.action : '';
  expect(document.querySelector(`[aria-live="${live}"]`)?.textContent).toBe(
    `${definition?.text}${action ? ` ${action}.` : ''}`,
  );
  expect(
    document.querySelector(`[aria-live="${live === 'polite' ? 'assertive' : 'polite'}"]`)
      ?.textContent,
  ).toBe('');
});

test('draft recovery and registered-save recovery announce their distinct outcomes when the same control changes purpose', () => {
  function Screen({ batchPending }: { batchPending: boolean }) {
    const state = useConversationNotice({
      conditions: { saveChecking: true },
      batchPending,
      ongoing: true,
      requested: 0,
      eventKey: 'same-check',
    });
    return <ConversationNoticeAnnouncements announcement={state.announcement} />;
  }
  const { rerender } = render(<Screen batchPending />);
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
    'Det är oklart om ändringarna genomfördes. Skyttel kontrollerar det.',
  );
  rerender(<Screen batchPending={false} />);
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
    'Det är oklart om utkastet sparades. Skyttel kontrollerar det.',
  );
});

test.each([false, true])(
  'a new spoken refusal is visible and announced once with or without pending work recovery: %s',
  (recoverable) => {
    const refusal = { id: 'new-refusal', text: 'Det nya talade uppdraget kunde inte starta.' };
    const workFailure: TextAssistantView['workFailure'] = recoverable
      ? {
          requestId: 'older-task',
          request: 'Läs kartan.',
          code: 'assistant_provider_failed',
          message: 'Det tidigare uppdraget behöver ett nytt försök.',
          retry: 'Försök igen',
        }
      : undefined;
    function Screen({ refused }: { refused: boolean }) {
      const state = useConversationNotice({
        conditions: { taskFailed: true },
        workFailure,
        voiceRefusal: refused ? refusal : undefined,
        ongoing: true,
        requested: 0,
        eventKey: 'older-task',
      });
      return (
        <>
          <ConversationNoticeAnnouncements announcement={state.announcement} />
          {state.notice && (
            <ConversationNoticeCard
              notice={state.notice}
              closable={state.closable}
              onDismiss={state.dismiss}
              focusAfterRemoval={() => null}
            />
          )}
        </>
      );
    }
    const { rerender } = render(<Screen refused={false} />);
    const polite = document.querySelector('[aria-live="polite"]');
    const priorNotice = recoverable
      ? 'Det tidigare uppdraget behöver ett nytt försök.'
      : 'Skyttel kunde inte slutföra uppdraget.';
    expect(polite?.textContent).toContain(priorNotice);
    rerender(<Screen refused />);
    expect(polite?.textContent).toBe(refusal.text);
    const announcement = polite?.firstElementChild;
    const cards = screen.getAllByRole('region', { name: 'Samtalsnotis' });
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain(refusal.text);
    expect(screen.queryByRole('button', { name: 'Försök igen' }) !== null).toBe(recoverable);
    if (recoverable) expect(cards[0].textContent).toContain(priorNotice);
    rerender(<Screen refused />);
    expect(polite?.firstElementChild).toBe(announcement);
  },
);

test('a refusal supplements the assertive save blocker without surviving dismissal or revoked consent', () => {
  const refusal = { id: 'refused-spoken-request', text: 'Det talade uppdraget startade inte.' };
  function Screen({
    checking,
    revoked = false,
    refusalId = refusal.id,
  }: {
    checking: boolean;
    revoked?: boolean;
    refusalId?: string;
  }) {
    const state = useConversationNotice({
      conditions: { saveCheckFailed: checking, consentRevoked: revoked },
      voiceRefusal: { ...refusal, id: refusalId },
      ongoing: true,
      requested: 0,
      eventKey: 'current',
    });
    return (
      <>
        <ConversationNoticeAnnouncements announcement={state.announcement} />
        {state.notice && (
          <ConversationNoticeCard
            notice={state.notice}
            closable={state.closable}
            onDismiss={state.dismiss}
            focusAfterRemoval={() => null}
          />
        )}
      </>
    );
  }
  const { rerender } = render(<Screen checking />);
  const polite = document.querySelector('[aria-live="polite"]');
  expect(polite?.textContent).toBe(refusal.text);
  const announcement = polite?.firstElementChild;
  expect(document.querySelector('[aria-live="assertive"]')?.textContent).toContain(
    'Skyttel kunde inte kontrollera om utkastet sparades.',
  );
  expect(screen.getByRole('button', { name: 'Kontrollera om utkastet sparades' })).toBeDefined();
  expect(screen.getByRole('region', { name: 'Samtalsnotis' }).textContent).toContain(refusal.text);
  rerender(<Screen checking={false} />);
  expect(polite?.firstElementChild).toBe(announcement);
  act(() => screen.getByRole('button', { name: 'Stäng notisen' }).click());
  expect(screen.queryByRole('region', { name: 'Samtalsnotis' })).toBeNull();
  expect(polite?.textContent).toBe('');
  rerender(<Screen checking={false} refusalId="another-refusal" />);
  expect(polite?.textContent).toBe(refusal.text);
  rerender(<Screen checking={false} revoked refusalId="another-refusal" />);
  expect(screen.getByRole('region', { name: 'Samtalsnotis' }).textContent).not.toContain(
    refusal.text,
  );
  expect(polite?.textContent).toBe('');
});

test('all conversation situations follow the single priority order, including future notices', () => {
  const order = [
    'saveChecking',
    'saveCheckFailed',
    'disconnectedActive',
    'disconnectedIdle',
    'unavailable',
    'contextFull',
    'microphoneDenied',
    'microphoneMissing',
    'microphoneBusy',
    'voiceUnsupported',
    'voiceStartFailed',
    'voiceSessionExpired',
    'voiceInterrupted',
    'voiceAdministration',
    'consentRevoked',
    'actionBlocked',
    'taskFailed',
    'playbackStopped',
  ] as const;
  const conditions: ConversationNoticeConditions = Object.fromEntries(
    order.map((id) => [id, true]),
  );
  for (const id of order) {
    expect(firstConversationNotice(conditions)?.id).toBe(id);
    delete conditions[id];
  }
  expect(firstConversationNotice(conditions)).toBeUndefined();
});

test('a notice announces its action once and moving its card keeps the existing announcement', async () => {
  function Screen({ textOpen }: { textOpen: boolean }) {
    const { notice, closable, dismiss, announcement } = useConversationNotice({
      conditions: { playbackStopped: true },
      ongoing: true,
      requested: 0,
      eventKey: 'one',
    });
    const card = notice && (
      <ConversationNoticeCard
        notice={notice}
        closable={closable}
        onDismiss={dismiss}
        focusAfterRemoval={() => null}
      />
    );
    return (
      <>
        <ConversationNoticeAnnouncements announcement={announcement} />
        <section aria-label="Hörnet">{!textOpen && card}</section>
        <section aria-label="Textvyn">{textOpen && card}</section>
      </>
    );
  }
  const view = render(<Screen textOpen={false} />);
  const live = () => document.querySelector('.notice-announcement[aria-live="polite"] span');
  expect(live()?.textContent).toBe('Webbläsaren stoppade ljudet. Starta ljudet.');
  const first = live();
  expect(screen.getByRole('button', { name: 'Starta ljudet' })).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Stäng notisen' })).toBeNull();
  await act(() => view.rerender(<Screen textOpen />));
  expect(live()).toBe(first);
  expect(screen.getAllByRole('region', { name: 'Samtalsnotis' })).toHaveLength(1);
});

test('an application-owned voice expiry stays visible without a second conversation announcement', () => {
  function Screen() {
    const state = useConversationNotice({
      conditions: { voiceSessionExpired: true },
      ongoing: false,
      requested: 0,
      eventKey: 'expired',
    });
    return (
      <>
        <ConversationNoticeAnnouncements announcement={state.announcement} />
        {state.notice && (
          <ConversationNoticeCard
            notice={state.notice}
            closable={false}
            onDismiss={() => {}}
            focusAfterRemoval={() => null}
          />
        )}
      </>
    );
  }
  render(
    <VoiceSessionContext value={{ active: () => {}, expired: () => {} }}>
      <Screen />
    </VoiceSessionContext>,
  );
  expect(screen.getByRole('region', { name: 'Samtalsnotis' }).textContent).toContain(
    'Din inloggning har gått ut. Logga in igen. Lämna hela instruktionen på nytt.',
  );
  expect(document.querySelector('[aria-live="assertive"]')?.textContent).toBe('');
});
