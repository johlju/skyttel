import { useLayoutEffect, useRef } from 'react';

export type TranscriptRow = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  partial?: boolean;
};

export function ConversationTranscript({ rows }: { rows: TranscriptRow[] }) {
  const log = useRef<HTMLOListElement>(null);
  const follow = useRef(true);
  useLayoutEffect(() => {
    if (rows.length && log.current && follow.current)
      log.current.scrollTop = log.current.scrollHeight;
  }, [rows]);
  return (
    <section aria-label="Assistentens samtalstext" className="assistant-utterance">
      <h4>Assistentens samtalstext – inte en bekräftelse</h4>
      <p>
        Samtalstexten kan innehålla fel. Sparande och markering bekräftas bara av Skyttels status
        och kvitton.
      </p>
      <ol
        ref={log}
        role="log"
        aria-label="Samtalets dialog"
        aria-relevant="additions text"
        className="conversation-transcript"
        onScroll={() => {
          const element = log.current;
          if (element)
            follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
      >
        {rows.map((row) => (
          <li
            key={row.id}
            className={`conversation-row ${row.role}${row.partial ? ' partial' : ''}`}
          >
            <strong>{row.role === 'user' ? 'Du' : 'Skyttel'}</strong>
            <p>{row.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
