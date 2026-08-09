import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button, Glyph, Kbd, LogoHorizontal, LogoMark, type GlyphName } from '@vitae/ui';
import { api, getSpace, setSpace } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { FirstRun, useFirstRun } from '../features/FirstRun.js';
import { QuickAdd } from '../features/QuickAdd.js';
import { QuickSwitcher } from '../features/QuickSwitcher.js';
import { RemindersDrawer } from '../features/RemindersDrawer.js';
import { NewEntityMenu } from '../features/forms/NewEntityMenu.js';
import { enter as enterVariants, exit as exitVariants, route as routeVariants } from '../lib/motion.js';
import { ROUTES, routesBySection, type RouteEntry } from './routes.js';
import { buildCommands } from './commands.js';
import { Breadcrumb } from './Breadcrumb.js';
import { entityHref } from '../lib/entity-href.js';

const TODAY = ROUTES.today;
const NAV_TOP = routesBySection('top');
/** Everything in the "top" section except Today, which stays its own always-
 * visible row: the anchor, not a member of a collapsible group. */
const PEOPLE_GROUP = NAV_TOP.filter((r) => r.path !== TODAY.path);
const RESUME_NAV = routesBySection('resume');
const NAV_BOTTOM = routesBySection('library');
const NAV_FOOT = routesBySection('bottom');

const MOBILE_DOCK: RouteEntry[] = [
  ROUTES.today,
  { ...ROUTES.resumeOverview, label: 'Résumé', end: true },
  ROUTES.resumeTailor,
  ROUTES.resumeAtoms,
  ROUTES.resumeOutputs,
];

const COLLAPSE_KEY = 'vitae.nav.collapsed';

/** True while the viewport matches `query`. Used for the tablet band
 * (641-1023px) where the brand book specifies the rail auto-collapses to
 * icons: a real layout state, not only a CSS media query, because the nav
 * labels are React children that must stop rendering, not only hide. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

function navLinkClass(tile: boolean) {
  return ({ isActive }: { isActive: boolean }) =>
    ['navlink', tile && 'navlink--tile', isActive && 'navlink--active'].filter(Boolean).join(' ');
}

const GROUPS_KEY = 'vitae.nav.groups';
/** People is small enough (4 items) to default open; Library is the 7-item
 * group the flat list made overwhelming, so it starts closed. Views only
 * exists once the user has saved one, so an open default costs nothing. */
const DEFAULT_EXPANDED_GROUPS = ['people', 'views'];

function loadExpandedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // Corrupt or foreign localStorage value: fall through to the default.
  }
  return new Set(DEFAULT_EXPANDED_GROUPS);
}

function routeInGroup(pathname: string, items: { path: string }[]): boolean {
  return items.some((i) => pathname === i.path || pathname.startsWith(`${i.path}/`));
}

/** Which collapsible group, if any, owns the current route, so arriving
 * somewhere always reveals it, even if the group was manually closed on a
 * previous visit. Record detail (`/n/:id`) and browse (`/browse/:type`)
 * count as Library, mirroring Breadcrumb.tsx's own "parent: Collections". */
function routeGroupId(pathname: string): 'people' | 'library' | null {
  if (routeInGroup(pathname, PEOPLE_GROUP)) return 'people';
  if (routeInGroup(pathname, NAV_BOTTOM) || pathname.startsWith('/browse/') || pathname.startsWith('/n/')) {
    return 'library';
  }
  return null;
}

interface NavGroupItem {
  path: string;
  label: string;
  glyph: GlyphName;
  end?: boolean;
  title?: string;
  /** Stable identity when `path` isn't unique: two saved views can hold the
   *  same query, and keying by path made React collapse them into one row. */
  id?: string;
}

/** A collapsible section of peer-level rail destinations, distinct from the
 * Résumé subnav, which is real parent/child routing, not a scanability
 * grouping. Desktop-expanded rail only; icon-tile mode renders these flat
 * (see the `rail` conditionals at each call site), since there's no label to
 * hide/reveal once everything is already a compact icon. */
