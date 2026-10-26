import { useEffect, useRef, useState } from 'react';

function tintValue(text: string) {
  const value = Number(text);
  return text.trim() && Number.isInteger(value) && value >= 0 && value <= 85 ? value : null;
}

/** One personal tint value, edited with either a native slider or a number. */
export function ZeroReferenceTint({
  id,
  value,
  busy,
  lines,
  onCommit,
  onUnsavedChange,
}: {
  id: string;
  value: number;
  busy: boolean;
  lines: boolean;
  onCommit: (value: number) => void;
  onUnsavedChange: (unsaved: boolean) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [message, setMessage] = useState('');
  const current = useRef(value);
  const currentText = useRef(String(value));
  const interaction = useRef<'pointer' | 'keyboard' | null>(null);
  const timer = useRef<number>(0);
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (lines || !busy) {
      interaction.current = null;
      current.current = value;
      currentText.current = String(value);
      setDraft(String(value));
      onUnsavedChange(false);
    }
  }, [value, busy, lines, onUnsavedChange]);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      onUnsavedChange(false);
    },
    [onUnsavedChange],
  );
  const valid = tintValue(draft) !== null;
  function commit() {
    window.clearTimeout(timer.current);
    interaction.current = null;
    onUnsavedChange(false);
    if (tintValue(currentText.current) === null) {
      current.current = value;
      currentText.current = String(value);
      setDraft(String(value));
      setMessage(`Ange ett heltal från 0 till 85. Värdet är återställt till ${value} procent.`);
      return;
    }
    setDraft(String(current.current));
    if (!busy && !lines && current.current !== value) onCommit(current.current);
  }
  function cancel() {
    window.clearTimeout(timer.current);
    interaction.current = null;
    current.current = value;
    currentText.current = String(value);
    setDraft(String(value));
    onUnsavedChange(false);
  }
  function change(text: string) {
    if (busy || lines) return;
    setDraft(text);
    currentText.current = text;
    setMessage('');
    const next = tintValue(text);
    if (next !== null) current.current = next;
    onUnsavedChange(text !== String(value));
  }
  return (
    <div className="zero-reference-tint">
      <label htmlFor={`${id}-slider`}>Tonstyrka</label>
      <input
        id={`${id}-slider`}
        type="range"
        min={0}
        max={85}
        step={1}
        value={current.current}
        disabled={lines}
        aria-disabled={busy || undefined}
        aria-valuetext={`${current.current} procent`}
        aria-describedby={`${id}-help`}
        onPointerDown={(event) => {
          if (busy) event.preventDefault();
          else {
            interaction.current = 'pointer';
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerUp={commit}
        onPointerCancel={cancel}
        onLostPointerCapture={() => {
          if (interaction.current === 'pointer') cancel();
        }}
        onKeyDown={(event) => {
          if (
            [
              'ArrowLeft',
              'ArrowRight',
              'ArrowUp',
              'ArrowDown',
              'Home',
              'End',
              'PageUp',
              'PageDown',
            ].includes(event.key)
          ) {
            if (busy) event.preventDefault();
            else interaction.current = 'keyboard';
          }
        }}
        onKeyUp={() => {
          if (interaction.current === 'keyboard') commit();
        }}
        onBlur={commit}
        onChange={(event) => {
          change(event.target.value);
          window.clearTimeout(timer.current);
          // Assistive input can change a range without a key or pointer release.
          if (!interaction.current) timer.current = window.setTimeout(commit, 150);
        }}
      />
      <label htmlFor={`${id}-number`}>Tonstyrka i procent</label>
      <input
        id={`${id}-number`}
        type="number"
        inputMode="numeric"
        min={0}
        max={85}
        step={1}
        value={draft}
        disabled={lines}
        aria-disabled={busy || undefined}
        aria-invalid={!valid || undefined}
        aria-describedby={`${id}-help${message ? ` ${id}-error` : ''}`}
        onChange={(event) => change(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
      <p id={`${id}-help`}>
        {lines
          ? 'Linjer har inga ytor att tona. Ditt värde finns kvar.'
          : '0–85 procent. Tonar delar av objektsymboler och samband bakom referensens ytor. Texten tonas inte.'}
      </p>
      {message && (
        <p id={`${id}-error`} role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
