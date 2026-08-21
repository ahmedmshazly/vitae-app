/**
 * Form primitives (FR-CAP-002). Controlled where a widget has structure
 * (tags, rating, money, lists); ref-forwarding native elements where
 * react-hook-form's `register` wants direct DOM access (inputs, textareas).
 * All styling lives in styles/components.css on the token system.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { Glyph } from './glyphs.js';
import { cn } from './lib/cn.js';

// ── Field wrapper (label + help + error) ─────────────────────────────────────
export interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  help?: string;
  error?: string;
  children: ReactNode;
}
export function Field({ label, htmlFor, required, help, error, children }: FieldProps) {
  return (
    <div className={cn('vt-fld', error && 'vt-fld--error')}>
      <label className="vt-fld__label" htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="vt-fld__req" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <span className="vt-fld__error" role="alert">
          {error}
        </span>
      ) : (
        help && <span className="vt-fld__help">{help}</span>
      )}
    </div>
  );
}

// ── Input / Textarea ─────────────────────────────────────────────────────────
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  invalid?: boolean;
}
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { mono, invalid, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn('vt-inp', mono && 'u-mono', invalid && 'vt-inp--invalid', className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  autoGrow?: boolean;
}
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, autoGrow = true, className, onInput, ...rest },
  ref,
) {
  const grow = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 320)}px`;
  }, []);
  return (
    <textarea
      ref={ref}
      rows={3}
      className={cn('vt-inp', 'vt-inp--area', invalid && 'vt-inp--invalid', className)}
      aria-invalid={invalid || undefined}
      onInput={(e) => {
        if (autoGrow) grow(e.currentTarget);
        onInput?.(e);
      }}
      {...rest}
    />
  );
});

// ── Select (Radix: portal, keyboard-first) ─────────────────────────────────
export interface SelectOptionItem {
  value: string;
  label: string;
}
export interface SelectProps {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: SelectOptionItem[];
  placeholder?: string;
  mono?: boolean;
  invalid?: boolean;
  clearable?: boolean;
  id?: string;
  disabled?: boolean;
  /**
   * Names the control for assistive tech. Radix renders the trigger as a
   * `<button role="combobox">`, and a `<label for>` does not name a button, so
   * a Select used on its own had no accessible name (axe: `button-name`).
   * Required when no visible label sits beside it in the accessibility tree.
   */
  label?: string;
  /**
   * Forwarded to the trigger. Input and Textarea spread rest props; Select used
   * to drop them, so `aria-label="Status filter"` looked labelled in source and
   * was unlabeled in the browser.
   */
  'aria-label'?: string;
  'aria-labelledby'?: string;
}
/** Clear-item sentinel. Radix Select forbids an empty value, so the option
 * needs a token no real option can collide with. */
