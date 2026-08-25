import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { AuthProvider, hasSessionHint, useAuth } from './lib/auth.js';
import { Shell } from './app/Shell.js';
import { ToastProvider } from './features/Toast.js';
import { ErrorBoundary, ShellErrorFallback } from './components/ErrorBoundary.js';
import { SignIn, SignInSplash } from './routes/SignIn.js';
import {
  PublicDocumentPage,
  PublicGuidePage,
  PublicRouteMetadata,
} from './public/PublicDocumentPage.js';
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
const CareerOverview = lazyNamed(() => import('./routes/career/index.js'), 'CareerOverview');
const Applications = lazyNamed(() => import('./routes/career/index.js'), 'Applications');
const ApplicationDossier = lazyNamed(
  () => import('./routes/career/index.js'),
  'ApplicationDossier',
);
const Tailor = lazyNamed(() => import('./routes/tailor/Tailor.js'), 'Tailor');
const Outputs = lazyNamed(() => import('./routes/Outputs.js'), 'Outputs');
const Letters = lazyNamed(() => import('./routes/Letters.js'), 'Letters');
const Templates = lazyNamed(() => import('./routes/Templates.js'), 'Templates');
const Trash = lazyNamed(() => import('./routes/Trash.js'), 'Trash');
const Settings = lazyNamed(() => import('./routes/Settings.js'), 'Settings');
const Billing = lazyNamed(() => import('./routes/Billing.js'), 'Billing');
const People = lazyNamed(() => import('./routes/People.js'), 'People');
const Intros = lazyNamed(() => import('./routes/Intros.js'), 'Intros');
const Orgs = lazyNamed(() => import('./routes/Orgs.js'), 'Orgs');
const Org = lazyNamed(() => import('./routes/Org.js'), 'Org');
const Collections = lazyNamed(() => import('./routes/Collections.js'), 'Collections');
const GraphView = lazy(() => import('./routes/GraphView.js'));
const EntityCatalog = lazy(() => import('./routes/reference/EntityCatalog.js'));
const DocsApp = lazy(() => import('./routes/docs/DocsApp.js'));
const Timeline = lazyNamed(() => import('./routes/Timeline.js'), 'Timeline');
const MapView = lazyNamed(() => import('./routes/MapView.js'), 'MapView');
const ImportHub = lazyNamed(() => import('./routes/ImportHub.js'), 'ImportHub');
const Repositories = lazyNamed(() => import('./routes/Repositories.js'), 'Repositories');
const Duplicates = lazyNamed(() => import('./routes/Duplicates.js'), 'Duplicates');
const ExportPage = lazyNamed(() => import('./routes/ExportPage.js'), 'ExportPage');
const NotFound = lazyNamed(() => import('./routes/NotFound.js'), 'NotFound');
const Planner = lazyNamed(() => import('./routes/workspaces/Planner.js'), 'Planner');
const NetworkHome = lazyNamed(() => import('./routes/workspaces/WorkspaceHomes.js'), 'NetworkHome');
const ExploreHome = lazyNamed(() => import('./routes/workspaces/WorkspaceHomes.js'), 'ExploreHome');
const DataHome = lazyNamed(() => import('./routes/workspaces/WorkspaceHomes.js'), 'DataHome');
const SettingsHome = lazyNamed(
  () => import('./routes/workspaces/WorkspaceHomes.js'),
  'SettingsHome',
);
const Help = lazyNamed(() => import('./routes/workspaces/WorkspaceHomes.js'), 'Help');
// Marketing is lazy for the same reason every other route is: eager imports
// put all three pages, their motion code and the primitives they pull in
// inside the entry chunk, so the app shell paid for the landing page and the
// landing page paid for the app shell.
const Landing = lazyNamed(() => import('./routes/marketing/Landing.js'), 'Landing');
const Tour = lazyNamed(() => import('./routes/marketing/Tour.js'), 'Tour');
const Manifesto = lazyNamed(() => import('./routes/marketing/Manifesto.js'), 'Manifesto');
const HowItWorks = lazyNamed(() => import('./routes/marketing/HowItWorks.js'), 'HowItWorks');
const WarmPaths = lazyNamed(() => import('./routes/marketing/WarmPaths.js'), 'WarmPaths');
const CareerEvidence = lazyNamed(
  () => import('./routes/marketing/CareerEvidence.js'),
  'CareerEvidence',
);
const Pricing = lazyNamed(() => import('./routes/marketing/Pricing.js'), 'Pricing');
const SecurityOwnership = lazyNamed(
  () => import('./routes/marketing/SecurityOwnership.js'),
  'SecurityOwnership',
);
import { Spinner } from '@vitae/ui';

/**
 * Marketing chunks are small and same-origin, so they resolve in well under
 * the time a spinner needs to stop reading as a hang. A spinner that appears
 * and leaves inside 100ms is worse than no spinner, and this is the first
 * paint a signed-out visitor gets, so it holds the previous frame instead.
 */
