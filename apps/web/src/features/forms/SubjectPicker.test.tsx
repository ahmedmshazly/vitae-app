/**
 * Subject picker: That's me shortcut and clear.
 */
import './../../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { SubjectPicker, type SubjectChoice } from './SubjectPicker.js';

const subject = {
  edgeType: 'HELD' as const,
  direction: 'in' as const,
  label: 'Whose role is this?',
  required: true,
  defaultToSelf: true,
};

beforeEach(() => {
  resetMockApi();
  mockApi.get.mockImplementation(async (path: string) => {
    if (path.startsWith('/auth/me')) return { self: { id: 'self-1', title: 'Me Owner' } };
    if (path.startsWith('/search/switch')) return { results: [] };
    return {};
  });
});

function Harness() {
  const [value, setValue] = useState<SubjectChoice | null>(null);
  return <SubjectPicker subject={subject} value={value} onChange={setValue} />;
}

describe('SubjectPicker', () => {
  it("sets the subject via That's me and clears it", async () => {
    const user = userEvent.setup();
    renderWithApp(<Harness />);

    expect(await screen.findByRole('button', { name: /That's me|That's me/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /That's me|That's me/ }));

    await waitFor(() => {
      expect(screen.getByText('Me Owner')).toBeInTheDocument();
    });
    expect(screen.getByText(/you/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear Whose role is this?' }));
    expect(await screen.findByRole('button', { name: /That's me|That's me/ })).toBeInTheDocument();
  });
});
