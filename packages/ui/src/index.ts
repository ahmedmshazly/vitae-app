export * from './glyphs.js';
export * from './components.js';
export * from './brand.js';
export * from './forms.js';
export * from './overlay.js';
export * from './feedback.js';
export * from './layout.js';
export * from './toast.js';
export * from './theme-provider.js';

// Hooks. The package still carries no animation runtime dependency: both of
// these are plain React plus matchMedia, and design-system animation stays in
// CSS keyed off Radix data-state attributes.
export * from './use-reduced-motion.js';
// Named rather than star, because the module also exports easeFraction, which
// is the --ae-ease curve solved in JS and exists so the curve itself is
// testable. That is an implementation detail, not public API.
export { useAnimatedNumber, type AnimatedNumberOptions } from './use-animated-number.js';
