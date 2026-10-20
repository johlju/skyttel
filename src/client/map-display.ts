import type { MapSelection } from '../shared/text-assistant.js';

export type MapRevealRequest = {
  id: string;
  objectIds: string[];
  relationshipId?: string;
  complete?: boolean;
};

function rendered(element: Element | null): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
  );
}

function contained(element: HTMLElement | DOMRect, bounds: DOMRect) {
  const box = element instanceof HTMLElement ? element.getBoundingClientRect() : element;
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.left >= bounds.left &&
    box.right <= bounds.right &&
    box.top >= bounds.top &&
    box.bottom <= bounds.bottom
  );
}

function uncovered(element: HTMLElement, box = element.getBoundingClientRect()) {
  return element.contains(
    document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2),
  );
}

function readableObjectDetails(inspector: HTMLElement, viewport: DOMRect) {
  const body = inspector.querySelector('.object-property-body');
  const value = inspector.querySelector('.household-table-details dl > div:first-child dd');
  if (!rendered(body) || !rendered(value)) return false;
  const box = value.getBoundingClientRect();
  const firstLine = new DOMRect(
    box.x,
    box.y,
    box.width,
    Math.min(box.height, Number.parseFloat(getComputedStyle(value).lineHeight) || box.height),
  );
  return (
    contained(firstLine, body.getBoundingClientRect()) &&
    contained(firstLine, viewport) &&
    uncovered(value, firstLine)
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
          const body = inspector.querySelector('.object-property-body');
          if (body instanceof HTMLElement) body.scrollTop = 0;
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
        // Object values scroll inside the property window and may exceed
        // the viewport. Its fixed title identifies the displayed object.
        const summary = inspector.querySelector(
          target.kind === 'object' ? 'h2' : '.map-selection-summary',
        );
        const detailsBounds = inspector.getBoundingClientRect();
        if (
          nodesVisible &&
          rendered(selected) &&
          contained(selected, bounds) &&
          contained(selected, viewport) &&
          uncovered(selected) &&
          rendered(summary) &&
          contained(summary, viewport) &&
          contained(summary, detailsBounds) &&
          uncovered(summary) &&
          (target.kind !== 'object' || readableObjectDetails(inspector, viewport))
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
