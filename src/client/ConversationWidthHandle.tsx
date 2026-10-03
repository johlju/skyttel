import { useEffect, useRef } from 'react';

/** An adjustable separator: dragging and arrow keys operate the same width. */
export function ConversationWidthHandle({
  name,
  value,
  minimum,
  maximum,
  controls,
  onPreview,
  onCommit,
  onCancel,
}: {
  name: string;
  value: number;
  minimum: number;
  maximum: number;
  controls: string;
  onPreview: (width: number) => void;
  onCommit: (width: number) => void;
  onCancel: () => void;
}) {
  const drag = useRef<{
    id: number;
    x: number;
    width: number;
    next: number;
    maximum: number;
  } | null>(null);
  const callbacks = useRef({ onCancel });
  callbacks.current = { onCancel };
  useEffect(
    () => () => {
      if (drag.current) callbacks.current.onCancel();
    },
    [],
  );
  const clamp = (width: number, limit = maximum) =>
    Math.max(minimum, Math.min(limit, Math.round(width)));
  return (
    <hr
      className="conversation-width-handle"
      tabIndex={0}
      aria-label={name}
      aria-orientation="vertical"
      aria-controls={controls}
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={value}
      aria-valuetext={`${value} bildpunkter`}
      aria-description="Dra eller använd vänster- och högerpil för att ändra bredden."
      title={`${name}. Dra eller använd vänster- och högerpil.`}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        event.stopPropagation();
        const next = clamp(value + (event.key === 'ArrowLeft' ? 24 : -24));
        if (next !== value) onCommit(next);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = {
          id: event.pointerId,
          x: event.clientX,
          width: value,
          next: value,
          maximum,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        current.next = clamp(current.width + current.x - event.clientX, current.maximum);
        onPreview(current.next);
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        if (current.next !== current.width) onCommit(current.next);
        else onCancel();
      }}
      onLostPointerCapture={() => {
        if (!drag.current) return;
        drag.current = null;
        onCancel();
      }}
    />
  );
}
