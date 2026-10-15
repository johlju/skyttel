import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import './workspace-theme.css';

import type { ThemeMode, ThemePreference } from '../shared/theme-preference.js';
import { request } from './map-request.js';

export type { ThemeMode } from '../shared/theme-preference.js';

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Ljust' },
  { value: 'dark', label: 'Mörkt' },
  { value: 'system', label: 'System' },
];

type AccountTheme = {
  mode: ThemeMode;
  theme: 'light' | 'dark';
  pending: boolean;
  feedback: { error: boolean; text: string } | null;
  dismissFeedback: () => void;
  changeMode: (mode: ThemeMode) => void;
};

export const WorkspaceThemeContext = createContext<AccountTheme>({
  mode: 'system',
  theme: 'light',
  pending: false,
  feedback: null,
  dismissFeedback: () => {},
  changeMode: () => {},
});

export function useWorkspaceTheme() {
  return useContext(WorkspaceThemeContext);
}

export function useAccountTheme(userId: string | undefined): AccountTheme {
  const [saved, setSaved] = useState<{ userId?: string; mode: ThemeMode }>({ mode: 'system' });
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<AccountTheme['feedback']>(null);
  const activeUser = useRef(userId);
  const generation = useRef(0);
  const saving = useRef(false);
  useLayoutEffect(() => {
    activeUser.current = userId;
    generation.current++;
    saving.current = false;
    setPending(false);
    setFeedback(null);
    setSaved({ userId, mode: 'system' });
  }, [userId]);
  useEffect(() => {
    // Legacy copies are discarded, never imported into an account.
    for (const storage of ['localStorage', 'sessionStorage'] as const) {
      try {
        window[storage].removeItem('skyttel-theme');
      } catch {
        /* Storage may be denied. */
      }
    }
  }, []);
  useEffect(() => {
    if (!userId) return;
    let closed = false;
    const refresh = async () => {
      if (saving.current) return;
      const ticket = ++generation.current;
      try {
        const result = await request<ThemePreference>('/api/theme-preference');
        if (closed || generation.current !== ticket || activeUser.current !== userId) return;
        if (result.userId !== userId) return;
        setSaved(result);
      } catch {
        if (!closed && generation.current === ticket && activeUser.current === userId)
          setFeedback({
            error: true,
            text: 'Temavalet kunde inte hämtas. Försök igen genom att öppna Skyttel på nytt.',
          });
      }
    };
    void refresh();
    window.addEventListener('focus', refresh);
    const visible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      closed = true;
      generation.current++;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [userId]);
  const changeMode = async (mode: ThemeMode) => {
    if (!userId || saving.current) return;
    saving.current = true;
    const ticket = ++generation.current;
    setPending(true);
    setFeedback({ error: false, text: 'Sparar temavalet…' });
    try {
      const result = await request<ThemePreference>('/api/theme-preference', { mode });
      if (generation.current !== ticket || activeUser.current !== userId) return;
      if (result.userId !== userId) throw new Error('theme_owner_changed');
      setSaved(result);
      setFeedback({ error: false, text: 'Temavalet har sparats på ditt konto.' });
    } catch {
      if (generation.current !== ticket || activeUser.current !== userId) return;
      setFeedback({
        error: true,
        text: 'Temavalet kunde inte bekräftas som sparat på ditt konto. Försök igen.',
      });
    } finally {
      if (generation.current === ticket && activeUser.current === userId) {
        saving.current = false;
        setPending(false);
      }
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
  const mode = saved.userId === userId ? saved.mode : 'system';
  return {
    mode,
    theme: mode === 'system' ? (systemDark ? 'dark' : 'light') : mode,
    pending,
    feedback,
    dismissFeedback: () => setFeedback(null),
    changeMode,
  };
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
  const { pending, feedback, dismissFeedback } = useWorkspaceTheme();
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
      {feedback && (
        <p className="workspace-theme-feedback" role={feedback.error ? 'alert' : 'status'}>
          <span aria-hidden="true">{feedback.error ? '⚠ ' : pending ? '… ' : '✓ '}</span>
          {feedback.text}
          <button
            type="button"
            aria-label="Stäng temabeskedet"
            onClick={() => {
              dismissFeedback();
              buttonRef.current?.focus();
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        </p>
      )}
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
          <fieldset disabled={pending}>
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
