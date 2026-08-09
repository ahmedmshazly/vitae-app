/**
 * Celebration micro-burst: pops a radial spark ring (.vt-burst in @vitae/ui)
 * on the element, used when the user completes something (habit check,
 * favor settled, reminder done). Pure DOM class toggle; safe to call from
 * any click handler; respects prefers-reduced-motion via the CSS.
 */
export function burst(el: HTMLElement | null, tone: 'accent' | 'ember' = 'accent'): void {
  if (!el) return;
  el.classList.remove('vt-burst', 'vt-burst--ember');
  // Force a reflow so re-triggering restarts the animation.
  void el.offsetWidth;
  el.classList.add('vt-burst');
  if (tone === 'ember') el.classList.add('vt-burst--ember');
  el.addEventListener(
    'animationend',
    () => el.classList.remove('vt-burst', 'vt-burst--ember'),
    { once: true },
  );
}
