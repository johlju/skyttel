import type { KeyboardEvent } from 'react';

/** A connected, enabled return target outside hidden or inert content. */
export function usableFocusTarget(element: HTMLElement | null): element is HTMLElement {
  return Boolean(
    element?.isConnected &&
      element.getClientRects().length &&
      !element.closest('[hidden], [inert]') &&
      !element.matches(':disabled'),
  );
}

/** Native modal dialogs make the background inert; keep Tab inside their content too. */
export function trapDialogTab(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const controls = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, summary, [tabindex], [contenteditable="true"]',
    ),
  ].filter(
    (element) =>
      element.tabIndex >= 0 &&
      element.getClientRects().length > 0 &&
      !element.matches(':disabled') &&
      !element.closest('[hidden], [inert]') &&
      getComputedStyle(element).visibility === 'visible',
  );
  const active = document.activeElement;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (!controls.some((element) => element === active)) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first?.focus();
  }
}
