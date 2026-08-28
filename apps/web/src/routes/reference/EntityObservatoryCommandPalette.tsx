import { useEffect, useMemo, useRef, useState } from 'react';

export interface ObservatoryCommand {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  run: () => void;
}

export function EntityObservatoryCommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: ObservatoryCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const visibleCommands = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return commands;
    return commands.filter(
      (command) =>
        command.label.toLocaleLowerCase().includes(normalized) ||
        command.description.toLocaleLowerCase().includes(normalized),
    );
  }, [commands, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="ec-command-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="ec-command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Observatory command palette"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
          if (event.key === 'Enter' && visibleCommands[0]) {
            visibleCommands[0].run();
            onClose();
          }
        }}
      >
        <div className="ec-command-palette__search">
          <span aria-hidden>⌘</span>
          <input
            ref={inputRef}
            value={query}
            placeholder="Navigate, reveal, focus, export..."
            aria-label="Find a command"
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>esc</kbd>
        </div>
        <div className="ec-command-palette__results" role="listbox">
          {visibleCommands.map((command) => (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => {
                command.run();
                onClose();
              }}
            >
              <span>
                <strong>{command.label}</strong>
                <small>{command.description}</small>
              </span>
              {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
            </button>
          ))}
          {visibleCommands.length === 0 ? <p>No matching command.</p> : null}
        </div>
      </section>
    </div>
  );
}
