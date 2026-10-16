/** Fixed workspace controls share the visible area below the persistent
 * session warning, including when a visual viewport is shortened. */
export function availableViewport() {
  const visual = window.visualViewport;
  const originalTop = visual?.offsetTop ?? 0;
  const warning = document.querySelector('.session-warning');
  const top = Math.max(originalTop, warning?.getBoundingClientRect().bottom ?? 0);
  return {
    x: visual?.offsetLeft ?? 0,
    y: top,
    width: visual?.width ?? window.innerWidth,
    height: Math.max(1, (visual?.height ?? window.innerHeight) - top + originalTop),
  };
}
