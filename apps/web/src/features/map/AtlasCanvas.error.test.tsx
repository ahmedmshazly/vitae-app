/**
 * Atlas canvas failure path.
 *
 * Tiles come from a third-party host, so the panel has to survive the host
 * being unreachable. These tests drive a fake MapLibre map and check what a
 * user and a screen reader are left with when the style never loads.
 */
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (payload?: unknown) => void;

/** Every map made during a test, newest last, so a retry is observable. */
const maps: FakeMap[] = [];
let constructorError: Error | null = null;

class FakeMap {
  handlers = new Map<string, Set<Handler>>();
  removed = false;
  private canvas = document.createElement('canvas');

  constructor() {
    maps.push(this);
  }

  private key(type: string, layer?: unknown): string {
    return typeof layer === 'string' ? `${type}:${layer}` : type;
  }

  on(type: string, a?: unknown, b?: unknown): void {
    const fn = (typeof a === 'function' ? a : b) as Handler;
    const key = this.key(type, a);
    const set = this.handlers.get(key) ?? new Set<Handler>();
    set.add(fn);
    this.handlers.set(key, set);
  }

  once(type: string, a?: unknown, b?: unknown): void {
    this.on(type, a, b);
  }

  off(type: string, a?: unknown, b?: unknown): void {
    const fn = (typeof a === 'function' ? a : b) as Handler;
    this.handlers.get(this.key(type, a))?.delete(fn);
  }

  emit(type: string, payload?: unknown): void {
    for (const fn of [...(this.handlers.get(type) ?? [])]) fn(payload);
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
  getZoom(): number {
    return 1.6;
  }
  getSource(): undefined {
    return undefined;
  }
  getLayer(): undefined {
    return undefined;
  }
  addSource(): void {}
  addLayer(): void {}
  fitBounds(): void {}
  setPaintProperty(): void {}
  triggerRepaint(): void {}
  remove(): void {
    this.removed = true;
  }
}

vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: 'worker.js' }));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('maplibre-gl', () => ({
  setWorkerUrl: () => {},
  Map: class {
    constructor() {
      if (constructorError) throw constructorError;
      return new FakeMap() as unknown as object;
    }
  },
  Marker: class {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  },
  LngLatBounds: class {
    extend() {
      return this;
    }
    isEmpty() {
      return false;
    }
  },
}));

const { AtlasCanvas } = await import('./AtlasCanvas.js');
const { readGraphPalette } = await import('../../lib/graph-palette.js');
const { DEFAULT_ATLAS_PREFS } = await import('./displayPrefs.js');
const { renderWithApp } = await import('../../test/render.js');

const cities = [
  {
    city: 'Berlin',
    lat: 52.52,
    lng: 13.405,
    count: 2,
    types: { person: 2 },
    records: [{ id: 'n1', title: 'Ada', type: 'person', link: 'city' }],
  },
];

function renderCanvas(over: Record<string, unknown> = {}) {
  return renderWithApp(
    <AtlasCanvas
      cities={cities as never}
      activeFilters={new Set(['people'])}
      prefs={DEFAULT_ATLAS_PREFS}
      palette={readGraphPalette()}
      selectedCity={null}
      selectedTrip={null}
      corridors={[]}
      selectedCorridorKey={null}
      onSelectCorridor={() => {}}
      onSelectCity={() => {}}
      reducedMotion
      {...over}
    />,
  );
}

function panel(): HTMLElement {
  return screen.getByRole('region', { name: /Atlas map/ });
}

beforeEach(() => {
  maps.length = 0;
  constructorError = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AtlasCanvas failure path', () => {
  it('shows a retryable failure instead of staying busy when the style errors', async () => {
    renderCanvas();
    expect(panel()).toHaveAttribute('aria-busy', 'true');

    act(() => maps[0].emit('error', { error: new Error('Failed to fetch') }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Map tiles did not load');
    expect(alert).toHaveTextContent('Failed to fetch');
    expect(panel()).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByText('Loading map tiles')).not.toBeInTheDocument();
  });

  it('points at the tile-free list twin', async () => {
    const onShowList = vi.fn();
    renderCanvas({ onShowList });
    act(() => maps[0].emit('error', { error: new Error('nope') }));

    await screen.findByRole('alert');
    expect(screen.getByText(/List view holds the same 1 mapped place/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show list instead' }));
    expect(onShowList).toHaveBeenCalledTimes(1);
  });

  it('builds a fresh map on retry and clears the failure once it loads', async () => {
    renderCanvas();
    act(() => maps[0].emit('error', { error: new Error('nope') }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(maps).toHaveLength(2));
    expect(maps[0].removed).toBe(true);

    act(() => maps[1].emit('load'));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(panel()).toHaveAttribute('aria-busy', 'false');
  });

  it('keeps the map when a tile fails after load and names what is missing', async () => {
    renderCanvas();
    act(() => maps[0].emit('load'));
    await waitFor(() => expect(panel()).toHaveAttribute('aria-busy', 'false'));

    act(() => maps[0].emit('error', { error: new Error('404 tile') }));

    expect(await screen.findByText('Some map tiles are missing')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByText('Atlas ready with 1 mapped places. Some map tiles are missing.'),
    ).toBeInTheDocument();
  });

  it('gives up on a request that never answers or errors', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderCanvas();
    expect(panel()).toHaveAttribute('aria-busy', 'true');

    await act(() => vi.advanceTimersByTimeAsync(15_000));

    expect(await screen.findByRole('alert')).toHaveTextContent('did not respond');
    expect(panel()).toHaveAttribute('aria-busy', 'false');
  });

  it('reports a missing WebGL context rather than taking down the route', async () => {
    constructorError = new Error('Failed to initialize WebGL');
    renderCanvas();

    expect(await screen.findByRole('alert')).toHaveTextContent('could not start WebGL');
    expect(panel()).toHaveAttribute('aria-busy', 'false');
  });
});
