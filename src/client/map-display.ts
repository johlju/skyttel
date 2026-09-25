import type { MapSelection } from '../shared/text-assistant.js';

export type MapRevealRequest = {
  id: string;
  objectIds: string[];
  relationshipId?: string;
};

function rendered(element: Element | null): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
  );
}

function contained(element: HTMLElement, bounds: DOMRect) {
  const box = element.getBoundingClientRect();
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.left >= bounds.left &&
    box.right <= bounds.right &&
    box.top >= bounds.top &&
    box.bottom <= bounds.bottom
  );
}

function uncovered(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  return element.contains(
    document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2),
  );
}

/** Resolve only after the actual map and populated inspector show the requested item. */
export function waitForMapDisplay(
  root: HTMLElement,
  request: MapRevealRequest,
  target: MapSelection,
  signal: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    let frame = 0;
    let scrolled = false;
    const finish = (displayed: boolean) => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      document.removeEventListener('visibilitychange', visibility);
      resolve(displayed);
    };
    const abort = () => finish(false);
    const visibility = () => {
      if (document.visibilityState !== 'visible') finish(false);
    };
    const timeout = window.setTimeout(abort, 5_000);
    const inspect = () => {
      if (signal.aborted || !root.isConnected || document.visibilityState !== 'visible') {
        finish(false);
        return;
      }
      const surface = root.querySelector('.spatial-surface');
      const inspector = root.querySelector(
        `[data-selection-kind="${target.kind}"][data-selection-id="${CSS.escape(target.id)}"]`,
      );
      if (
        rendered(surface) &&
        surface.dataset.revealRequest === request.id &&
        rendered(inspector)
      ) {
        const visibleViewport = window.visualViewport;
        const viewport = new DOMRect(
          visibleViewport?.offsetLeft ?? 0,
          visibleViewport?.offsetTop ?? 0,
          visibleViewport?.width ?? window.innerWidth,
          visibleViewport?.height ?? window.innerHeight,
        );
        // The working notice is opaque even though it lets pointer events through.
        const indicator = root.querySelector('.assistant-work-indicator.is-working');
        if (rendered(indicator))
          viewport.height = Math.max(
            0,
            Math.min(viewport.bottom, indicator.getBoundingClientRect().top - 8) - viewport.top,
          );
        const nodes = request.objectIds.map((id) =>
          surface.querySelector(`.spatial-node[data-object-id="${CSS.escape(id)}"]`),
        );
        const selected = surface.querySelector(
          target.kind === 'object'
            ? `.spatial-node[data-object-id="${CSS.escape(target.id)}"][aria-pressed="true"]`
            : `.spatial-edge[data-layout-id="relationship-${CSS.escape(target.id)}"].selected`,
        );
        if (!scrolled && nodes.every(rendered) && rendered(selected)) {
          inspector.scrollTop = 0;
          const mapBox = surface.getBoundingClientRect();
          const detailsBox = inspector.getBoundingClientRect();
          let top = Math.min(mapBox.top, detailsBox.top);
          let bottom = Math.max(mapBox.bottom, detailsBox.bottom);
          if (bottom - top > viewport.height) {
            // Short desktop windows may not fit the entire map surface plus
            // its toolbar offset. Keep the actual selection and inspector in view.
            const boxes = [...nodes, selected].map((element) => element.getBoundingClientRect());
            top = Math.min(detailsBox.top, ...boxes.map((box) => box.top));
            bottom = Math.max(detailsBox.bottom, ...boxes.map((box) => box.bottom));
          }
          window.scrollBy({
            top: (top + bottom - viewport.top - viewport.bottom) / 2,
            behavior: 'instant',
          });
          scrolled = true;
        }
        const bounds = surface.getBoundingClientRect();
        const nodesVisible = nodes.every((node) => {
          return (
            rendered(node) &&
            contained(node, bounds) &&
            contained(node, viewport) &&
            uncovered(node)
          );
        });
        const summary = inspector.querySelector('p');
        if (
          nodesVisible &&
          rendered(selected) &&
          contained(selected, bounds) &&
          contained(selected, viewport) &&
          uncovered(selected) &&
          contained(inspector, viewport) &&
          uncovered(inspector) &&
          rendered(summary) &&
          contained(summary, inspector.getBoundingClientRect()) &&
          uncovered(summary)
        ) {
          finish(true);
          return;
        }
      }
      frame = requestAnimationFrame(inspect);
    };
    signal.addEventListener('abort', abort, { once: true });
    document.addEventListener('visibilitychange', visibility);
    frame = requestAnimationFrame(inspect);
  });
}
