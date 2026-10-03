import { useEffect, useRef, useState } from 'react';

export type TranscriptRow = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  partial?: boolean;
  /** Delivery metadata for announcements only; spoken rows have no visible label. */
  voiced?: boolean;
  /** Wait for the connection's actual handoff choice before announcing typed text. */
  voicePending?: boolean;
};

/**
 * The conversation text: what the user and Skyttel have said and written. No
 * names are shown, and spoken rows are not marked. The user's rows stand in a
 * tinted box to the right, and screen readers are told who said what.
 */
export function ConversationTranscript({
  rows,
  working,
  queued = 0,
  computer = false,
  announce = true,
  announceWorking = true,
}: {
  rows: TranscriptRow[];
  /** Skyttel is working on a spoken or a written task. */
  working: boolean;
  queued?: number;
  computer?: boolean;
  announce?: boolean;
  announceWorking?: boolean;
}) {
  // Opening the text view is not a new reply. Remember its initial history,
  // and consume rows while hidden without announcing them on reopening.
  const seen = useRef(new Set(rows.map((row) => row.id)));
  const wasWorking = useRef(working);
  const [announcement, setAnnouncement] = useState({ count: 0, text: '' });
  useEffect(() => {
    const text: string[] = [];
    for (const row of rows) {
      if (seen.current.has(row.id) || row.partial || row.voicePending) continue;
      seen.current.add(row.id);
      if (row.role === 'assistant' && !row.voiced) text.push(`Skyttel: ${row.text}`);
    }
    if (working && !wasWorking.current && announceWorking) text.push('Skyttel arbetar');
    wasWorking.current = working;
    if (announce && text.length)
      setAnnouncement(({ count }) => ({ count: count + 1, text: text.join(' ') }));
    else if (!announce) setAnnouncement((value) => (value.text ? { ...value, text: '' } : value));
  }, [rows, working, announce, announceWorking]);
  return (
    <>
      <p
        className="visually-hidden conversation-announcement"
        aria-live="polite"
        aria-atomic="true"
      >
        <span key={announcement.count}>{announcement.text}</span>
      </p>
      <ol role="log" aria-live="off" aria-label="Samtalstext" className="conversation-transcript">
        {!rows.length && !working && (
          <li className="conversation-empty">Här visas det du och Skyttel säger och skriver.</li>
        )}
        {rows.map((row) => (
          <li key={row.id} className={`conversation-row ${row.role}`}>
            <span className="visually-hidden">{row.role === 'user' ? 'Du: ' : 'Skyttel: '}</span>
            {row.text}
          </li>
        ))}
        {working && (
          <li className="conversation-row working">
            Skyttel arbetar… {queued} {queued === 1 ? 'meddelande väntar.' : 'meddelanden väntar.'}
            {computer && ' Tryck på Escape för att avbryta.'}
          </li>
        )}
      </ol>
    </>
  );
}
