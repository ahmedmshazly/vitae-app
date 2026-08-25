import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  Button,
  Glyph,
  Kbd,
  LogoHorizontal,
  LogoMark,
  Sheet,
  Tooltip,
  TooltipProvider,
} from '@vitae/ui';
import { api, getSpace, setSpace } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { FirstRun, useFirstRun } from '../features/FirstRun.js';
import { QuickAdd } from '../features/QuickAdd.js';
import { QuickSwitcher } from '../features/QuickSwitcher.js';
import { RemindersDrawer } from '../features/RemindersDrawer.js';
import { NewEntityMenu } from '../features/forms/NewEntityMenu.js';
import { useRoute } from '../lib/motion.js';
import { HUBS, ROUTES, WORKSPACE_NAV, hubForPath, isRouteActive, type HubEntry } from './routes.js';
import { buildCommands } from './commands.js';
import { Breadcrumb, crumbFor } from './Breadcrumb.js';
import { entityHref } from '../lib/entity-href.js';

const COLLAPSE_KEY = 'vitae.nav.collapsed';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

function RailLink({ hub, compact, active }: { hub: HubEntry; compact: boolean; active: boolean }) {
  const link = (
    <Link
      to={hub.path}
      className={`navlink${compact ? ' navlink--tile' : ''}${active ? ' navlink--active' : ''}`}
      aria-current={active ? 'page' : undefined}
      aria-label={compact ? hub.label : undefined}
    >
      <span className="navlink__trace" aria-hidden />
      <Glyph name={hub.glyph} size={17} />
      {!compact && (
        <span className="navlink__copy">
          <strong>{hub.label}</strong>
          <small>{hub.description}</small>
        </span>
      )}
    </Link>
  );

  return compact ? (
    <Tooltip content={hub.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

/**
 * The two access states that refuse every write with 402 PAYMENT_REQUIRED,
 * and what the shell says about each. Wording follows Billing.tsx's chips so a
 * person reading the banner and then the billing screen sees one story.
 */
const ACCESS_LOCK = {
  read_only: {
    label: 'Read-only access',
    detail: 'Saving is paused. Your records are intact and can still be exported.',
  },
  deletion_pending: {
    label: 'Scheduled for deletion',
    detail: 'Saving is paused and this workspace is scheduled for deletion. Export while you can.',
  },
} as const;

/**
 * Which lock to announce, if any. Self-hosted installs have no workspace and
 * never reach this; a trialing, active or past_due workspace can still write.
 */
function lockedAccess(
  cloud: boolean,
  access: string | undefined,
): keyof typeof ACCESS_LOCK | null {
  if (!cloud) return null;
  return access === 'read_only' || access === 'deletion_pending' ? access : null;
}

export function Shell({ children }: { children: ReactNode }) {
  const [quickAdd, setQuickAdd] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [reminders, setReminders] = useState(false);
  const [newMenu, setNewMenu] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const isTabletRail = useMediaQuery('(max-width: 1080px) and (min-width: 701px)');
  const compactRail = collapsed || isTabletRail;
  const [firstRun, dismissFirstRun] = useFirstRun();
  const [space, setSpaceState] = useState(() => getSpace());
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { signOut, cloudEnabled, workspace } = useAuth();
  const accessLock = lockedAccess(cloudEnabled, workspace?.accessState);
  const routeMotion = useRoute();
  const queryClient = useQueryClient();
  const isHelp = pathname === '/help';
  const resolvedHubId = hubForPath(pathname);
  const activeHubId = resolvedHubId ?? 'today';
  const hasActiveHub = resolvedHubId != null && !isHelp;
  const activeHub = HUBS.find((hub) => hub.id === activeHubId) ?? HUBS[0]!;
  const workspaceIdentity = isHelp
    ? { path: '/help', label: 'Help', description: 'Working model and shortcuts' }
    : resolvedHubId == null
      ? { path: '/', label: 'Not found', description: 'No matching workspace' }
      : activeHub;
  const localRoutes = hasActiveHub ? WORKSPACE_NAV[activeHubId] : [];

  const crumb = crumbFor(pathname);
  const routeAnnouncement = crumb.parent ? `${crumb.parent}, ${crumb.leaf}` : crumb.leaf;
  const isFirstRoute = useRef(true);
  const mainRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    if (isFirstRoute.current) {
      isFirstRoute.current = false;
      return;
    }
    node.focus();
  }, []);

  const statusQuery = useQuery({
    queryKey: ['status'],
    queryFn: () => api.get<{ checks: Record<string, { ok: boolean }> }>('/status'),
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });
  const reminderQuery = useQuery({
    queryKey: ['reminders'],
    queryFn: () => api.get<{ reminders: Array<{ id: string }> }>('/reminders?due=all'),
    refetchInterval: 120_000,
  });
  const viewsQuery = useQuery({
    queryKey: ['views'],
    queryFn: () => api.get<{ views: Array<{ id: string; name: string; query: string }> }>('/views'),
    enabled: resolvedHubId === 'explore',
  });

  const reminderCount = reminderQuery.data?.reminders?.length ?? 0;
  const databaseOk = statusQuery.data?.checks?.database?.ok;
  const systemLabel = statusQuery.isLoading
    ? 'Checking system'
    : statusQuery.isError || databaseOk == null
      ? 'Status unavailable'
      : databaseOk
        ? 'Systems nominal'
        : 'System attention needed';
  const systemTone = databaseOk === true ? 'ok' : databaseOk === false ? 'warning' : 'unknown';

  function toggleSpace() {
    const next = space === 'demo' ? 'real' : 'demo';
    setSpace(next);
    setSpaceState(next);
    queryClient.clear();
    // Today, not `/`. The root path is the public marketing route
    // (App.tsx mounts Landing there and AuthGate only at `path="*"`), so
    // navigating to it dropped a signed-in person out of the application and
    // onto the marketing site, taking the demo banner with it.
    navigate('/today');
  }

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${routeAnnouncement} · Vitae`;
    return () => {
      document.title = previousTitle;
    };
  }, [routeAnnouncement]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setQuickAdd(true);
      } else if (mod && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setSwitcher(true);
      } else if (event.key === 'Escape') {
        setReminders(false);
      } else if (event.key.toLowerCase() === 'n' && !mod && !event.altKey) {
        const target = event.target as HTMLElement | null;
        const typing =
          target &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (!typing) {
          event.preventDefault();
          setNewMenu(true);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <TooltipProvider>
      <div
        className={`shell${compactRail ? ' shell--collapsed' : ''}`}
        data-workspace={isHelp ? 'help' : (resolvedHubId ?? 'unknown')}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-overlay focus:px-4 focus:py-2 focus:text-ink-strong"
        >
          Skip to content
        </a>

        <nav className="rail" aria-label="Primary">
          <Link className="rail__brand" to="/today" aria-label="Vitae, go to Today">
            {compactRail ? <LogoMark size={27} /> : <LogoHorizontal markSize={24} />}
          </Link>

          <button
            type="button"
            className={`rail__omnibox${compactRail ? ' rail__omnibox--compact' : ''}`}
            aria-label="Search or jump (⌘P)"
            onClick={() => setSwitcher(true)}
          >
            <Glyph name="search" size={16} />
            {!compactRail && (
              <>
                <span>Find anything</span>
                <Kbd>⌘P</Kbd>
              </>
            )}
          </button>

          <div className="rail__hubs">
            {HUBS.map((hub) => (
              <RailLink
                key={hub.id}
                hub={hub}
                compact={compactRail}
                active={hasActiveHub && activeHubId === hub.id}
              />
            ))}
          </div>

          <div className="rail__spacer" />

          <button
            type="button"
            className={`rail__capture${compactRail ? ' rail__capture--compact' : ''}`}
            aria-label="Capture to graph"
            title="Quick capture (⌘K)"
            onClick={() => setQuickAdd(true)}
          >
            <Glyph name="capture" size={18} />
            {!compactRail && (
              <>
                <span>Capture</span>
                <Kbd>⌘K</Kbd>
              </>
            )}
          </button>

          <Link
            className={`navlink${compactRail ? ' navlink--tile' : ''}`}
            to="/help"
            aria-label={compactRail ? 'Help' : undefined}
          >
            <Glyph name="ask" size={17} />
            {!compactRail && 'Help & shortcuts'}
          </Link>

          <div className="rail__foot">
            {!compactRail && (
              <Link className="rail__status" to="/settings/system">
                <span className={`rail__status-dot rail__status-dot--${systemTone}`} />
                <span>{systemLabel}</span>
              </Link>
            )}
            {!isTabletRail && (
              <button
                type="button"
                className="rail__collapse"
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                onClick={() => setCollapsed((value) => !value)}
              >
                <Glyph
                  name="chevron-down"
                  size={14}
                  style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(90deg)' }}
                />
              </button>
            )}
          </div>
        </nav>

        <div className="shell__stage">
          <header className="topbar">
            <Breadcrumb />
            <button
              type="button"
              className="topbar__omnibox"
              aria-label="Search records or run a command"
              onClick={() => setSwitcher(true)}
            >
              <Glyph name="search" size={15} />
              <span>Search records or run a command</span>
              <Kbd>⌘P</Kbd>
            </button>
            <div className="topbar__actions">
              <Button
                variant="ghost"
                glyph="adjust"
                onClick={toggleSpace}
                className={space === 'demo' ? 'topbar__demo-active' : undefined}
                aria-label={
                  space === 'demo' ? 'Demo data: click to return to your real data' : 'View demo'
                }
                title={space === 'demo' ? 'Viewing demo data' : 'Preview with demo data'}
              >
                <span className="topbar__action-label">
                  {space === 'demo' ? 'Demo data' : 'View demo'}
                </span>
              </Button>
              <NewEntityMenu open={newMenu} onOpenChange={setNewMenu} />
              <Button
                variant="ghost"
                glyph="capture"
                className="topbar__capture"
                aria-label="Quick capture"
                title="Quick capture (⌘K)"
                onClick={() => setQuickAdd(true)}
              >
                <span className="topbar__action-label">Capture</span>
              </Button>
              <RemindersDrawer
                open={reminders}
                onOpenChange={setReminders}
                trigger={
                  <button
                    type="button"
                    className="topbar__bell"
                    aria-label={reminderCount > 0 ? `Reminders, ${reminderCount} due` : 'Reminders'}
                  >
                    <Glyph name="bell" size={16} />
                    {reminderCount > 0 && <span className="topbar__badge">{reminderCount}</span>}
                  </button>
                }
              />
              <Button
                variant="ghost"
                glyph="signout"
                aria-label="Sign out"
                onClick={() => void signOut()}
              >
                <span className="topbar__action-label">Sign out</span>
              </Button>
            </div>
          </header>

          <nav className="workspace-strip" aria-label={`${workspaceIdentity.label} workspace`}>
            <Link className="workspace-strip__identity" to={workspaceIdentity.path}>
              <span>{workspaceIdentity.label}</span>
              <small>{workspaceIdentity.description}</small>
            </Link>
            <div className="workspace-strip__links">
              {localRoutes.map((route) => {
                const active = isRouteActive(pathname, route, search);
                return (
                  <Link
                    key={route.path}
                    to={route.path}
                    className={active ? 'active' : undefined}
                    aria-current={active ? 'page' : undefined}
                  >
                    {route.shortLabel ?? route.label}
                  </Link>
                );
              })}
              {activeHubId === 'explore' &&
                viewsQuery.data?.views.map((view) => (
                  <Link
                    key={view.id}
                    className="workspace-strip__saved"
                    to={`/explore/library?q=${encodeURIComponent(view.query)}`}
                    title={view.query}
                  >
                    <Glyph name="pin" size={12} /> {view.name}
                  </Link>
                ))}
            </div>
            <Link
              className={`workspace-strip__status workspace-strip__status--${systemTone}`}
              to="/settings/system"
            >
              <span aria-hidden />
              {systemLabel}
            </Link>
          </nav>

          {accessLock && (
            <div role="status" aria-label="Workspace access" className="demo-banner">
              <span className="demo-banner__dot" />
              <span className="demo-banner__label">{ACCESS_LOCK[accessLock].label}</span>
              <span className="demo-banner__detail">{ACCESS_LOCK[accessLock].detail}</span>
              <span className="demo-banner__actions">
                <Link to="/data/exports">Export your record</Link>
                <Link to="/settings/billing">Manage billing</Link>
              </span>
            </div>
          )}

          {space === 'demo' && (
            <div role="status" className="demo-banner">
              <span className="demo-banner__dot" />
              <span className="demo-banner__label">Demo space</span>
              <span className="demo-banner__detail">
                You are exploring Jordan’s sample graph. Your records remain untouched.
              </span>
              <button type="button" className="demo-banner__back" onClick={toggleSpace}>
                Back to my data
              </button>
            </div>
          )}

          {/* Keyed, and deliberately not inside AnimatePresence. `mode="wait"`
              held the outgoing wrapper on screen until its exit finished, but
              a wrapper renders whatever `children` is now, and by then that is
              already the incoming screen. So every navigation mounted the new
              screen inside the old wrapper, faded it out, destroyed it, and
              mounted it a second time. Whatever it had done in those 90ms went
              with it: an open dialog, a typed character, a click that had just
              landed. The key alone mounts each screen once and still carries
              it in. */}
          <motion.div
            key={pathname}
            id="main-content"
            ref={mainRef}
            tabIndex={-1}
            className="content"
            variants={routeMotion}
            initial="initial"
            animate="animate"
          >
            {children}
          </motion.div>
        </div>

        <div aria-live="polite" aria-atomic="true" className="u-visually-hidden">
          {routeAnnouncement}
        </div>

        {firstRun && <FirstRun onDone={dismissFirstRun} />}
        {quickAdd && <QuickAdd onClose={() => setQuickAdd(false)} />}

        <nav className="mobile-dock" aria-label="Primary">
          {[ROUTES.today, ROUTES.network].map((item) => {
            const active = hasActiveHub && activeHubId === item.hub;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={active ? 'active' : undefined}
                aria-current={active ? 'page' : undefined}
              >
                <Glyph name={item.glyph} size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <span className="mobile-dock__capture-slot" aria-hidden />
          {[ROUTES.explore, ROUTES.career].map((item) => {
            const active = hasActiveHub && activeHubId === item.hub;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={active ? 'active' : undefined}
                aria-current={active ? 'page' : undefined}
              >
                <Glyph name={item.glyph} size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            className={
              hasActiveHub && (activeHubId === 'data' || activeHubId === 'settings')
                ? 'active'
                : undefined
            }
            aria-label="More destinations"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(true)}
          >
            <Glyph name="adjust" size={18} />
            <span>More</span>
          </button>
        </nav>

        <Sheet open={moreOpen} onOpenChange={setMoreOpen} title="Vitae workspaces">
          <div className="mobile-more">
            {HUBS.map((hub) => (
              <Link
                key={hub.id}
                to={hub.path}
                className={hasActiveHub && activeHubId === hub.id ? 'active' : undefined}
                onClick={() => setMoreOpen(false)}
              >
                <Glyph name={hub.glyph} size={18} />
                <span>
                  <strong>{hub.label}</strong>
                  <small>{hub.description}</small>
                </span>
              </Link>
            ))}
            <Link to="/help" onClick={() => setMoreOpen(false)}>
              <Glyph name="ask" size={18} />
              <span>
                <strong>Help</strong>
                <small>Shortcuts and working model</small>
              </span>
            </Link>
          </div>
        </Sheet>

        {switcher && (
          <QuickSwitcher
            onClose={() => setSwitcher(false)}
            actions={buildCommands({
              navigate,
              openCapture: () => setQuickAdd(true),
              openNew: () => setNewMenu(true),
              toggleSpace,
              space,
            })}
            onPick={(id, type) => {
              setSwitcher(false);
              navigate(entityHref(type, id));
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
