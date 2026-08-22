/**
 * Shared `api` mock surface for route/feature tests. Import this module before
 * the component under test, then control handlers via `mockApi`.
 */
import { vi } from 'vitest';

let space: 'real' | 'demo' = 'real';

export const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  del: vi.fn(),
};

vi.mock('../lib/api.js', () => ({
  api: mockApi,
  // Same shape as the real one in lib/api.ts. It used to take (status,
  // message), so a test that constructed an error the way the app does put
  // the code where the message goes and asserted on the wrong string.
  ApiError: class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
      readonly details?: unknown,
    ) {
      super(message);
    }
  },
  setAuthTokenProvider: vi.fn(),
  getSpace: () => space,
  setSpace: (next: 'real' | 'demo') => {
    space = next;
  },
}));

export function resetMockApi(): void {
  space = 'real';
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
  mockApi.put.mockReset();
  mockApi.delete.mockReset();
  mockApi.del.mockReset();
  // Keep del and delete in sync for callers that use either name.
  mockApi.del.mockImplementation((...args: unknown[]) => mockApi.delete(...args));
}
