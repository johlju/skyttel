import { randomUUID } from 'node:crypto';
import type { LiveSideband } from './live-provider.js';

/** Long answers enter as silent data. Only acknowledgement of every part
 * releases the request to speak; receipt is not proof of audible delivery. */
export function voiceCommentary(channel: LiveSideband, observe?: (event: unknown) => void) {
  type Answer = {
    remaining: number;
    delegation: string | null;
    content: string;
    current: () => boolean;
  };
  const pending = new Map<string, Answer>();
  function acknowledged(event: { client_event_id?: string }) {
    if (!event.client_event_id) return;
    const answer = pending.get(event.client_event_id);
    if (!answer) return;
    pending.delete(event.client_event_id);
    observe?.({ type: 'session.thinking.appended', client_event_id: event.client_event_id });
    if (--answer.remaining === 0 && answer.current())
      channel.send({
        type: 'session.commentary.append',
        delegation_id: answer.delegation,
        content: answer.content,
      });
  }
  channel.on('session.thinking.appended', acknowledged);
  return {
    pending: () => pending.size > 0,
    send(delegation: string | null, content: string, current: () => boolean) {
      if (!content || !current()) return;
      if (Buffer.byteLength(content, 'utf8') <= 480) {
        channel.send({ type: 'session.commentary.append', delegation_id: delegation, content });
        return;
      }
      const answerId = randomUUID();
      const parts: string[] = [];
      let text = '';
      const encode = (value: string) =>
        JSON.stringify({ answerId, part: parts.length + 1, text: value });
      for (const point of content) {
        if (Buffer.byteLength(encode(text + point), 'utf8') > 480) {
          parts.push(encode(text));
          text = '';
        }
        text += point;
      }
      if (text) parts.push(encode(text));
      const answer: Answer = {
        remaining: parts.length,
        delegation,
        content: `Svar ${answerId} är komplett: ${parts.length} numrerade delar. Återge det samlade svaret enligt användarens uppdrag och svarskällornas status.`,
        current,
      };
      // Register the whole batch before sending, including synchronous test acks.
      const events = parts.map((part) => ({
        type: 'session.thinking.append' as const,
        event_id: randomUUID(),
        delegation_id: delegation,
        content: part,
      }));
      for (const event of events) pending.set(event.event_id, answer);
      for (const event of events) {
        observe?.({ type: event.type, event_id: event.event_id, answerId });
        channel.send(event);
      }
    },
    cancel() {
      pending.clear();
    },
    close() {
      pending.clear();
      channel.off('session.thinking.appended', acknowledged);
    },
  };
}
