/**
 * The "That's me" shortcut used to be `{self && …}` over a query destructured
 * for its data alone, so a slow lookup and a dead one both rendered as the
 * button not being there, and there was nothing on screen to say which.
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

const ME = /That’s me|That's me/;

beforeEach(() => {
  resetMockApi();
});

function Harness() {
  const [value, setValue] = useState<SubjectChoice | null>(null);
  return <SubjectPicker subject={subject} value={value} onChange={setValue} />;
}

/** A promise this test decides when to settle, for asserting the in-between. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('SubjectPicker says why the shortcut is missing', () => {
  it('states the lookup failed, and points at the search that still works', async () => {
    mockApi.get.mockImplementation(async (path: string) => {
      if (path.startsWith('/auth/me')) throw new Error('offline');
      return { results: [] };
    });
    renderWithApp(<Harness />);

    expect(await screen.findByText('Couldn’t check who you are')).toBeInTheDocument();
    expect(screen.getByText('Search for yourself by name above.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Search people/ })).toBeInTheDocument();
  });

  it('recovers the shortcut on retry', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    mockApi.get.mockImplementation(async (path: string) => {
      if (path.startsWith('/auth/me')) {
        attempt += 1;
        if (attempt === 1) throw new Error('offline');
        return { self: { id: 'self-1', title: 'Me Owner' } };
      }
      return { results: [] };
    });
    renderWithApp(<Harness />);

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('button', { name: ME })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Couldn’t check who you are')).not.toBeInTheDocument();
    });
  });

  it('does not cut across the form with an assertive alert nobody asked for', async () => {
    mockApi.get.mockImplementation(async (path: string) => {
      if (path.startsWith('/auth/me')) throw new Error('offline');
      return { results: [] };
    });
    renderWithApp(<Harness />);

    const line = await screen.findByText('Couldn’t check who you are');
    expect(line.closest('[role="alert"]')).toBeNull();
    expect(line.closest('[role="status"]')).toBeNull();
  });

  it('holds the shortcut’s place while the lookup is still out', async () => {
    const gate = deferred<unknown>();
    mockApi.get.mockImplementation((path: string) =>
      path.startsWith('/auth/me') ? gate.promise : Promise.resolve({ results: [] }),
    );
    renderWithApp(<Harness />);

    expect(screen.queryByRole('button', { name: ME })).not.toBeInTheDocument();
    expect(screen.queryByText('Couldn’t check who you are')).not.toBeInTheDocument();

    gate.resolve({ self: { id: 'self-1', title: 'Me Owner' } });
    expect(await screen.findByRole('button', { name: ME })).toBeInTheDocument();
  });

  it('stops saying it once a subject is chosen by hand', async () => {
    const user = userEvent.setup();
    mockApi.get.mockImplementation(async (path: string) => {
      if (path.startsWith('/auth/me')) throw new Error('offline');
      return { results: [{ id: 'p9', type: 'person', title: 'Grace Hopper' }] };
    });
    renderWithApp(<Harness />);

    await screen.findByText('Couldn’t check who you are');
    await user.type(screen.getByRole('combobox', { name: /Search people/ }), 'Grace');
    await user.click(await screen.findByRole('option', { name: /Grace Hopper/ }));

    await waitFor(() => {
      expect(screen.queryByText('Couldn’t check who you are')).not.toBeInTheDocument();
    });
  });
});

describe('SubjectPicker stays inside the form it sits in', () => {
  it('gives its buttons a type, so neither one submits the form', async () => {
    mockApi.get.mockImplementation(async (path: string) => {
      if (path.startsWith('/auth/me')) return { self: { id: 'self-1', title: 'Me Owner' } };
      return { results: [] };
    });
    renderWithApp(<Harness />);

    expect(await screen.findByRole('button', { name: ME })).toHaveAttribute('type', 'button');
  });

  it('gives the retry a type too', async () => {
    mockApi.get.mockImplementation(async (path: string) => {
      if (path.startsWith('/auth/me')) throw new Error('offline');
      return { results: [] };
    });
    renderWithApp(<Harness />);

    expect(await screen.findByRole('button', { name: 'Retry' })).toHaveAttribute('type', 'button');
  });
});
