/**
 * Shared React render helper for route/feature tests: MemoryRouter + QueryClient
 * + ToastProvider. Prefer this over ad-hoc wrappers so loading/empty/error
 * suites share one harness.
 */
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';
import { ToastProvider } from '../features/Toast.js';
import type { WorkspaceAccess } from '../lib/auth.js';
import { ThemeProvider } from '@vitae/ui';

export type TestAuth = {
  user: { email: string; via: 'google' | 'dev' } | null;
  loading: boolean;
  signInDev: () => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  devLoginEnabled: boolean;
  googleEnabled: boolean;
  // Cloud mode carries a workspace and its access state on the same context.
  // Both default to the self-hosted shape, where there is no workspace at all.
  cloudEnabled: boolean;
  localInstall: boolean;
  workspace: WorkspaceAccess | null;
};

export type RenderWithAppResult = RenderResult & { queryClient: QueryClient };

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function createTestAuth(over: Partial<TestAuth> = {}): TestAuth {
  return {
    user: { email: 'owner@example.com', via: 'dev' },
    loading: false,
    signInDev: async () => {},
    signInGoogle: async () => {},
    signOut: async () => {},
    devLoginEnabled: true,
    googleEnabled: true,
    cloudEnabled: false,
    localInstall: false,
    workspace: null,
    ...over,
  };
}

export function renderWithApp(
  ui: ReactElement,
  options: {
    route?: string;
    routerProps?: MemoryRouterProps;
    queryClient?: QueryClient;
    withToast?: boolean;
    wrapper?: (props: { children: ReactNode }) => ReactElement;
  } & Omit<RenderOptions, 'wrapper'> = {},
): RenderWithAppResult {
  const {
    route = '/',
    routerProps,
    queryClient = createTestQueryClient(),
    withToast = true,
    wrapper,
    ...rest
  } = options;
  const initialEntries = routerProps?.initialEntries ?? [route];

  function Providers({ children }: { children: ReactNode }) {
    let tree: ReactNode = (
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={initialEntries} {...routerProps}>
        {children}
      </MemoryRouter>
    );
    if (withToast) tree = <ToastProvider>{tree}</ToastProvider>;
    tree = <ThemeProvider>{tree}</ThemeProvider>;
    tree = <QueryClientProvider client={queryClient}>{tree}</QueryClientProvider>;
    return wrapper ? wrapper({ children: tree }) : <>{tree}</>;
  }

  return {
    queryClient,
    ...render(ui, { wrapper: Providers, ...rest }),
  };
}
