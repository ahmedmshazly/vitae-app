import './../test/api-mock.js';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Intros, parseIntroPaths, parseIntroTargets } from './Intros.js';

const primary = {
  id: 'org-primary',
  title: 'Long-Form Research Cooperative',
  kind: 'community',
  city: 'Alexandria',
  stage: 'applied',
  reach: 'direct',
  reachable: true,
  affinity: 0.8,
  peopleCount: 2,
  openRoles: 1,
};
const alternate = {
  id: 'org-alternate',
  title: 'Northstar Labs',
  kind: 'company',
  city: 'Cairo',
  stage: null,
  reach: '2 hops',
  reachable: true,
  affinity: 0.6,
  peopleCount: 1,
  openRoles: 0,
};

function routeFor(target: { id: string; title: string } = primary) {
  return {
    org: { id: target.id },
    paths: [
      {
        hops: [
          { nodeId: 'self', title: 'You', type: 'person' },
          {
            nodeId: 'asker',
            title: 'Ari Rivera',
            type: 'person',
            viaEdgeType: 'knows',
            viaStrength: 0.74,
          },
          {
            nodeId: target.id,
            title: target.title,
            type: 'organization',
            viaEdgeType: 'works_at',
          },
        ],
        score: 0.63,
        strengthLabel: 'strong',
        askerId: 'asker',
        askerName: 'Ari Rivera',
        why: 'Ari has a recorded role at this organization and a strong tie to you.',
        factors: ['1 hop', 'Works there', 'Strong tie'],
      },
    ],
  };
}

function installWarmApi(targets = [primary, alternate]) {
  mockApi.get.mockImplementation(async (path: string) => {
    if (path === '/intros/targets') return { targets };
    const target = targets.find((item) => path === `/intros/paths?orgId=${item.id}`);
    if (target) return routeFor(target);
    throw new Error(`Unexpected GET ${path}`);
  });
}

function LocationProbe() {
  return <output data-testid="warm-path-location">{useLocation().search}</output>;
}

beforeEach(() => resetMockApi());

describe('Warm paths repaired states', () => {
  it('keeps a deliberate destination choice in the shareable URL', async () => {
    installWarmApi();
    const user = userEvent.setup();
    renderWithApp(
      <>
        <Intros />
        <LocationProbe />
      </>,
      { route: '/network/intelligence?lens=reach&org=org-primary' },
    );

    await user.click(await screen.findByRole('button', { name: /Northstar Labs/ }));
    await waitFor(() =>
      expect(screen.getByTestId('warm-path-location')).toHaveTextContent(
        '?lens=reach&org=org-alternate',
      ),
    );
    expect(screen.getByRole('button', { name: /Northstar Labs/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('does not turn malformed destinations into a false empty state', async () => {
    mockApi.get.mockResolvedValueOnce({ targets: [{ ...primary, peopleCount: 'two' }] });
    renderWithApp(<Intros />, { route: '/network/intelligence?lens=reach' });

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your organizations");
    expect(screen.queryByText('No organizations yet')).not.toBeInTheDocument();
  });

  it('does not turn incomplete path evidence into a false no-path state', async () => {
    mockApi.get.mockImplementation(async (path: string) => {
      if (path === '/intros/targets') return { targets: [primary] };
      return { org: { id: primary.id }, paths: [{ ...routeFor().paths[0], hops: [] }] };
    });
    renderWithApp(<Intros />, { route: `/network/intelligence?lens=reach&org=${primary.id}` });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `Couldn't work out how to reach ${primary.title}`,
    );
    expect(screen.queryByText(`No warm path to ${primary.title} yet`)).not.toBeInTheDocument();
  });

  it('explains the ordered route and keeps the selected target recoverable from a filter', async () => {
    installWarmApi();
    const user = userEvent.setup();
    renderWithApp(<Intros />, { route: `/network/intelligence?lens=reach&org=${primary.id}` });

    expect(
      await screen.findByRole('heading', { name: 'Top route via Ari Rivera' }),
    ).toBeInTheDocument();
    expect(screen.getByText('relative score')).toBeInTheDocument();
    expect(screen.getByLabelText('Recorded route evidence')).toHaveTextContent('Strong tie');
    expect(
      screen.getByRole('button', { name: 'Draft request to Ari Rivera - route 1' }),
    ).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Filter organizations' }), 'Northstar');
    expect(
      await screen.findByText(
        /Viewing Long-Form Research Cooperative, which is outside this filter/,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear the filter' }));
    expect(screen.queryByText(/outside this filter/)).not.toBeInTheDocument();
  });

  it('makes a direct affiliation explicit instead of offering an imaginary opener', async () => {
    const direct = {
      org: { id: primary.id },
      paths: [
        {
          hops: [
            { nodeId: 'self', title: 'You', type: 'person' },
            {
              nodeId: primary.id,
              title: primary.title,
              type: 'organization',
              viaEdgeType: 'works_at',
            },
          ],
          score: 0.9,
          strengthLabel: 'strong',
          askerId: null,
          askerName: null,
          why: 'You are directly affiliated.',
          factors: ['Affiliated'],
        },
      ],
    };
    mockApi.get.mockImplementation(async (path: string) => {
      if (path === '/intros/targets') return { targets: [primary] };
      return direct;
    });
    renderWithApp(<Intros />, { route: `/network/intelligence?lens=reach&org=${primary.id}` });

    expect(
      await screen.findByText(/already have a direct recorded affiliation/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Draft request/ })).not.toBeInTheDocument();
  });
});

describe('Warm paths response boundaries', () => {
  it('validates targets and paths before the route presents them as evidence', () => {
    expect(() => parseIntroTargets({ targets: [{ ...primary, reachable: 'yes' }] })).toThrow(
      'Some organizations were incomplete',
    );
    expect(() => parseIntroPaths({ org: { id: 'different' }, paths: [] }, primary.id)).toThrow(
      'different organization',
    );
    expect(() =>
      parseIntroPaths({ org: { id: primary.id }, paths: routeFor().paths }, alternate.id),
    ).toThrow('different organization');
  });
});
