import { useEffect, useRef, useState } from 'react';
import type { Conversation } from './use-conversation.js';
import { voiceBoxStatus } from './VoiceBox.js';

export type TextButtonStatus = 'working' | 'answered' | 'waiting';
export const textButtonStatusWords = {
  working: 'Skyttel arbetar',
  answered: 'Skyttel har svarat',
  waiting: 'Skyttel väntar på ditt svar',
} as const;

/** Unread text belongs to the conversation, independently of toolbar or voice placement. */
export function useTextButtonStatus(
  conversation: Pick<Conversation, 'transcript' | 'session' | 'voice' | 'working'>,
  open: boolean,
  visible = true,
) {
  const { transcript, session, voice, working } = conversation;
  const context = `${session?.id ?? ''}:${session?.contextRevision ?? 0}`;
  const previousContext = useRef(context);
  const read = useRef(new Set<string>());
  const announced = useRef(new Set<string>());
  const latest = transcript.findLast((row) => row.role === 'assistant' && !row.partial);
  const unread = Boolean(latest && !read.current.has(latest.id));
  const status: TextButtonStatus | null =
    !visible || open
      ? null
      : working && session?.taskSource === 'text'
        ? 'working'
        : !voiceBoxStatus(voice, working) && unread
          ? session?.questionPending
            ? 'waiting'
            : 'answered'
          : null;
  const [announcement, setAnnouncement] = useState({ count: 0, text: '' });
  useEffect(() => {
    if (previousContext.current === context) return;
    previousContext.current = context;
    read.current.clear();
    announced.current.clear();
  }, [context]);
  useEffect(() => {
    if (open)
      for (const row of transcript)
        if (row.role === 'assistant' && !row.partial) read.current.add(row.id);
  }, [open, transcript]);
  useEffect(() => {
    if (!latest || !status || status === 'working') {
      setAnnouncement((value) => (value.text ? { ...value, text: '' } : value));
      return;
    }
    const occurrence = `${latest.id}:${status}`;
    if (announced.current.has(occurrence)) return;
    announced.current.add(occurrence);
    setAnnouncement(({ count }) => ({ count: count + 1, text: textButtonStatusWords[status] }));
  }, [latest, status]);
  return { status, announcement };
}
