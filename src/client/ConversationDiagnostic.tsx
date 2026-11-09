import { type ReactNode, useId, useState } from 'react';

/** Preview and clipboard always use the same, unabridged report. */
export function ConversationDiagnostic({
  report,
  text,
  children,
}: {
  report: string;
  text: string;
  children?: ReactNode;
}) {
  const contentId = useId();
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState('');
  const [copying, setCopying] = useState(false);
  async function copy() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(report);
      setStatus('Felrapporten är kopierad.');
    } catch {
      setExpanded(true);
      setStatus('Kunde inte kopiera. Markera och kopiera den expanderade feltexten.');
    } finally {
      setCopying(false);
    }
  }
  return (
    <>
      <div className="conversation-notice-content">
        <p className="conversation-diagnostic-text">
          <span id={contentId} data-diagnostic-report={expanded || undefined}>
            {expanded ? report : text}
          </span>{' '}
          <button
            type="button"
            className="conversation-diagnostic-toggle"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Visa mindre' : 'Läs mer'}
          </button>
        </p>
        {children}
        <p role="status">{status}</p>
      </div>
      <button
        type="button"
        className="conversation-diagnostic-copy"
        aria-label="Kopiera felrapport"
        title="Kopiera felrapport"
        disabled={copying}
        onClick={() => void copy()}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <rect x="8" y="8" width="12" height="13" rx="2" />
          <path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" />
        </svg>
      </button>
    </>
  );
}