const CLEAR = '__vt_select_clear__';
export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  mono,
  invalid,
  clearable = true,
  id,
  disabled,
  label,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: SelectProps) {
  return (
    <RadixSelect.Root
      value={value ?? ''}
      onValueChange={(v) => onChange(v === CLEAR ? undefined : v)}
      disabled={disabled}
    >
      <RadixSelect.Trigger
        id={id}
        className={cn('vt-sel', mono && 'u-mono', invalid && 'vt-inp--invalid')}
        aria-label={label ?? ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-invalid={invalid || undefined}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon className="vt-sel__chev">
          <Glyph name="chevron-down" size={13} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="vt-sel__content" position="popper" sideOffset={4}>
          <RadixSelect.Viewport className="vt-sel__viewport">
            {clearable && value && (
              <RadixSelect.Item value={CLEAR} className="vt-sel__item vt-sel__item--clear">
                <RadixSelect.ItemText>Clear</RadixSelect.ItemText>
              </RadixSelect.Item>
            )}
            {options.map((o) => (
              <RadixSelect.Item key={o.value} value={o.value} className={cn('vt-sel__item', mono && 'u-mono')}>
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="vt-sel__check">
                  <Glyph name="check" size={12} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

// ── Checkbox (Radix) ─────────────────────────────────────────────────────────
export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  id?: string;
  disabled?: boolean;
  /**
   * Where the box sits against the label. Default centres it, which reads well
   * for a one-line label and badly for a wrapped paragraph, so multi-line
   * labels pass 'start' to keep the box on the first line.
   */
  align?: 'center' | 'start';
}
export function Checkbox({ checked, onChange, label, id, disabled, align }: CheckboxProps) {
  return (
    <label className={cn('vt-check', align === 'start' && 'vt-check--start')}>
      <RadixCheckbox.Root
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        className="vt-check__box"
        disabled={disabled}
      >
        <RadixCheckbox.Indicator className="vt-check__mark">
          <Glyph name="check" size={11} />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      {label && <span className="vt-check__label">{label}</span>}
    </label>
  );
}

// ── TagInput (chips + Enter/comma/paste, Backspace pops) ────────────────────
export interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  mono?: boolean;
  id?: string;
}
export function TagInput({ value, onChange, placeholder = 'Add…', mono, id }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !value.includes(s));
    if (parts.length) onChange([...value, ...parts]);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className={cn('vt-tags', mono && 'u-mono')} onClick={() => inputRef.current?.focus()}>
      {value.map((tag) => (
        <span key={tag} className="vt-tags__tag">
          {tag}
          <button
            type="button"
            className="vt-tags__x"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((t) => t !== tag))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        className="vt-tags__input"
        value={draft}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && commit(draft)}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text');
          if (text.includes(',')) {
            e.preventDefault();
            commit(text);
          }
        }}
      />
    </div>
  );
}

// ── Rating (1-5 dots: ClosenessDots visual language, interactive) ──────────
export interface RatingProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  max?: number;
  label?: string;
  id?: string;
}
export function Rating({ value, onChange, max = 5, label = 'rating', id }: RatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div
      id={id}
      className="vt-rating"
      role="radiogroup"
      aria-label={label}
      onMouseLeave={() => setHover(null)}
    >
      {Array.from({ length: max }, (_, i) => {
        const n = i + 1;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} of ${max}`}
            className={cn('vt-rating__dot', n <= shown && 'vt-rating__dot--on', hover != null && n <= hover && 'vt-rating__dot--hover')}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
          />
        );
      })}
      <span className="vt-rating__value u-mono">{value ? `${value}/${max}` : '—'}</span>
    </div>
  );
}

// ── StringListField (ordered free-text rows) ────────────────────────────────
export interface StringListFieldProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  mono?: boolean;
  addLabel?: string;
}
export function StringListField({ value, onChange, placeholder, mono, addLabel = 'Add' }: StringListFieldProps) {
  return (
    <div className="vt-strlist">
      {value.map((item, i) => (
        <div key={i} className="vt-strlist__row">
          <Input
            mono={mono}
            value={item}
            placeholder={placeholder}
            onChange={(e) => onChange(value.map((v, j) => (j === i ? e.target.value : v)))}
          />
          <button
            type="button"
            className="vt-strlist__x"
            aria-label="Remove row"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Glyph name="close" size={12} />
          </button>
        </div>
      ))}
      <button type="button" className="vt-strlist__add" onClick={() => onChange([...value, ''])}>
        + {addLabel}
      </button>
    </div>
  );
}

// ── MoneyField ({amount, currency, period?}) ────────────────────────────────
export interface MoneyFieldProps {
  value: Record<string, unknown> | undefined;
  onChange: (value: Record<string, unknown> | undefined) => void;
  /** Key of the numeric part (role.comp uses 'base'). */
  amountKey?: string;
  withPeriod?: boolean;
  id?: string;
}
export function MoneyField({ value, onChange, amountKey = 'amount', withPeriod, id }: MoneyFieldProps) {
  const patch = (k: string, v: unknown) => {
    const next = { ...(value ?? {}) } as Record<string, unknown>;
    if (v === undefined || v === '') delete next[k];
    else next[k] = v;
    onChange(Object.keys(next).length ? next : undefined);
  };
  const amount = value?.[amountKey];
  return (
    <div className="vt-money">
      <Input
        id={id}
        mono
        type="number"
        placeholder="0"
        value={typeof amount === 'number' ? String(amount) : ''}
        onChange={(e) => patch(amountKey, e.target.value === '' ? undefined : Number(e.target.value))}
      />
      <Input
        mono
        className="vt-money__ccy"
        placeholder="USD"
        maxLength={3}
        value={typeof value?.currency === 'string' ? (value.currency as string) : ''}
        onChange={(e) => patch('currency', e.target.value.toUpperCase() || undefined)}
      />
      {withPeriod && (
        <Select
          value={typeof value?.period === 'string' ? (value.period as string) : undefined}
          onChange={(v) => patch('period', v)}
          options={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: 'Yearly' },
          ]}
          placeholder="Period"
        />
      )}
    </div>
  );
}

// ── useDebounced (shared helper for pickers/search) ──────────────────────────
export function useDebounced<T>(value: T, ms = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
