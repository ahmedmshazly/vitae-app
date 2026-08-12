import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.js';
import { Shell } from './app/Shell.js';
import { ToastProvider } from './features/Toast.js';
import { ErrorBoundary, ShellErrorFallback } from './components/ErrorBoundary.js';
import { SignIn, SignInSplash } from './routes/SignIn.js';
function lazyNamed(loader: () => Promise<unknown>, exportName: string) {
  return lazy(async () => {
    const module = (await loader()) as Record<string, ComponentType<Record<never, never>>>;
    return { default: module[exportName]! };
  });
}

const Dashboard = lazyNamed(() => import('./routes/Dashboard.js'), 'Dashboard');
const Browse = lazyNamed(() => import('./routes/Browse.js'), 'Browse');
const Record = lazyNamed(() => import('./routes/Record.js'), 'Record');
const Person = lazyNamed(() => import('./routes/Person.js'), 'Person');
const Ask = lazyNamed(() => import('./routes/Ask.js'), 'Ask');
const SearchResults = lazyNamed(() => import('./routes/SearchResults.js'), 'SearchResults');
const Atoms = lazyNamed(() => import('./routes/Atoms.js'), 'Atoms');
const ResumeHub = lazyNamed(() => import('./routes/ResumeHub.js'), 'ResumeHub');
const Tailor = lazyNamed(() => import('./routes/tailor/Tailor.js'), 'Tailor');
const Outputs = lazyNamed(() => import('./routes/Outputs.js'), 'Outputs');
const Letters = lazyNamed(() => import('./routes/Letters.js'), 'Letters');
const Templates = lazyNamed(() => import('./routes/Templates.js'), 'Templates');
const Trash = lazyNamed(() => import('./routes/Trash.js'), 'Trash');
const Settings = lazyNamed(() => import('./routes/Settings.js'), 'Settings');
const People = lazyNamed(() => import('./routes/People.js'), 'People');
const Intros = lazyNamed(() => import('./routes/Intros.js'), 'Intros');
const Orgs = lazyNamed(() => import('./routes/Orgs.js'), 'Orgs');
const Org = lazyNamed(() => import('./routes/Org.js'), 'Org');
const Collections = lazyNamed(() => import('./routes/Collections.js'), 'Collections');
const GraphView = lazy(() => import('./routes/GraphView.js'));
const EntityCatalog = lazy(() => import('./routes/reference/EntityCatalog.js'));
const Timeline = lazyNamed(() => import('./routes/Timeline.js'), 'Timeline');
const MapView = lazyNamed(() => import('./routes/MapView.js'), 'MapView');
const ImportHub = lazyNamed(() => import('./routes/ImportHub.js'), 'ImportHub');
const Repositories = lazyNamed(() => import('./routes/Repositories.js'), 'Repositories');
const Duplicates = lazyNamed(() => import('./routes/Duplicates.js'), 'Duplicates');
const ExportPage = lazyNamed(() => import('./routes/ExportPage.js'), 'ExportPage');
// Marketing is lazy for the same reason every other route is: eager imports
// put all three pages, their motion code and the primitives they pull in
// inside the entry chunk, so the app shell paid for the landing page and the
// landing page paid for the app shell.
const Landing = lazyNamed(() => import('./routes/marketing/Landing.js'), 'Landing');
const Tour = lazyNamed(() => import('./routes/marketing/Tour.js'), 'Tour');
const Manifesto = lazyNamed(() => import('./routes/marketing/Manifesto.js'), 'Manifesto');
import { Spinner } from '@vitae/ui';

/**
 * Marketing chunks are small and same-origin, so they resolve in well under
 * the time a spinner needs to stop reading as a hang. A spinner that appears
 * and leaves inside 100ms is worse than no spinner, and this is the first
 * paint a signed-out visitor gets, so it holds the previous frame instead.
 */
function PublicPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

/** People/orgs keep CRM hubs; generic browse covers every other type. */
function BrowseRedirect() {
  const { type } = useParams();
  if (type === 'person') return <Navigate to="/people" replace />;
  if (type === 'organization') return <Navigate to="/orgs" replace />;
  return <Browse />;
}

export function App() {
  return (
    <Routes>
      {/* These routes are fully public and must never wait on Firebase or the API. */}
      <Route path="/tour" element={<PublicPage><Tour /></PublicPage>} />
      <Route path="/manifesto" element={<PublicPage><Manifesto /></PublicPage>} />
      <Route
        path="/reference/entities"
        element={
          <Suspense fallback={<div className="app-splash"><Spinner /></div>}>
            <EntityCatalog />
          </Suspense>
        }
      />
      <Route path="*" element={<AuthGate />} />
    </Routes>
  );
}

function AuthGate() {
  return (
    <AuthProvider>
      <AuthGateContent />
    </AuthProvider>
  );
}

function AuthGateContent() {
  const { user, loading } = useAuth();
  // The splash is the sign-in screen with its controls skeletonised, so
  // resolving auth reveals the door instead of swapping one screen for
  // another. It was a centred full-page spinner, which the book bans.
  if (loading) return <SignInSplash />;

  // Public surface: marketing pages + sign-in are reachable signed-out (and
  // the tour/manifesto stay reachable signed-in: FirstRun links there).
  if (!user) {
    return (
      <Routes>
        <Route path="/welcome" element={<PublicPage><Landing /></PublicPage>} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    );
  }

  return <AuthedApp />;
}

function AuthedApp() {
  const { pathname } = useLocation();
  return (
    <ToastProvider>
      <ErrorBoundary fallback={(retry) => <ShellErrorFallback retry={retry} />}>
        <Shell>
          {/* Keyed by route so a crash on one page doesn't stay stuck once the
              user navigates away, the boundary remounts fresh per route. */}
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<div className="app-splash"><Spinner /></div>}>
              <Routes>
                <Route path="/welcome" element={<Navigate to="/" replace />} />
                <Route path="/signin" element={<Navigate to="/" replace />} />
                <Route path="/" element={<Dashboard />} />
                <Route path="/people" element={<People />} />
                <Route path="/people/:id" element={<Person />} />
                <Route path="/orgs" element={<Orgs />} />
                <Route path="/orgs/:id" element={<Org />} />
                <Route path="/ask/people" element={<Ask />} />
                <Route path="/intros" element={<Intros />} />
                <Route path="/collections" element={<Collections />} />
                <Route path="/repositories" element={<Repositories />} />
                <Route path="/browse/:type" element={<BrowseRedirect />} />
                <Route path="/n/:id" element={<Record />} />
                <Route path="/search" element={<SearchResults />} />
                <Route path="/graph" element={<GraphView />} />
                <Route path="/timeline" element={<Timeline />} />
                <Route path="/map" element={<MapView />} />
                <Route path="/import" element={<ImportHub />} />
                <Route path="/import/duplicates" element={<Duplicates />} />
                <Route path="/export" element={<ExportPage />} />
                <Route path="/resume" element={<ResumeHub />} />
                <Route path="/resume/atoms" element={<Atoms />} />
                <Route path="/resume/tailor" element={<Tailor />} />
                <Route path="/resume/outputs" element={<Outputs />} />
                <Route path="/resume/letters" element={<Letters />} />
                <Route path="/resume/templates" element={<Templates />} />
                <Route path="/trash" element={<Trash />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Dashboard />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </Shell>
      </ErrorBoundary>
    </ToastProvider>
  );
}
