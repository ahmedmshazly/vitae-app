/**
 * Placing an unmapped label: the search that is still running, the search that
 * failed, the duplicate check that failed, and the save that failed. Three of
 * those used to render as an empty list, which reads as an answer.
 */
import '../../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { ApiError } from '../../lib/api.js';
import { PlaceResolvePanel } from './PlaceResolvePanel.js';

const HIT = {
  displayName: 'Cairo, Cairo Governorate, Egypt',
  lat: 30.04,
  lng: 31.23,
  osmId: 'r5466227',
  countryCode: 'eg',
};

/** Each key may be a value to return or an Error to throw. */
function serve(over: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = {
    '/places/search': { results: [HIT] },
    '/places/suggest-merges': { suggestions: [] },
    ...over,
  };
  mockApi.get.mockImplementation(async (path: string) => {
    const key = Object.keys(table).find((k) => path.startsWith(k));
    const value = key ? table[key] : {};
    if (value instanceof Error) throw value;
    return value;
  });
}

function panel(over: Partial<Parameters<typeof PlaceResolvePanel>[0]> = {}) {
  return (
    <PlaceResolvePanel
      rawLabel="Cairo"
      pickMode={false}
      onTogglePickMode={() => {}}
      mapPick={null}
      onClearMapPick={() => {}}
      onClose={() => {}}
      onSaved={() => {}}
      {...over}
    />
  );
}

beforeEach(() => {
  resetMockApi();
  serve();
  mockApi.post.mockResolvedValue({});
});

describe('PlaceResolvePanel states', () => {
  it('says it is still searching instead of showing an empty list', async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path.startsWith('/places/search')) return new Promise(() => {});
      return Promise.resolve({ suggestions: [] });
    });
    renderWithApp(panel());
    expect(await screen.findByRole('status', { name: 'Searching places' })).toBeInTheDocument();
    expect(screen.queryByText('No results')).not.toBeInTheDocument();
  });

  it('reports a failed geocode rather than letting it read as no such place', async () => {
    serve({ '/places/search': new ApiError(503, 'upstream', 'geocoder unreachable') });
    renderWithApp(panel());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('geocoder unreachable');
    expect(screen.queryByText('No results')).not.toBeInTheDocument();
  });

  it('warns when the duplicate check failed instead of implying there are none', async () => {
    serve({ '/places/suggest-merges': new ApiError(500, 'internal', 'merge index down') });
    renderWithApp(panel());
    expect(await screen.findByText(/Couldn't check for existing places/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry check' })).toBeInTheDocument();
  });

  it('marks the picked result with more than a tint', async () => {
    const user = userEvent.setup();
    renderWithApp(panel());
    const row = await screen.findByRole('button', { name: /Cairo Governorate/ });
    expect(row).toHaveAttribute('aria-pressed', 'false');
    await user.click(row);
    expect(row).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the save in flight and reports it when it fails', async () => {
    const user = userEvent.setup();
    let reject: (err: Error) => void = () => {};
    mockApi.post.mockImplementation(
      () =>
        new Promise((_res, rej) => {
          reject = rej;
        }),
    );
    renderWithApp(panel());
    await user.click(await screen.findByRole('button', { name: /Cairo Governorate/ }));

    const confirm = screen.getByRole('button', { name: 'Confirm' });
    await user.click(confirm);
    expect(await screen.findByRole('button', { name: 'Saving...' })).toBeDisabled();

    reject(new ApiError(500, 'internal', 'place service refused'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('place service refused'),
    );
  });

  it('leaves Confirm inert until a place has actually been chosen', async () => {
    renderWithApp(panel());
    await screen.findByRole('button', { name: /Cairo Governorate/ });
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });
});