function PublicPage({ children, metadataPath }: { children: ReactNode; metadataPath?: string }) {
  return (
    <>
      {metadataPath && <PublicRouteMetadata path={metadataPath} />}
      <Suspense fallback={null}>{children}</Suspense>
    </>
  );
}

/**
 * The public root recognises a returning session. The hint is synchronous, so
 * this route still never waits on Firebase or the API: a visitor whose last
 * known session was usable goes straight to Today — the auth gate remains the
 * authority, and a stale hint costs one honest hop back to this door — while
 * everyone else gets the landing page in the same paint they always did.
 */
function RootDoor() {
  if (hasSessionHint()) return <Navigate to="/today" replace />;
  return (
    <PublicPage metadataPath="/">
      <Landing />
    </PublicPage>
  );
}

/** Preserve inbound campaign parameters while retiring the old public home address. */
function LegacyWelcomeRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: '/', search, hash }} replace />;
}

/** Sign-in is public but authentication itself necessarily owns its own loading state. */
function PublicAuthDoor({ metadataPath }: { metadataPath: '/signin' | '/signup' }) {
  return (
    <>
      <PublicRouteMetadata path={metadataPath} />
      <AuthProvider>
        <PublicAuthDoorContent />
      </AuthProvider>
    </>
  );
}

/** Carry a deliberate plan choice through account creation without trusting it for price or access. */
export function publicAuthDoorDestination(
  pathname: string,
  search: string,
  cloudEnabled: boolean,
): string {
  if (!cloudEnabled || pathname !== '/signup') return '/today';
  const period = new URLSearchParams(search).get('period');
  return period === 'monthly' || period === 'annual'
    ? `/settings/billing?period=${period}`
    : '/settings/billing';
}

function PublicAuthDoorContent() {
  const { user, workspace, cloudEnabled, loading } = useAuth();
  const { pathname, search } = useLocation();
  if (loading) return <SignInSplash />;
  if (user && (!cloudEnabled || workspace)) {
    return <Navigate to={publicAuthDoorDestination(pathname, search, cloudEnabled)} replace />;
  }
  return <SignIn />;
}

/** People/orgs keep CRM hubs; generic browse covers every other type. */
function BrowseRedirect() {
  const { type } = useParams();
  if (type === 'person') return <Navigate to="/network/people" replace />;
  if (type === 'organization') return <Navigate to="/network/organizations" replace />;
  return <Browse />;
}

/** Ask and warm introductions are two lenses over one relationship decision. */
function NetworkIntelligence() {
  const [params] = useSearchParams();
  return params.get('lens') === 'reach' ? <Intros /> : <Ask />;
}

