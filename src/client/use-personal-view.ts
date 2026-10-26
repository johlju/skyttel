import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PersonalPosition,
  PersonalView,
  Position,
  ViewSettings,
} from '../shared/personal-view.js';
import { MapRequestError, request } from './map-request.js';

const viewFailureMessage =
  'Din vy kunde inte sparas. Läs in aktuella placeringar innan du fortsätter.';

export function usePersonalView(path: string, onAccessLost: () => void) {
  const [view, setView] = useState<PersonalView | null>(null);
  const [notice, setNotice] = useState({ message: '', id: 0, toast: false });
  const noticeId = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setMessage = useCallback((message: string, toast = false) => {
    clearTimeout(noticeTimer.current);
    const id = ++noticeId.current;
    setNotice({ message, id, toast });
    if (toast)
      noticeTimer.current = setTimeout(() => {
        setNotice((current) => (current.id === id ? { ...current, message: '' } : current));
      }, 3000);
  }, []);
  const [pending, setPending] = useState(false);
  const current = useRef(view);
  current.current = view;
  const localPositions = useRef(new Map<string, { position: Position; revision: number }>());
  const positionSaves = useRef(new Map<string, Promise<void>>());
  const alive = useRef(true);
  const generation = useRef(0);
  const settingsSaving = useRef(false);
  const settingsFailureMessage = useRef('');
  const publish = useCallback((next: PersonalView | null) => {
    current.current = next;
    setView(next);
  }, []);
  const reset = useCallback(() => {
    localPositions.current.clear();
    positionSaves.current.clear();
    settingsSaving.current = false;
    settingsFailureMessage.current = '';
    publish(null);
    setPending(false);
  }, [publish]);
  function invalidate(message: string) {
    generation.current++;
    reset();
    setMessage(message);
  }
  function mergeLocal(latest: PersonalView) {
    const positions = new Map(latest.positions.map((position) => [position.id, position]));
    if (current.current?.contentVersion === latest.contentVersion) {
      for (const position of current.current.positions)
        if (position.version > (positions.get(position.id)?.version ?? 0))
          positions.set(position.id, position);
    }
    for (const [id, local] of localPositions.current)
      positions.set(id, { id, ...local.position, version: positions.get(id)?.version ?? 0 });
    const settings =
      current.current?.contentVersion === latest.contentVersion &&
      current.current.settings.version > latest.settings.version
        ? current.current.settings
        : latest.settings;
    publish({ ...latest, positions: [...positions.values()], settings });
  }
  const report = useCallback(
    (error: unknown) => {
      if (!alive.current) return;
      if (error instanceof MapRequestError && [401, 403].includes(error.status)) {
        generation.current++;
        reset();
        onAccessLost();
      } else setMessage(viewFailureMessage);
    },
    [onAccessLost, reset, setMessage],
  );
  useEffect(() => {
    alive.current = true;
    const session = ++generation.current;
    reset();
    setMessage('');
    const abort = new AbortController();
    void request<PersonalView>(`${path}/view`, undefined, abort.signal)
      .then((latest) => {
        if (session === generation.current) publish(latest);
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted && session === generation.current) report(error);
      });
    return () => {
      alive.current = false;
      generation.current++;
      abort.abort();
      clearTimeout(noticeTimer.current);
    };
  }, [path, report, publish, reset, setMessage]);
  async function refresh() {
    const session = generation.current;
    try {
      const latest = await request<PersonalView>(`${path}/view`);
      if (session !== generation.current) return;
      if (current.current && latest.contentVersion !== current.current.contentVersion)
        invalidate('');
      settingsFailureMessage.current = '';
      mergeLocal(latest);
      setMessage(
        localPositions.current.size
          ? 'Positionen är inte sparad'
          : 'Aktuell personlig vy är inläst.',
      );
    } catch (error) {
      if (session === generation.current) report(error);
    }
  }
  function hasFailedPosition(startingId?: string) {
    return [...localPositions.current.keys()].some(
      (id) => id !== startingId && !positionSaves.current.has(id),
    );
  }
  function saveFeedback() {
    if (hasFailedPosition()) setMessage('Positionen är inte sparad');
    else if (settingsFailureMessage.current) setMessage(settingsFailureMessage.current);
    else if (!localPositions.current.size && !settingsSaving.current)
      setMessage('Din personliga vy är sparad.', true);
  }
  async function savePosition(id: string) {
    const session = generation.current;
    const contentVersion = current.current?.contentVersion;
    let completed = false;
    setPending(true);
    setMessage(hasFailedPosition(id) ? 'Positionen är inte sparad' : 'Din personliga vy sparas…');
    try {
      while (session === generation.current && current.current && localPositions.current.has(id)) {
        const local = localPositions.current.get(id);
        if (!local) break;
        const revision = local.revision;
        try {
          const position = await request<PersonalPosition>(`${path}/view/position`, {
            id,
            position: local.position,
            contentVersion,
            version: current.current.positions.find((item) => item.id === id)?.version ?? 0,
          });
          if (session !== generation.current || !current.current) return;
          if (localPositions.current.get(id)?.revision === revision)
            localPositions.current.delete(id);
          const next = { ...position, ...localPositions.current.get(id)?.position };
          publish({
            ...current.current,
            positions: [...current.current.positions.filter((item) => item.id !== id), next],
          });
        } catch (error) {
          if (session !== generation.current) return;
          if (error instanceof MapRequestError && [401, 403].includes(error.status)) {
            report(error);
            return;
          }
          if (error instanceof MapRequestError && error.code === 'position_conflict') {
            const latest = await request<PersonalView>(`${path}/view`);
            if (session !== generation.current) return;
            if (latest.contentVersion !== contentVersion) {
              invalidate('Hushållets innehåll har ersatts. Läs in kartan innan du fortsätter.');
              return;
            }
            mergeLocal(latest);
            continue;
          }
          if (
            error instanceof MapRequestError &&
            ['content_conflict', 'object_unavailable'].includes(error.code)
          ) {
            const latest = await request<PersonalView>(`${path}/view`);
            if (session !== generation.current) return;
            if (error.code === 'content_conflict' || latest.contentVersion !== contentVersion) {
              invalidate('Hushållets innehåll har ersatts. Läs in kartan innan du fortsätter.');
              return;
            }
            localPositions.current.delete(id);
            if (current.current)
              publish({
                ...current.current,
                positions: current.current.positions.filter((item) => item.id !== id),
              });
            mergeLocal(latest);
            setMessage(
              'Objektet eller hushållets innehåll har ändrats. Läs in kartan innan du fortsätter.',
            );
            return;
          }
          // A failed older request must not stop a newer local move from saving.
          if (localPositions.current.get(id)?.revision !== revision) continue;
          setMessage('Positionen är inte sparad');
          return;
        }
      }
      completed = true;
    } catch (error) {
      if (session === generation.current) {
        if (error instanceof MapRequestError && [401, 403].includes(error.status)) report(error);
        else setMessage('Positionen är inte sparad');
      }
    } finally {
      if (session === generation.current) {
        positionSaves.current.delete(id);
        setPending(positionSaves.current.size > 0 || settingsSaving.current);
        if (completed) saveFeedback();
      }
    }
  }
  async function updateSettings(body: unknown) {
    const session = generation.current;
    settingsSaving.current = true;
    settingsFailureMessage.current = '';
    setMessage('Din personliga vy sparas…');
    setPending(true);
    try {
      const settings = await request<PersonalView['settings']>(`${path}/view/settings`, body);
      if (session === generation.current && current.current)
        publish({ ...current.current, settings });
    } catch (error) {
      if (session !== generation.current) return;
      settingsFailureMessage.current = viewFailureMessage;
      try {
        const latest = await request<PersonalView>(`${path}/view`);
        if (session === generation.current) {
          if (latest.contentVersion !== current.current?.contentVersion) {
            invalidate('Hushållets innehåll har ersatts. Läs in kartan innan du fortsätter.');
            return;
          }
          mergeLocal(latest);
          settingsFailureMessage.current =
            error instanceof MapRequestError &&
            ['view_settings_conflict', 'content_conflict'].includes(error.code)
              ? 'En annan klient har ändrat din vy. Din äldre ändring sparades inte. Aktuella placeringar och inställningar visas.'
              : 'Ändringen kunde inte bekräftas. Aktuella placeringar och inställningar visas.';
          setMessage(settingsFailureMessage.current);
        }
      } catch (readError) {
        if (session === generation.current) report(readError);
      }
      return;
    } finally {
      if (session === generation.current) {
        settingsSaving.current = false;
        setPending(positionSaves.current.size > 0);
      }
    }
    if (session === generation.current) saveFeedback();
  }
  return {
    view,
    message: notice.message,
    ...(notice.toast && notice.message ? { toast: true, messageId: notice.id } : {}),
    pending,
    refresh,
    move(id: string, position: Position) {
      if (!current.current) return;
      const revision = (localPositions.current.get(id)?.revision ?? 0) + 1;
      localPositions.current.set(id, { position, revision });
      const version = current.current.positions.find((item) => item.id === id)?.version ?? 0;
      current.current = {
        ...current.current,
        positions: [
          ...current.current.positions.filter((item) => item.id !== id),
          { id, ...position, version },
        ],
      };
      publish(current.current);
      const existing = positionSaves.current.get(id);
      if (existing) return existing;
      const saving = savePosition(id);
      positionSaves.current.set(id, saving);
      return saving;
    },
    configure(settings: ViewSettings) {
      if (!current.current || positionSaves.current.size || settingsSaving.current) return;
      const version = current.current.settings.version;
      publish({ ...current.current, settings: { ...settings, version } });
      return updateSettings({
        settings,
        version,
        contentVersion: current.current.contentVersion,
      });
    },
  };
}
