import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  type ConversationNotice,
  type ConversationNoticeConditions,
  firstConversationNotice,
} from './conversation-notice.js';
import './conversation-notice.css';

const icons = {
  question: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01',
  connection: 'm3 3 18 18M8 5a8 8 0 0 1 11 11M5 8a8 8 0 0 0 11 11M8 12h8M12 8v8',
  unavailable: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M5 5l14 14',
  meter: 'M3 19v-7a9 9 0 0 1 18 0v7M12 15l5-7M7 19h10',
  microphone:
    'm3 3 18 18M9 9v3a3 3 0 0 0 5 2M9 5a3 3 0 0 1 6 1v5M5 10v2a7 7 0 0 0 12 5M19 10v2M12 19v3M8 22h8',
  warning: 'M12 3 2 21h20L12 3M12 9v5M12 18h.01',
  speaker: 'M11 5 6 9H2v6h4l5 4V5M16 9l5 6M21 9l-5 6',
};

/** Selection and announcements belong to the conversation, never to its current placement. */
export function useConversationNotice({
  conditions,
  ongoing,
  requested,
  eventKey,
  diagnostic,
}: {
  conditions: ConversationNoticeConditions;
  ongoing: boolean;
  requested: number;
  eventKey: string;
  diagnostic?: { noticeId: ConversationNotice['id']; reference?: string };
}) {
  const [dismissed, setDismissed] = useState('');
  const [usedRequest, setUsedRequest] = useState(0);
  const definition = firstConversationNotice(conditions);
  const candidate: ConversationNotice | undefined =
    definition && diagnostic?.noticeId === definition.id && diagnostic.reference
      ? { ...definition, text: `${definition.text} Felreferens: ${diagnostic.reference}.` }
      : definition;
  const identity = candidate
    ? `${candidate.id}:${candidate.kind === 'event' ? eventKey : ongoing ? 'active' : requested}`
    : '';
  const notice =
    candidate &&
    (candidate.kind === 'event' || ongoing || requested > usedRequest) &&
    dismissed !== identity
      ? candidate
      : null;
  useEffect(() => {
    if (!candidate) setUsedRequest(requested);
  }, [candidate, requested]);
  const closable = Boolean(notice && (notice.kind === 'event' || !ongoing));
  const before = useRef<{ notice: ConversationNotice | null; identity: string }>({
    notice: null,
    identity: '',
  });
  const [announcement, setAnnouncement] = useState({ count: 0, polite: '', assertive: '' });
  useEffect(() => {
    const previous = before.current;
    before.current = { notice, identity: notice ? identity : '' };
    let text = '';
    let live: 'polite' | 'assertive' = 'polite';
    if (notice && previous.identity !== identity) {
      text = `${notice.text}${notice.action ? ` ${notice.action}.` : ''}`;
      live = notice.live;
    }
    const resolved =
      previous.notice?.resolved &&
      !conditions[previous.notice.id] &&
      !(
        previous.notice.id.startsWith('disconnected') &&
        (conditions.disconnectedActive || conditions.disconnectedIdle)
      )
        ? previous.notice.resolved
        : '';
    if (text || resolved)
      setAnnouncement(({ count }) => ({
        count: count + 1,
        polite: [resolved, live === 'polite' ? text : ''].filter(Boolean).join(' '),
        assertive: live === 'assertive' ? text : '',
      }));
  }, [notice, identity, conditions]);
  return { notice, closable, dismiss: () => setDismissed(identity), announcement };
}

export function ConversationNoticeAnnouncements({
  announcement,
}: {
  announcement: { count: number; polite: string; assertive: string };
}) {
  return (
    <>
      <p className="notice-announcement" aria-live="assertive" aria-atomic="true">
        <span key={announcement.count}>{announcement.assertive}</span>
      </p>
      <p className="notice-announcement" aria-live="polite" aria-atomic="true">
        <span key={announcement.count}>{announcement.polite}</span>
      </p>
    </>
  );
}

export function ConversationNoticeCard({
  notice,
  closable,
  onDismiss,
  onAction,
  focusAfterRemoval,
  inline = false,
}: {
  notice: ConversationNotice;
  closable: boolean;
  onDismiss: () => void;
  onAction?: () => void;
  focusAfterRemoval: () => HTMLElement | null;
  /** Visual placement changes; the reading order and card identity stay put. */
  inline?: boolean;
}) {
  const element = useRef<HTMLElement>(null);
  const restore = useRef(focusAfterRemoval);
  restore.current = focusAfterRemoval;
  useLayoutEffect(
    () => () => {
      if (element.current?.contains(document.activeElement)) restore.current()?.focus();
    },
    [],
  );
  return (
    <section
      ref={element}
      className="conversation-notice"
      aria-label="Samtalsnotis"
      data-kind={notice.kind}
      data-inline={inline || undefined}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={icons[notice.icon]} />
      </svg>
      <div className="conversation-notice-content">
        <p>{notice.text}</p>
        {notice.action && (
          <button type="button" onClick={onAction}>
            {notice.action}
          </button>
        )}
      </div>
      {closable && (
        <button
          type="button"
          className="conversation-notice-close"
          aria-label="Stäng notisen"
          title="Stäng notisen"
          onClick={onDismiss}
        >
          ×
        </button>
      )}
    </section>
  );
}
