import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

// Self-hosted fonts (SRS C4, no runtime CDN)
import '@fontsource-variable/instrument-sans';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/600.css';
import '@fontsource/source-serif-4/400-italic.css';

// Tailwind v4 entry + @theme inline alias of the Quiet tokens below, must
// come before the hand-authored chain so preflight loses specificity ties
// by source order (see styles/theme.css).
import './styles/theme.css';

import '@vitae/ui/styles/tokens.css';
import '@vitae/ui/styles/base.css';
import '@vitae/ui/styles/components.css';
import '@vitae/ui/styles/layout.css';
import '@vitae/ui/styles/toast.css';
import './styles/app.css';
import './styles/network.css';
import './styles/dedup.css';
import './styles/data-workspace.css';
import './styles/explore-workspace.css';
import './styles/tailor.css';
import './styles/browse.css';
import './styles/data-tools.css';
import './styles/resume-paper.css';
import './styles/marketing.css';
// entity-catalog-print.css and entity-observatory.css are imported by
// routes/reference/EntityCatalog.tsx instead of here: 47 kB of CSS for one
// lazy public route was shipping to every user on every screen. Importing
// them at the route also stops them racing, they used to be two global
// sheets sharing four selectors (.ec-atlas, .ec-atlas__header,
// .ec-header__actions, .ec-header__brand) where load order alone decided
// the winner.

import { App } from './App.js';
import { flashToast } from './features/Toast.js';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 5_000, refetchOnWindowFocus: false } },
  // No mutation may fail silently, anything without a local onError surfaces
  // here. This net runs alongside a local handler rather than instead of one,
  // so every mutation that already reported its own failure said the same
  // sentence twice, in two toasts, stacked. A mutation that names its failure
  // owns that report.
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (mutation.options.onError) return;
      flashToast(err instanceof Error ? err.message : 'Something went wrong');
    },
  }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
