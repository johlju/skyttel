export type TranscriptRow = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  partial?: boolean;
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
}: {
  rows: TranscriptRow[];
  /** Skyttel is working on a spoken or a written task. */
  working: boolean;
  queued?: number;
  computer?: boolean;
}) {
  return (
    <ol role="log" aria-label="Samtalstext" className="conversation-transcript">
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
  );
}