export function App() {
  return (
    <Routes>
      {/* These routes are fully public and must never wait on Firebase or the API. */}
      <Route path="/" element={<RootDoor />} />
      <Route path="/welcome" element={<LegacyWelcomeRedirect />} />
      <Route path="/product" element={<Navigate to="/how-it-works" replace />} />
      <Route
        path="/how-it-works"
        element={
          <PublicPage metadataPath="/how-it-works">
            <HowItWorks />
          </PublicPage>
        }
      />
      <Route
        path="/product/warm-paths"
        element={
          <PublicPage metadataPath="/product/warm-paths">
            <WarmPaths />
          </PublicPage>
        }
      />
      <Route
        path="/product/career-evidence"
        element={
          <PublicPage metadataPath="/product/career-evidence">
            <CareerEvidence />
          </PublicPage>
        }
      />
      <Route
        path="/pricing"
        element={
          <PublicPage metadataPath="/pricing">
            <Pricing />
          </PublicPage>
        }
      />
      <Route
        path="/security-and-ownership"
        element={
          <PublicPage metadataPath="/security-and-ownership">
            <SecurityOwnership />
          </PublicPage>
        }
      />
      <Route
        path="/tour"
        element={
          <PublicPage metadataPath="/tour">
            <Tour />
          </PublicPage>
        }
      />
      <Route
        path="/manifesto"
        element={
          <PublicPage metadataPath="/manifesto">
            <Manifesto />
          </PublicPage>
        }
      />
      <Route path="/resources" element={<PublicDocumentPage />} />
      <Route path="/guides" element={<PublicDocumentPage />} />
      <Route path="/guides/:slug" element={<PublicGuidePage />} />
      <Route path="/changelog" element={<PublicDocumentPage />} />
      <Route path="/legal/terms" element={<PublicDocumentPage />} />
      <Route path="/legal/privacy" element={<PublicDocumentPage />} />
      <Route path="/legal/dpa" element={<PublicDocumentPage />} />
      <Route path="/legal/subprocessors" element={<PublicDocumentPage />} />
      <Route path="/status" element={<PublicDocumentPage />} />
      <Route path="/signin" element={<PublicAuthDoor metadataPath="/signin" />} />
      <Route path="/signup" element={<PublicAuthDoor metadataPath="/signup" />} />
      <Route
        path="/reference/entities"
        element={
          <Suspense
            fallback={
              <div className="app-splash">
                <Spinner />
              </div>
            }
          >
            <EntityCatalog />
          </Suspense>
        }
      />
      {/*
        The documentation *corpus* is private — it is served by the API behind
        the owner allow-list — but this route is still declared above the
        wildcard below, and deliberately.

        `AuthGate` claims every path it reaches and bounces a signed-out visitor
        to the public home page with no explanation. A reader who bookmarked a
        documentation page and later signed out would simply find themselves
        somewhere else. Rendering the shell instead lets the surface say what
        actually happened — the corpus is private, sign in as the owner — which
        is the more useful answer and gives nothing away: every byte of the
        corpus arrives from an authenticated request, so an anonymous visitor
        reaches an empty frame and a sentence.

        It also mounts outside `Shell` and `ToastProvider`, alongside the entity
        catalog, because a reading surface has no workspace chrome to inherit.
      */}
      <Route
        path="/docs/*"
        element={
          <Suspense
            fallback={
              <div className="app-splash">
                <Spinner />
              </div>
            }
          >
            <DocsApp />
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
  const { user, workspace, cloudEnabled, loading } = useAuth();
  // The splash is the sign-in screen with its controls skeletonised, so
  // resolving auth reveals the door instead of swapping one screen for
  // another. It was a centred full-page spinner, which the book bans.
  if (loading) return <SignInSplash />;

  // Every public page is matched before this gate. The remaining wildcard is
  // the private workspace, so a signed-out deep link returns to public home.
  if (!user || (cloudEnabled && !workspace)) {
    return (
      <Routes>
        <Route path="*" element={<Navigate to="/" replace />} />
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
            <Suspense
              fallback={
                <div className="app-splash">
                  <Spinner />
                </div>
              }
            >
              <Routes>
                {/* No `/` here, and there must never be one. AuthGate is
                    mounted at `path="*"`, which ranks below the exact `/`
                    above it, so the root never reaches this tree — a redirect
                    here once cost a defect apiece in Shell.tsx and
                    shell.spec.ts before anyone noticed it could not run. The
                    product question it left open is now answered where the
                    comment said to answer it: `RootDoor`, on the public
                    route, recognises a returning session synchronously and
                    sends it to Today. */}
                <Route path="/today" element={<Dashboard />} />

                {/* Canonical task-led workspaces. Compatibility routes remain
                    mounted below so bookmarks and shared record links survive. */}
                <Route path="/today/planner" element={<Planner />} />
                <Route path="/network" element={<NetworkHome />} />
                <Route path="/network/people" element={<People />} />
                <Route path="/network/people/:id" element={<Person />} />
                <Route path="/network/organizations" element={<Orgs />} />
                <Route path="/network/organizations/:id" element={<Org />} />
                <Route path="/network/intelligence" element={<NetworkIntelligence />} />
                <Route path="/career" element={<CareerOverview />} />
                <Route path="/career/applications" element={<Applications />} />
                <Route path="/career/applications/:id" element={<ApplicationDossier />} />
                <Route path="/career/resume" element={<ResumeHub />} />
                <Route path="/career/resume/evidence" element={<Atoms />} />
                <Route path="/career/resume/tailor" element={<Tailor />} />
                <Route path="/career/resume/outputs" element={<Outputs />} />
                <Route path="/career/resume/letters" element={<Letters />} />
                <Route path="/career/resume/templates" element={<Templates />} />
                <Route path="/explore" element={<ExploreHome />} />
                <Route path="/explore/library" element={<Collections />} />
                <Route path="/explore/graph" element={<GraphView />} />
                <Route path="/explore/timeline" element={<Timeline />} />
                <Route path="/explore/atlas" element={<MapView />} />
                <Route path="/data" element={<DataHome />} />
                <Route path="/data/imports" element={<ImportHub />} />
                <Route path="/data/identity" element={<Duplicates />} />
                <Route path="/data/sources/github" element={<Repositories />} />
                <Route path="/data/exports" element={<ExportPage />} />
                <Route path="/data/trash" element={<Trash />} />
                <Route path="/settings" element={<SettingsHome />} />
                <Route path="/settings/profile" element={<Settings />} />
                <Route path="/settings/preferences" element={<Settings />} />
                <Route path="/settings/system" element={<Settings />} />
                <Route path="/settings/billing" element={<Billing />} />
                <Route path="/help" element={<Help />} />

                {/* Stable legacy addresses. */}
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
                {/* A dead URL used to render the Dashboard, so a broken link
                    looked exactly like a successful navigation home. */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </Shell>
      </ErrorBoundary>
    </ToastProvider>
  );
}
