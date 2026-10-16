import { type RefObject, useLayoutEffect, useState } from 'react';
import { availableViewport as viewport } from './available-viewport.js';

export type WindowPosition = { x: number; y: number };
type Size = { width: number; height: number };
type Rectangle = WindowPosition & Size;
const reservedSurfaces =
  '.text-view, .voice-box, .conversation-notice, .map-selection-details:not(.object-property-window)';
export type FloatingArea = { viewport: Rectangle; obstacles: Rectangle[] };

export function measureFloatingArea(element: HTMLElement): FloatingArea {
  const workspace = element.closest('.household-map') ?? element;
  return {
    viewport: viewport(),
    obstacles: [...workspace.querySelectorAll<HTMLElement>(reservedSurfaces)]
      .map((surface) => surface.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0)
      .map(({ x, y, width, height }) => ({ x, y, width, height })),
  };
}

/** Visible conversation and fixed reading surfaces reserve space. Map controls
 * and movable windows are deliberately absent from this geometry. */
export function useFloatingArea(workspace: RefObject<HTMLElement | null>): FloatingArea {
  const [area, setArea] = useState<FloatingArea>(() => ({ viewport: viewport(), obstacles: [] }));
  useLayoutEffect(() => {
    const root = workspace.current;
    if (!root) return;
    const observed = new Set<Element>();
    const measure = () => {
      const elements = [...root.querySelectorAll<HTMLElement>(reservedSurfaces)];
      for (const element of observed) {
        if (!elements.includes(element as HTMLElement)) {
          resize.unobserve(element);
          observed.delete(element);
        }
      }
      for (const element of elements) {
        if (!observed.has(element)) {
          resize.observe(element);
          observed.add(element);
        }
      }
      const next = measureFloatingArea(root);
      setArea((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
    };
    const resize = new ResizeObserver(measure);
    const layout = new MutationObserver(measure);
    layout.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden'],
    });
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    return () => {
      resize.disconnect();
      layout.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, [workspace]);
  return area;
}

export function clampWindow(
  position: WindowPosition,
  size: Size,
  bounds: Rectangle,
): WindowPosition {
  return {
    x: Math.max(
      Math.ceil(bounds.x),
      Math.min(Math.round(position.x), Math.floor(bounds.x + bounds.width - size.width)),
    ),
    y: Math.max(
      Math.ceil(bounds.y),
      Math.min(Math.round(position.y), Math.floor(bounds.y + bounds.height - size.height)),
    ),
  };
}

function forbidden(size: Size, obstacles: Rectangle[]) {
  return obstacles.map((box) => ({
    left: Math.floor(box.x - size.width),
    right: Math.ceil(box.x + box.width),
    top: Math.floor(box.y - size.height),
    bottom: Math.ceil(box.y + box.height),
  }));
}

/** Find the nearest complete placement when a reserved surface appears or grows.
 * Testing obstacle edges together handles simultaneously visible conversation
 * and fixed reading surfaces. */
export function fitWindow(
  position: WindowPosition,
  size: Size,
  area: FloatingArea,
): WindowPosition {
  const origin = clampWindow(position, size, area.viewport);
  const blocked = forbidden(size, area.obstacles);
  const fits = (point: WindowPosition) =>
    blocked.every(
      (box) =>
        point.x <= box.left || point.x >= box.right || point.y <= box.top || point.y >= box.bottom,
    );
  if (fits(origin)) return origin;
  const xs = [origin.x, ...blocked.flatMap((box) => [box.left, box.right])];
  const ys = [origin.y, ...blocked.flatMap((box) => [box.top, box.bottom])];
  let closest = origin;
  let distance = Infinity;
  for (const x of xs)
    for (const y of ys) {
      const candidate = clampWindow({ x, y }, size, area.viewport);
      if (!fits(candidate)) continue;
      const nextDistance = (candidate.x - position.x) ** 2 + (candidate.y - position.y) ** 2;
      if (nextDistance < distance) {
        closest = candidate;
        distance = nextDistance;
      }
    }
  return closest;
}

function crossing(start: number, delta: number, low: number, high: number) {
  if (delta === 0) return start > low && start < high ? [-Infinity, Infinity] : null;
  return delta > 0
    ? [(low - start) / delta, (high - start) / delta]
    : [(high - start) / delta, (low - start) / delta];
}

/** Sweep the complete window through each pointer/keyboard step. At contact,
 * stop the blocked component and continue along the edge, without tunnelling
 * through an obstacle even when pointer events are far apart. */
export function moveWindow(
  origin: WindowPosition,
  requested: WindowPosition,
  size: Size,
  area: FloatingArea,
): WindowPosition {
  let current = fitWindow(origin, size, area);
  const target = clampWindow(requested, size, area.viewport);
  let delta = { x: target.x - current.x, y: target.y - current.y };
  const blocked = forbidden(size, area.obstacles);
  for (let pass = 0; pass <= blocked.length * 2; pass++) {
    let contact: { time: number; horizontal: boolean; vertical: boolean } | null = null;
    for (const box of blocked) {
      const x = crossing(current.x, delta.x, box.left, box.right);
      const y = crossing(current.y, delta.y, box.top, box.bottom);
      if (!x || !y) continue;
      const entry = Math.max(x[0], y[0]);
      const exit = Math.min(x[1], y[1]);
      if (entry < 0 || entry >= 1 || exit <= entry) continue;
      if (!contact || entry < contact.time)
        contact = { time: entry, horizontal: x[0] >= y[0], vertical: y[0] >= x[0] };
    }
    if (!contact) return { x: Math.round(current.x + delta.x), y: Math.round(current.y + delta.y) };
    current = { x: current.x + delta.x * contact.time, y: current.y + delta.y * contact.time };
    delta = {
      x: contact.horizontal ? 0 : delta.x * (1 - contact.time),
      y: contact.vertical ? 0 : delta.y * (1 - contact.time),
    };
  }
  return { x: Math.round(current.x), y: Math.round(current.y) };
}
