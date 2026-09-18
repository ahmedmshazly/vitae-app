import { useRef, useState } from 'react';
import { Button, Popover, useTheme, type Theme } from '@vitae/ui';

const OPTIONS: ReadonlyArray<{ value: Theme | 'system'; label: string; detail: string }> = [
  { value: 'system', label: 'System', detail: 'Follow your device settings' },
  { value: 'light', label: 'Light', detail: 'Paper workspace' },
  { value: 'dark', label: 'Dark', detail: 'Low-light workspace' },
  { value: 'hc', label: 'High contrast', detail: 'Maximum contrast' },
];

/** A document preference belongs in the shell, alongside the other utilities,
 * rather than in a route-specific settings page. The native buttons preserve
 * Space/Enter activation and Radix handles Escape and focus return. */
export function AppearanceMenu() {
  const [open, setOpen] = useState(false);
  const { theme, setTheme, followsSystem, followSystem } = useTheme();
  const selected = followsSystem ? 'system' : theme;
  const [focused, setFocused] = useState(() => OPTIONS.findIndex((option) => option.value === selected));
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function choose(next: Theme | 'system') {
    if (next === 'system') followSystem();
    else setTheme(next);
    setOpen(false);
  }

  function moveFocus(current: number, direction: 'next' | 'previous' | 'first' | 'last') {
    const next =
      direction === 'first'
        ? 0
        : direction === 'last'
          ? OPTIONS.length - 1
          : (current + (direction === 'next' ? 1 : -1) + OPTIONS.length) % OPTIONS.length;
    optionRefs.current[next]?.focus();
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setFocused(OPTIONS.findIndex((option) => option.value === selected));
        setOpen(next);
      }}
      align="end"
      label="Appearance"
      trigger={
        <Button
          variant="ghost"
          glyph="adjust"
          aria-label={`Appearance: ${OPTIONS.find((option) => option.value === selected)?.label ?? theme}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Appearance"
        >
          <span className="topbar__action-label">Appearance</span>
        </Button>
      }
    >
      <div className="appearance-menu" role="menu" aria-label="Appearance">
        <p className="appearance-menu__label">Appearance</p>
        {OPTIONS.map((option, index) => {
          const active = option.value === selected;
          return (
            <button
              key={option.value}
              type="button"
              className="appearance-menu__option"
              role="menuitemradio"
              aria-checked={active}
              tabIndex={focused === index ? 0 : -1}
              onFocus={() => setFocused(index)}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              onClick={() => choose(option.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveFocus(index, 'next');
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveFocus(index, 'previous');
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  moveFocus(index, 'first');
                } else if (event.key === 'End') {
                  event.preventDefault();
                  moveFocus(index, 'last');
                }
              }}
            >
              <span className="appearance-menu__mark" aria-hidden>
                {active ? '●' : '○'}
              </span>
              <span>
                <strong>{option.label}</strong>
                <small>{option.detail}</small>
              </span>
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
