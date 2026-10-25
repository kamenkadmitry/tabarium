import type { KeyboardEvent } from 'react';

/**
 * ARIA radio-group keyboarding: arrow keys move the selection within the group (wrapping at the
 * ends), Home/End jump to the edges. Attach to the element with role="radiogroup"; give every
 * option button role="radio" and `tabIndex={radioTab(checked)}` so only the checked one sits in
 * the tab order.
 */
export function radioGroupKeyDown(e: KeyboardEvent<HTMLElement>): void {
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not(:disabled)')];
  const current = radios.indexOf(document.activeElement as HTMLElement);
  if (current < 0) return;
  let next: number;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1) % radios.length;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (current - 1 + radios.length) % radios.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = radios.length - 1;
  else return;
  e.preventDefault();
  const target = radios[next];
  if (!target) return;
  target.focus();
  target.click();
}

/** Roving tabindex for a role="radio" option: the checked one is tabbable, the rest are arrow-reachable. */
export const radioTab = (checked: boolean): 0 | -1 => (checked ? 0 : -1);