function NavGroup({
  id,
  label,
  items,
  active,
  expanded,
  onToggle,
  reducedMotion,
}: {
  id: string;
  label: string;
  items: NavGroupItem[];
  active: boolean;
  expanded: boolean;
  onToggle: () => void;
  reducedMotion: boolean;
}) {
  return (
    <div className="rail__group">
      <button
        type="button"
        className={`rail__group-head${active ? ' rail__group-head--active' : ''}`}
        aria-expanded={expanded}
        // Only while the panel is actually mounted. AnimatePresence removes it
        // on collapse, and aria-controls pointing at a missing id is invalid.
        // aria-expanded alone carries the state (disclosure pattern, APG).
        aria-controls={expanded ? `rail-group-${id}` : undefined}
        onClick={onToggle}
      >
        <Glyph name="chevron-down" size={12} className="rail__group-chevron" style={{ transform: expanded ? undefined : 'rotate(-90deg)' }} />
        <span>{label}</span>
        {/* The bare count reads as an ambiguous "Library 7" to a screen
            reader; the hidden noun makes it "Library 7 items" while keeping
            the visible text a substring of the name (WCAG 2.5.3). */}
        {!expanded && (
          <span className="rail__group-count">
            {items.length}
            <span className="u-visually-hidden"> items</span>
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={`rail-group-${id}`}
            className="rail__children"
            variants={{ ...enterVariants(reducedMotion), ...exitVariants(reducedMotion) }}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {items.map((n) => (
              <NavLink key={n.id ?? n.path} to={n.path} end={n.end} className="navlink navlink--nested" title={n.title}>
                <Glyph name={n.glyph} size={16} />
                {n.label}
              </NavLink>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [quickAdd, setQuickAdd] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [reminders, setReminders] = useState(false);
  const [newMenu, setNewMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const isTabletRail = useMediaQuery('(max-width: 1023px) and (min-width: 641px)');
  const rail = collapsed || isTabletRail;
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => loadExpandedGroups());
  const [firstRun, dismissFirstRun] = useFirstRun();
  const [space, setSpaceState] = useState(() => getSpace());
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { signOut } = useAuth();
  const reducedMotion = useReducedMotion();
  const queryClient = useQueryClient();

  function toggleSpace() {
    const next = space === 'demo' ? 'real' : 'demo';
    setSpace(next);
    setSpaceState(next);
    queryClient.clear();
    navigate('/');
  }

  function toggleGroup(id: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const inResume = pathname.startsWith(ROUTES.resumeOverview.path);
  const activeGroup = routeGroupId(pathname);

  // The header only needs to know whether a dependency is down. Poll on a slow
  // cadence and stop entirely when the tab is in the background. Combined with
  // the aggregation-count fix on the server (FR-005), an idle open tab no longer
  // costs a full database read every minute.
  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: () => api.get<{ checks: Record<string, { ok: boolean }> }>('/status'),
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });

  const { data: reminderData } = useQuery({
    queryKey: ['reminders'],
    queryFn: () => api.get<{ reminders: Array<{ id: string }> }>('/reminders?due=all'),
    refetchInterval: 120_000,
  });
  const reminderCount = reminderData?.reminders?.length ?? 0;

  const { data: viewsData } = useQuery({
    queryKey: ['views'],
    queryFn: () => api.get<{ views: Array<{ id: string; name: string; query: string }> }>('/views'),
  });
  const savedViews = viewsData?.views ?? [];

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem(GROUPS_KEY, JSON.stringify([...expandedGroups]));
  }, [expandedGroups]);

  // Arriving somewhere always reveals it. A manually closed group never
  // hides the page you're actually on. Closing a group you're currently
  // viewing is still respected until the next navigation.
  useEffect(() => {
    if (!activeGroup) return;
    setExpandedGroups((prev) => (prev.has(activeGroup) ? prev : new Set(prev).add(activeGroup)));
  }, [activeGroup]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickAdd(true);
      } else if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setSwitcher(true);
      } else if (e.key === 'Escape') {
        setReminders(false);
      } else if (e.key === 'n' && !mod && !e.altKey) {
        // Structured "new record" picker: skip when typing in a field.
        const t = e.target as HTMLElement | null;
        const typing =
          t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        if (!typing) {
          e.preventDefault();
          setNewMenu(true);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const backupOk = status?.checks?.database?.ok ?? true;

  return (
    <div className={`shell${rail ? ' shell--collapsed' : ''}`}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-overlay focus:px-4 focus:py-2 focus:text-ink-strong"
      >
        Skip to content
      </a>
      <nav className="rail" aria-label="Primary">
        <div className="rail__brand">
          {rail ? <LogoMark size={26} title="Vitae" /> : <LogoHorizontal markSize={24} />}
        </div>

        {!rail && (
          <button type="button" className="rail__search" onClick={() => setSwitcher(true)}>
            <Glyph name="search" size={14} />
            <span style={{ flex: 1, textAlign: 'left' }}>Search or jump…</span>
            <Kbd>⌘P</Kbd>
          </button>
        )}
        {rail && (
          <button type="button" className="navlink navlink--tile" title="Search (⌘P)" onClick={() => setSwitcher(true)}>
            <Glyph name="search" size={16} />
          </button>
        )}

        <div className="rail__group">
          <NavLink to={TODAY.path} className={navLinkClass(rail)} end={TODAY.end} title={rail ? TODAY.label : undefined}>
            <Glyph name={TODAY.glyph} size={16} />
            {!rail && TODAY.label}
          </NavLink>

          {rail
            ? PEOPLE_GROUP.map((n) => (
                <NavLink key={n.path} to={n.path} className={navLinkClass(true)} title={n.label}>
                  <Glyph name={n.glyph} size={16} />
                </NavLink>
              ))
            : (
              <NavGroup
                id="people"
                label="People"
                items={PEOPLE_GROUP}
                active={activeGroup === 'people'}
                expanded={expandedGroups.has('people')}
                onToggle={() => toggleGroup('people')}
                reducedMotion={!!reducedMotion}
              />
            )}

          <NavLink
            to={ROUTES.resumeOverview.path}
            className={({ isActive }) =>
              ['navlink', rail && 'navlink--tile', (isActive || inResume) && 'navlink--active'].filter(Boolean).join(' ')
            }
            title={rail ? 'Résumé' : undefined}
          >
            <Glyph name="resume" size={16} />
            {!rail && 'Résumé'}
          </NavLink>
          {!rail && inResume && (
            <div className="rail__children">
              {RESUME_NAV.map((n) => (
                <NavLink key={n.path} to={n.path} end={n.path === ROUTES.resumeOverview.path} className="navlink navlink--sub">
                  {n.label}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        <div className="rail__group">
          {rail
            ? NAV_BOTTOM.map((n) => (
                <NavLink key={n.path} to={n.path} className={navLinkClass(true)} title={n.label}>
                  <Glyph name={n.glyph} size={16} />
                </NavLink>
              ))
            : (
              <NavGroup
                id="library"
                label="Library"
                items={NAV_BOTTOM}
                active={activeGroup === 'library'}
                expanded={expandedGroups.has('library')}
                onToggle={() => toggleGroup('library')}
                reducedMotion={!!reducedMotion}
              />
            )}
        </div>

        {!rail && savedViews.length > 0 && (
          <NavGroup
            id="views"
            label="Views"
            items={savedViews.map((v) => ({
              id: v.id,
              path: `/collections?q=${encodeURIComponent(v.query)}`,
              label: v.name,
              glyph: 'pin' as const,
              title: v.query,
            }))}
            active={false}
            expanded={expandedGroups.has('views')}
            onToggle={() => toggleGroup('views')}
            reducedMotion={!!reducedMotion}
          />
        )}

        <div className="rail__spacer" />

        <div className="rail__group">
          {NAV_FOOT.map((n) => (
            <NavLink key={n.path} to={n.path} className={navLinkClass(rail)} title={rail ? n.label : undefined}>
              <Glyph name={n.glyph} size={16} />
              {!rail && n.label}
            </NavLink>
          ))}
        </div>

        <div className="rail__foot">
          {!rail && (
            <div className="rail__status">
              <span className="rail__status-dot" style={{ background: backupOk ? 'var(--ae-success)' : 'var(--ae-warning)' }} />
              {backupOk ? 'Systems nominal' : 'Check /status'}
            </div>
          )}
          {!isTabletRail && (
            <button
              type="button"
              className="rail__collapse"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setCollapsed((c) => !c)}
            >
              <Glyph name="chevron-down" size={14} style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(90deg)' }} />
            </button>
          )}
        </div>
      </nav>

      <div className="flex flex-1 flex-col overflow-hidden bg-canvas">
        <header className="topbar">
          <Breadcrumb />
          <div className="flex shrink-0 items-center gap-3">
            <button type="button" className="topbar__search" aria-label="Search or jump (⌘P)" title="Search (⌘P)" onClick={() => setSwitcher(true)}>
              <Glyph name="search" size={16} />
            </button>
            <Button
              variant="ghost"
              glyph="adjust"
              onClick={toggleSpace}
              style={space === 'demo' ? { color: 'var(--ae-warning)', fontWeight: 600 } : undefined}
              aria-label={space === 'demo' ? 'Demo data: click to return to your real data' : 'View demo'}
              title={space === 'demo' ? 'Viewing demo data: click to return to your real data' : 'Preview the app with demo data'}
            >
              <span className="topbar__action-label">{space === 'demo' ? 'Demo data' : 'View demo'}</span>
            </Button>
            <NewEntityMenu open={newMenu} onOpenChange={setNewMenu} />
            <Button variant="ghost" glyph="capture" aria-label="Quick capture" title="Quick capture (⌘K)" onClick={() => setQuickAdd(true)}>
              <span className="topbar__action-label">Capture</span>
              <span className="topbar__kbd">
                <Kbd>⌘K</Kbd>
              </span>
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
            <Button variant="ghost" glyph="signout" aria-label="Sign out" onClick={() => void signOut()}>
              <span className="topbar__action-label">Sign out</span>
            </Button>
          </div>
        </header>
        {space === 'demo' && (
          <div role="status" className="demo-banner">
            <span className="demo-banner__dot" />
            <span className="demo-banner__label">Demo space</span>
            <span className="demo-banner__detail">Demo data for "Jordan". Nothing here touches your real records.</span>
            <button type="button" className="demo-banner__back" onClick={toggleSpace}>
              Back to my data
            </button>
          </div>
        )}
        <motion.div
          key={pathname}
          id="main-content"
          tabIndex={-1}
          className="content"
          variants={routeVariants(!!reducedMotion)}
          initial="initial"
          animate="animate"
        >
          {children}
        </motion.div>
      </div>

      {firstRun && <FirstRun onDone={dismissFirstRun} />}
      {quickAdd && <QuickAdd onClose={() => setQuickAdd(false)} />}
      <nav className="mobile-dock" aria-label="Primary">
        {MOBILE_DOCK.map((item) => (
          <NavLink key={item.path} to={item.path} end={!!item.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
            <Glyph name={item.glyph} size={16} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
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
  );
}
