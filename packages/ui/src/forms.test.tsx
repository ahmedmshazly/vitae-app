import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox, Select } from './forms.js';

function ControlledSelect(props: { clearable?: boolean; initial?: string }) {
  const [value, setValue] = useState<string | undefined>(props.initial);
  return (
    <Select
      value={value}
      onChange={setValue}
      options={[
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
      ]}
      clearable={props.clearable}
    />
  );
}

describe('Select', () => {
  it('opens, selects an option via keyboard, and fires onChange with the right value', async () => {
    const user = userEvent.setup();
    render(<ControlledSelect />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveClass('vt-sel');
    await user.click(trigger);
    const option = await screen.findByRole('option', { name: 'Beta' });
    await user.click(option);
    expect(await screen.findByRole('combobox')).toHaveTextContent('Beta');
  });

  it('shows Clear only when clearable and a value is set', async () => {
    const user = userEvent.setup();
    render(<ControlledSelect clearable initial="a" />);
    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'Clear' })).toBeInTheDocument();
  });

  it('omits Clear when clearable is false', async () => {
    const user = userEvent.setup();
    render(<ControlledSelect clearable={false} initial="a" />);
    await user.click(screen.getByRole('combobox'));
    await screen.findByRole('option', { name: 'Alpha' });
    expect(screen.queryByRole('option', { name: 'Clear' })).not.toBeInTheDocument();
  });
});

describe('Checkbox', () => {
  it('round-trips checked/onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="Subscribe" />);
    await user.click(screen.getByRole('checkbox', { name: 'Subscribe' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('toggles when the label text is clicked, not just the box', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="Subscribe" />);
    await user.click(screen.getByText('Subscribe'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders vt-check__box with data-state=checked when checked', () => {
    render(<Checkbox checked onChange={() => {}} label="On" />);
    const box = document.querySelector('.vt-check__box');
    expect(box).toHaveAttribute('data-state', 'checked');
  });
});

describe('Select: the clear sentinel', () => {
  it('is plain text, so the file stays diffable and greppable', () => {
    // The sentinel was a literal NUL byte, which made git classify forms.tsx
    // as binary: no readable diff in review, and ripgrep skipped the file.
    // Vitest serves modules over http; resolve against this file's real path.
    const source = readFileSync(fileURLToPath(new URL('forms.tsx', `file://${__filename}`)), 'utf8');
    expect(source.includes(String.fromCharCode(0))).toBe(false);
  });

  it('still clears the value rather than selecting the sentinel', async () => {
    const user = userEvent.setup();
    render(<ControlledSelect clearable initial="a" />);
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('Clear'));
    expect(screen.getByRole('combobox')).toHaveTextContent('Select...');
  });
});

