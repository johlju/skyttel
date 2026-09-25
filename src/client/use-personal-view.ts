import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PersonalPosition,
  PersonalView,
  Position,
  ViewSettings,
} from '../shared/personal-view.js';
import { MapRequestError, request } from './map-request.js';

export function usePersonalView(path: string, onAccessLost: () => void) {
  const [view, setView] = useState<PersonalView | null>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const current = useRef(view);
  current.current = view;
  const alive = useRef(true);
  const report = useCallback(
    (error: unknown) => {
      if (!alive.current) return;
      if (error instanceof MapRequestError && [401, 403].includes(error.status)) {
        setView(null);
        onAccessLost();
      } else
        setMessage('Din vy kunde inte sparas. Läs in aktuella placeringar innan du fortsätter.');
    },
    [onAccessLost],
  );
  useEffect(() => {
    alive.current = true;
    const abort = new AbortController();
    void request<PersonalView>(`${path}/view`, undefined, abort.signal)
      .then(setView)
      .catch((error: unknown) => {
        if (!abort.signal.aborted) report(error);
      });
    return () => {
      alive.current = false;
      abort.abort();
    };
  }, [path, report]);
  async function refresh() {
    try {
      const latest = await request<PersonalView>(`${path}/view`);
      if (alive.current) {
        setView(latest);
        setMessage('Aktuell personlig vy är inläst.');
      }
    } catch (error) {
      report(error);
    }
  }
  async function update(kind: 'position' | 'settings', body: unknown) {
    setPending(true);
    try {
      if (kind === 'position') {
        const position = await request<PersonalPosition>(`${path}/view/position`, body);
        if (alive.current)
          setView(
            (previous) =>
              previous && {
                ...previous,
                positions: [...previous.positions.filter(({ id }) => id !== position.id), position],
              },
          );
      } else {
        const settings = await request<PersonalView['settings']>(`${path}/view/settings`, body);
        if (alive.current) setView((previous) => previous && { ...previous, settings });
      }
      if (alive.current) setMessage('Din personliga vy är sparad.');
    } catch (error) {
      try {
        const latest = await request<PersonalView>(`${path}/view`);
        if (alive.current) {
          setView(latest);
          setMessage(
            error instanceof MapRequestError &&
              ['position_conflict', 'view_settings_conflict', 'content_conflict'].includes(
                error.code,
              )
              ? 'En annan klient har ändrat din vy. Din äldre ändring sparades inte. Aktuella placeringar och inställningar visas.'
              : 'Ändringen kunde inte bekräftas. Aktuella placeringar och inställningar visas.',
          );
        }
      } catch (readError) {
        if (alive.current) setView(null);
        report(readError);
      }
    } finally {
      if (alive.current) setPending(false);
    }
  }
  return {
    view,
    message,
    pending,
    refresh,
    move(id: string, position: Position) {
      if (!current.current || pending) return;
      return update('position', {
        id,
        contentVersion: current.current.contentVersion,
        position,
        version: current.current.positions.find((item) => item.id === id)?.version ?? 0,
      });
    },
    configure(settings: ViewSettings) {
      if (!current.current || pending) return;
      const version = current.current.settings.version;
      setView({ ...current.current, settings: { ...settings, version } });
      return update('settings', {
        settings,
        version,
        contentVersion: current.current.contentVersion,
      });
    },
  };
}
