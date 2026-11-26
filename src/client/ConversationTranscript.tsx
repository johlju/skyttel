import { Fragment, useEffect, useId, useRef, useState } from 'react';
import type { ConversationWorkStep, TextAssistantView } from '../shared/text-assistant.js';
import { WorkspaceIcon } from './WorkspaceTools.js';

export type TranscriptRow = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  requestId?: string;
  speechEventIds?: string[];
  partial?: boolean;
  /** Delivery metadata for announcements only; spoken rows have no visible label. */
  voiced?: boolean;
  /** Wait for the connection's actual handoff choice before announcing typed text. */
  voicePending?: boolean;
};

const emptyWorkSteps: ConversationWorkStep[] = [];
const workKinds = { mcp: 'MCP', tool: 'Verktyg' };

function workStepText(step: ConversationWorkStep) {
  return step.count === 1 ? step.text : `${step.text} (${step.count})`;
}

function WorkStep({ step }: { step: ConversationWorkStep }) {
  const kind = workKinds[step.kind];
  return (
    <li className="conversation-row work-step">
      <span aria-hidden="true" title={kind}>
        <WorkspaceIcon name={step.kind} />
      </span>
      <span>
        <span className="visually-hidden">{kind}: </span>
        {workStepText(step)}
      </span>
    </li>
  );
}

/**
 * The conversation text: what the user and Skyttel have said and written. No
 * names are shown, and spoken rows are not marked. The user's rows stand in a
 * tinted box to the right, and screen readers are told who said what.
 */
export function ConversationTranscript({
  rows,
  interruptedRequestId,
  onContinue,
  pending,
  working,
  computer = false,
  announce = true,
  announceWorking = true,
  activity,
  workSteps = emptyWorkSteps,
  storedRows,
}: {
  rows: TranscriptRow[];
  interruptedRequestId?: string;
  onContinue?: (id: string) => void;
  pending?: boolean;
  /** Skyttel is working on a spoken or a written task. */
  working: boolean;
  computer?: boolean;
  announce?: boolean;
  announceWorking?: boolean;
  activity?: string;
  workSteps?: ConversationWorkStep[];
  storedRows?: TextAssistantView['conversation'];
}) {
  // Opening the text view is not a new reply. Remember its initial history,
  // and consume rows while hidden without announcing them on reopening.
  const seen = useRef(new Set(rows.map((row) => row.id)));
  const seenSteps = useRef(new Map(workSteps.map((step) => [step.id, step.count])));
  const interruptedMessage = useId();
  const wasWorking = useRef(working);
  const previousActivity = useRef(activity);
  const [announcement, setAnnouncement] = useState({ count: 0, reply: '', work: '' });
  useEffect(() => {
    const work: string[] = [];
    for (const step of workSteps) {
      if (seenSteps.current.get(step.id) === step.count) continue;
      seenSteps.current.set(step.id, step.count);
      work.push(`${workKinds[step.kind]}: ${workStepText(step)}.`);
    }
    if (working && activity && activity !== previousActivity.current && !work.length)
      work.push(`${activity}.`);
    const replies: string[] = [];
    if (working && !wasWorking.current && announceWorking) replies.push('Skyttel arbetar');
    for (const row of rows) {
      if (seen.current.has(row.id) || row.partial || row.voicePending || !row.text.trim()) continue;
      seen.current.add(row.id);
      if (row.role === 'assistant' && !row.voiced) replies.push(`Skyttel: ${row.text}`);
    }
    wasWorking.current = working;
    previousActivity.current = activity;
    if (announce && (replies.length || work.length))
      setAnnouncement(({ count }) => ({
        count: count + 1,
        reply: replies.join(' '),
        work: work.join(' '),
      }));
    else if (!announce)
      setAnnouncement((value) =>
        value.reply || value.work ? { ...value, reply: '', work: '' } : value,
      );
  }, [rows, working, announce, announceWorking, activity, workSteps]);
  const visibleRows = rows.filter((row) => row.text.trim());
  const users = new Map<string, TranscriptRow>();
  const speech = new Map<string, TranscriptRow>();
  const replies = new Map<string, TranscriptRow>();
  for (const row of visibleRows) {
    if (row.role === 'user') {
      users.set(row.id, row);
      for (const id of row.speechEventIds ?? []) speech.set(id, row);
    } else if (row.requestId && !replies.has(row.requestId)) replies.set(row.requestId, row);
  }
  for (const row of storedRows ?? []) {
    if (!row.requestId || !row.speechEventId) continue;
    const heard = speech.get(row.speechEventId);
    if (heard) users.set(row.requestId, heard);
  }
  const stepsByAnchor = new Map<TranscriptRow | undefined, ConversationWorkStep[]>();
  for (const step of workSteps) {
    const anchor = users.get(step.requestId) ?? replies.get(step.requestId);
    const steps = stepsByAnchor.get(anchor);
    if (steps) steps.push(step);
    else stepsByAnchor.set(anchor, [step]);
  }
  return (
    <>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        <span key={announcement.count}>
          <span className="conversation-work-announcement">{announcement.work}</span>{' '}
          <span className="conversation-announcement">{announcement.reply}</span>
        </span>
      </p>
      <ol role="log" aria-live="off" aria-label="Samtalstext" className="conversation-transcript">
        {!visibleRows.length && !workSteps.length && !working && (
          <li className="conversation-empty">Här visas det du och Skyttel säger och skriver.</li>
        )}
        {visibleRows.map((row) => {
          const interrupted = row.id === interruptedRequestId;
          const steps = stepsByAnchor
            .get(row)
            ?.map((step) => <WorkStep key={step.id} step={step} />);
          return (
            <Fragment key={row.id}>
              {row.role === 'assistant' && steps}
              <li
                id={interrupted ? interruptedMessage : undefined}
                className={`conversation-row ${row.role}`}
              >
                <span className="visually-hidden">
                  {row.role === 'user' ? 'Du: ' : 'Skyttel: '}
                </span>
                {row.text}
              </li>
              {row.role === 'user' && steps}
              {interrupted && (
                <li className="conversation-row">
                  Arbetet avbröts.{' '}
                  <button
                    type="button"
                    aria-describedby={interruptedMessage}
                    disabled={pending}
                    onClick={() => onContinue?.(row.id)}
                  >
                    Fortsätt arbetet
                  </button>
                </li>
              )}
            </Fragment>
          );
        })}
        {stepsByAnchor.get(undefined)?.map((step) => (
          <WorkStep key={step.id} step={step} />
        ))}
        {working && (
          <li className="conversation-row working">
            Skyttel arbetar…
            {activity ? ` ${activity}.` : ''}
            {computer && ' Tryck på Escape för att avbryta.'}
          </li>
        )}
      </ol>
    </>
  );
}
