import { useEffect, useRef, useState } from 'react';

/** Keep a native slider's full gesture local, then save its final value. */
export function BackgroundMotionSlider({
  id,
  label,
  value,
  percent,
  busy,
  disabled,
  onCommit,
  onUnsavedChange,
}: {
  id: string;
  label: string;
  value: number;
  percent: boolean;
  busy: boolean;
  disabled: boolean;
  onCommit: (value: number) => void;
  onUnsavedChange: (unsaved: boolean) => void;
}) {
  const [draft, setDraft] = useState(value);
  const current = useRef(value);
  const interaction = useRef<'pointer' | 'keyboard' | null>(null);
  const timer = useRef<number>(0);
  useEffect(() => {
    window.clearTimeout(timer.current);
    if (disabled || !busy) {
      interaction.current = null;
      current.current = value;
      setDraft(value);
      onUnsavedChange(false);
    }
  }, [value, busy, disabled, onUnsavedChange]);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      onUnsavedChange(false);
    },
    [onUnsavedChange],
  );
  function commit() {
    window.clearTimeout(timer.current);
    interaction.current = null;
    onUnsavedChange(false);
    if (!busy && !disabled && current.current !== value) onCommit(current.current);
  }
  function cancel() {
    window.clearTimeout(timer.current);
    interaction.current = null;
    current.current = value;
    setDraft(value);
    onUnsavedChange(false);
  }
  const display = percent ? Math.round(draft * 100) : draft;
  const text = percent ? `${display} procent` : display.toFixed(1).replace('.', ',');
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <div className="background-motion-value">
        <input
          id={id}
          type="range"
          min={percent ? 0 : 0.5}
          max={percent ? 100 : 2}
          step={percent ? 5 : 0.1}
          value={display}
          aria-valuetext={text}
          aria-disabled={busy || undefined}
          onPointerDown={(event) => {
            if (busy || disabled) event.preventDefault();
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
              if (busy || disabled) event.preventDefault();
              else interaction.current = 'keyboard';
            }
          }}
          onKeyUp={() => {
            if (interaction.current === 'keyboard') commit();
          }}
          onBlur={commit}
          onChange={(event) => {
            if (busy || disabled) return;
            const next = Number(event.target.value) / (percent ? 100 : 1);
            current.current = next;
            setDraft(next);
            onUnsavedChange(next !== value);
            window.clearTimeout(timer.current);
            // Assistive input may have no pointer/key release event.
            if (!interaction.current) timer.current = window.setTimeout(commit, 150);
          }}
        />
        <output htmlFor={id} aria-hidden="true">
          {percent ? `${display} %` : text}
        </output>
      </div>
    </div>
  );
}
