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

afterEach(cleanup);

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
    'voiceInterrupted',
    'voiceAdministration',
    'consentRevoked',
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
