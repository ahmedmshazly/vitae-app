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
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
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
