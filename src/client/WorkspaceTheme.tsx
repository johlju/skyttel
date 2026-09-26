import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import './workspace-theme.css';

export type ThemeMode = 'light' | 'dark' | 'system';

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Ljust' },
  { value: 'dark', label: 'Mörkt' },
  { value: 'system', label: 'System' },
];

export function useWorkspaceTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('skyttel-theme');
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch {
      return 'system';
    }
  });
  const changeMode = (value: ThemeMode) => {
    setMode(value);
    try {
      localStorage.setItem('skyttel-theme', value);
    } catch {
      /* Theme also works without browser storage. */
    }
  };
  const [systemDark, setSystemDark] = useState(
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const preference = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  const theme = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
  return { mode, theme, changeMode };
}

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  return (
    <svg
      className="workspace-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {mode === 'light' ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      ) : mode === 'dark' ? (
        <path d="M20.4 15.3A8.7 8.7 0 0 1 8.7 3.6a8.8 8.8 0 1 0 11.7 11.7Z" />
      ) : (
        <>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8m-4-4v4" />
        </>
      )}
    </svg>
  );
}

export function WorkspaceTheme({
  mode,
  onChange,
}: {
  mode: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 12, left: 12 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const popupId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const radioName = useId();
  const currentLabel = themeOptions.find((option) => option.value === mode)?.label;

  useLayoutEffect(() => {
    if (!open) return;
    const positionPopup = () => {
      const button = buttonRef.current;
      const popup = popupRef.current;
      if (!button || !popup) return;
      const anchor = button.getBoundingClientRect();
      const width = popup.offsetWidth;
      const height = popup.offsetHeight;
      const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
      const below = anchor.bottom + 8;
      const top =
        below + height <= window.innerHeight - 12 ? below : Math.max(12, anchor.top - height - 8);
      setPosition({ top, left });
    };
    positionPopup();
    popupRef.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', positionPopup, true);
    return () => {
      window.removeEventListener('resize', positionPopup);
      window.removeEventListener('scroll', positionPopup, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !popupRef.current?.contains(event.target) &&
        !buttonRef.current?.contains(event.target)
      ) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <div className="workspace-theme-control">
      <button
        type="button"
        ref={buttonRef}
        className="workspace-theme-button"
        aria-label={`Tema: ${currentLabel}. Byt tema`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        title={`Tema: ${currentLabel}`}
        onClick={() => setOpen((value) => !value)}
      >
        <ThemeIcon mode={mode} />
        <span className="workspace-label">Tema</span>
      </button>
      {open && (
        <div
          id={popupId}
          ref={popupRef}
          className="workspace-theme-popup"
          role="dialog"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          style={position}
          onBlur={(event) => {
            if (
              event.relatedTarget instanceof Node &&
              !event.currentTarget.contains(event.relatedTarget) &&
              event.relatedTarget !== buttonRef.current
            ) {
              setOpen(false);
            }
          }}
        >
          <fieldset>
            <legend id={titleId}>Tema</legend>
            {themeOptions.map((option) => (
              <label key={option.value} className="workspace-theme-option">
                <input
                  type="radio"
                  name={radioName}
                  value={option.value}
                  checked={mode === option.value}
                  onClick={() => {
                    if (mode === option.value) {
                      setOpen(false);
                      buttonRef.current?.focus();
                    }
                  }}
                  onChange={() => {
                    onChange(option.value);
                    setOpen(false);
                    buttonRef.current?.focus();
                  }}
                />
                <ThemeIcon mode={option.value} />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
          <p id={descriptionId}>System följer enhetens inställning.</p>
        </div>
      )}
    </div>
  );
}
