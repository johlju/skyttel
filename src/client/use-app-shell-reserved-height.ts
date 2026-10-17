import { type RefObject, useLayoutEffect } from 'react';

/** Reserve a visible surface's height before layout consumers handle resize. */
export function useAppShellReservedHeight(
  surface: RefObject<HTMLElement | null>,
  active: boolean,
  property: string,
) {
  useLayoutEffect(() => {
    const element = surface.current;
    const shell = element?.closest<HTMLElement>('.app-shell');
    if (!active || !element || !shell) return;
    const measure = () => {
      shell.style.setProperty(property, `${element.getBoundingClientRect().height}px`);
      window.dispatchEvent(new Event('resize'));
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      shell.style.removeProperty(property);
      window.dispatchEvent(new Event('resize'));
    };
  }, [surface, active, property]);
}
