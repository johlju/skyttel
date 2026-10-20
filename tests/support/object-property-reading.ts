import { expect, type Locator } from '@playwright/test';

/** Read each text fragment inside the actual scrolling object window. */
export async function exposedTextLines(node: Locator, alignment: 'center' | 'start' = 'center') {
  await expect
    .poll(() =>
      node.evaluate((element, alignment) => {
        const body = element.closest<HTMLElement>('.object-property-body');
        const panel = element.closest<HTMLElement>('.map-selection-details');
        if (!body || !panel) throw new Error('Text must belong to an object reader');
        const scrollport = getComputedStyle(body).overflowY === 'visible' ? panel : body;
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const ranges: Range[] = [];
        while (walker.nextNode()) {
          if (!walker.currentNode.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(walker.currentNode);
          ranges.push(range);
        }
        const lines = () => ranges.flatMap((range) => [...range.getClientRects()]);
        const failures = [];
        for (let index = 0; index < lines().length; index++) {
          const before = lines()[index];
          const port = scrollport.getBoundingClientRect();
          const header = panel.querySelector<HTMLElement>('.object-property-header');
          const top = Math.max(
            0,
            port.top + scrollport.clientTop,
            scrollport === panel && header && getComputedStyle(header).position === 'sticky'
              ? header.getBoundingClientRect().bottom
              : 0,
          );
          const bottom = Math.min(
            innerHeight,
            port.top + scrollport.clientTop + scrollport.clientHeight,
          );
          // Keep the fragment inside the header boundary after scrollTop rounds.
          scrollport.scrollTop +=
            alignment === 'start'
              ? before.top - (top + 1)
              : before.top + before.height / 2 - (top + bottom) / 2;
          const line = lines()[index];
          const inset = Math.min(2, line.width / 4, line.height / 4);
          const points = [
            [line.left + inset, line.top + inset],
            [line.right - inset, line.top + inset],
            [line.left + inset, line.bottom - inset],
            [line.right - inset, line.bottom - inset],
            [line.left + line.width / 2, line.top + line.height / 2],
          ].map(([x, y]) => {
            const hit = document.elementFromPoint(x, y);
            return {
              x,
              y,
              owned: hit !== null && element.contains(hit),
              hit: hit?.tagName,
              hitClass: hit?.getAttribute('class'),
            };
          });
          if (
            line.top < top ||
            line.bottom > bottom ||
            line.left < Math.max(0, port.left) ||
            line.right > Math.min(innerWidth, port.right) ||
            !points.every((point) => point.owned)
          )
            failures.push({ index, bounds: line.toJSON(), top, bottom, points });
        }
        return lines().length ? failures : ['The value must contain readable text'];
      }, alignment),
    )
    .toEqual([]);
}
