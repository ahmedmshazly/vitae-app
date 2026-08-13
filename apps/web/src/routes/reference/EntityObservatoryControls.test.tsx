/**
 * The observatory cockpit drawer, and the one attribute that decides whether
 * 62 controls are reachable while it is closed.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EntityObservatoryControls } from './EntityObservatoryControls.js';
import { DEFAULT_OBSERVATORY_STATE } from './entityObservatoryModel.js';

function renderControls(drawerOpen: boolean) {
  const noop = () => {};
  return render(
    <EntityObservatoryControls
      state={DEFAULT_OBSERVATORY_STATE}
      drawerOpen={drawerOpen}
      search=""
      searchResults={[]}
      activeWorkspaceId={null}
      savedWorkspaces={[]}
      onStateChange={noop}
      onToggleDrawer={noop}
      onSearch={noop}
      onSelect={noop}
      onFit={noop}
      onZoomIn={noop}
      onZoomOut={noop}
      onUndo={noop}
      onRedo={noop}
      canUndo={false}
      canRedo={false}
      onClear={noop}
      onReset={noop}
      onCopyLink={noop}
      onOpenCommands={noop}
      onSaveWorkspace={noop}
      onLoadWorkspace={noop}
      onDeleteWorkspace={noop}
      onExportWorkspace={noop}
      onImportWorkspace={noop}
      onUnpinAll={noop}
    />,
  );
}

describe('the observatory cockpit drawer', () => {
  it('is inert while closed, not merely hidden from the accessibility tree', () => {
    const { container } = renderControls(false);
    const drawer = container.querySelector('.ec-observatory-drawer');

    // `aria-hidden` alone is the bug axe calls `aria-hidden-focus`: the subtree
    // leaves the accessibility tree but keeps its tab stops, so a keyboard
    // lands on controls a screen reader has been told do not exist.
    expect(drawer).toHaveAttribute('aria-hidden', 'true');
    // The attribute has to actually reach the DOM. It was written as
    // `{...{ inert: '' }}`, which React 18 honoured and React 19 reads as a
    // boolean — the empty string is false, so the attribute silently vanished
    // on the upgrade and nothing but the e2e axe sweep noticed. jsdom does not
    // implement the `inert` *property*, so this asserts the attribute; that it
    // actually removes the tab stops is what entity-catalog.spec.ts checks, in
    // a browser, with axe.
    expect(drawer).toHaveAttribute('inert');
    expect(drawer!.querySelectorAll('select, input, button, a[href]').length).toBeGreaterThan(0);
  });

  it('is reachable again once open', () => {
    const { container } = renderControls(true);
    const drawer = container.querySelector('.ec-observatory-drawer');

    // The other half: making it inert while closed must not leave it inert
    // when the user has opened it.
    expect(drawer).toHaveAttribute('aria-hidden', 'false');
    expect(drawer).not.toHaveAttribute('inert');
  });
});
