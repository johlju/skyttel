import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react';
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router';

export type LeaveConfirmation = (discard?: () => void) => void;
export type FormLeaveGuard = {
  active: () => boolean;
  leave: (proceed: LeaveConfirmation, cancel: () => void) => void;
  retain?: (pathname: string, search: string) => boolean;
  scope?: 'household';
};
const fallback = {
  register: (_guard: FormLeaveGuard) => () => {},
  requestLeave: (proceed: () => void, _cancel?: () => void) => proceed(),
  requestHouseholdLeave: (proceed: () => void, _cancel?: () => void) => proceed(),
};
const Context = createContext(fallback);
export const useFormLeave = () => useContext(Context);

/** Confirm every affected kind of work before discarding any of it. */
export function FormLeaveProvider({ children }: { children: ReactNode }) {
  const guards = useRef(new Set<FormLeaveGuard>());
  function request(candidates: FormLeaveGuard[], proceed: () => void, cancel: () => void) {
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const ordered = [...candidates].sort(
      (a, b) => Number(Boolean(a.scope)) - Number(Boolean(b.scope)),
    );
    const discards: (() => void)[] = [];
    function next(index: number) {
      const guard = ordered[index];
      if (!guard) {
        for (const discard of discards) discard();
        proceed();
      } else if (!guard.active()) next(index + 1);
      else
        guard.leave(
          (discard) => {
            if (discard) discards.push(discard);
            next(index + 1);
          },
          () => {
            cancel();
            if (origin?.isConnected) origin.focus({ preventScroll: true });
          },
        );
    }
    next(0);
  }
  const value = useRef({
    register(next: FormLeaveGuard) {
      guards.current.add(next);
      return () => {
        guards.current.delete(next);
      };
    },
    requestLeave(proceed: () => void, cancel: () => void = () => {}) {
      request(
        [...guards.current].reverse().filter((guard) => !guard.scope),
        proceed,
        cancel,
      );
    },
    requestHouseholdLeave(proceed: () => void, cancel: () => void = () => {}) {
      request([...guards.current].reverse(), proceed, cancel);
    },
    requestRouteLeave(pathname: string, search: string, proceed: () => void, cancel: () => void) {
      request(
        [...guards.current].reverse().filter((guard) => !guard.retain?.(pathname, search)),
        proceed,
        cancel,
      );
    },
  }).current;
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  return (
    <Context.Provider value={value}>
      {dataRouter && <RouteLeaveBlocker guards={guards} request={value.requestRouteLeave} />}
      {children}
    </Context.Provider>
  );
}

function RouteLeaveBlocker({
  guards,
  request,
}: {
  guards: { current: Set<FormLeaveGuard> };
  request: (pathname: string, search: string, proceed: () => void, cancel: () => void) => void;
}) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    [...guards.current].some(
      (guard) =>
        guard.active() &&
        !guard.retain?.(nextLocation.pathname, nextLocation.search) &&
        (currentLocation.pathname !== nextLocation.pathname ||
          currentLocation.search !== nextLocation.search),
    ),
  );
  useEffect(() => {
    if (blocker.state === 'blocked')
      request(blocker.location.pathname, blocker.location.search, blocker.proceed, blocker.reset);
  }, [blocker, request]);
  return null;
}
