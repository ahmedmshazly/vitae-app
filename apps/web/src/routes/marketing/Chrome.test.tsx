/**
 * The public chrome's escape route: the link that gets a keyboard past the
 * masthead.
 *
 * Scope is deliberately narrow. Every public page mounts `MarketingShell`, so
 * the masthead sits between the address bar and the first sentence of eleven
 * routes, and the skip link is the only way across it that does not cost seven
 * tab stops. The nav's own contents, the sheet and the footer's link inventory
 * are still unproven, and `docs/testing/source-test-map.json` says so rather
 * than letting this file imply a suite it is not.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MarketingShell } from './Chrome.js';

function renderShell(route = '/') {
  return render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      initialEntries={[route]}
    >
      <MarketingShell>
        <h1>How it works</h1>
      </MarketingShell>
    </MemoryRouter>,
  );
}

describe('MarketingShell, the way past the masthead', () => {
  // A skip link that is not the first thing focus reaches is decoration. This
  // asserts document order and focusability together, which is what the first
  // Tab of a keyboard reader actually measures.
  it('offers the skip link before anything it skips', async () => {
    renderShell();
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus();
  });

  // These two identifiers agreed with each other for the whole time the link
  // did nothing. A browser moves focus to a fragment target only when the
  // target can hold focus, so without `tabIndex={-1}` the page scrolled, focus
  // stayed on the link, and the next Tab went back into the nav the reader was
  // trying to leave. jsdom does not implement fragment focus, so what is
  // asserted here is the precondition a browser needs, plus that focus lands
  // on the landmark once it is placed there.
  it('gives the link a target that can hold focus', async () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      '#main-content',
    );

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    expect(main).toHaveAttribute('tabindex', '-1');
    main.focus();
    expect(main).toHaveFocus();
  });

  // What the skip link jumps between. A reader who lands on `main` reaches the
  // footer's four link groups by continuing forward, and the masthead by
  // shift-tabbing, only while all three regions are landmarks.
  it('keeps the masthead, the page and the footer as separate landmarks', () => {
    renderShell();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('heading', { level: 1, name: 'How it works' }),
    );
  });
});
