import '../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Ask } from './Ask.js';

const permissions = vi.hoisted(() => ({ canWrite: true }));
vi.mock('../lib/auth.js', () => ({
  useCanWrite: () => permissions.canWrite,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));
const person = (id: string, match = false) => ({
  id,
  title: id === 'p1' ? 'Ada Chen' : 'Sam Rivera',
  score: match ? 1 : 2,
  chips: [{ factor: match ? 'topic' : 'strength', raw: 1, weighted: 1 }],
  topEvidence: [],
  pack: {
    interactions: [],
    followUps: [{ what: 'Share the notes' }],
    shared: [{ id: 'o1', type: 'organization', title: 'Fieldwork' }],
    topics: [],
  },
});
beforeEach(() => {
  resetMockApi();
  permissions.canWrite = true;
  mockApi.get.mockResolvedValue({ asks: [] });
  mockApi.post.mockResolvedValue({ results: [person('p1')] });
});
function HistoryControls() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
      <Ask />
    </>
  );
}
describe('Who to contact states', () => {
  it('waits for an explicit request and re-ranks the same request', async () => {
    const user = userEvent.setup();
    renderWithApp(<Ask />);
    expect(screen.getByText('Nothing asked yet')).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('City'), '  Cairo  ');
    await user.click(screen.getByRole('button', { name: 'Rank contacts' }));
    await screen.findByRole('button', { name: /Open contact dossier for Ada/ });
    expect(mockApi.post).toHaveBeenCalledWith(
      '/ask/people',
      expect.objectContaining({ city: 'Cairo' }),
    );
    expect(screen.getByLabelText('City')).toHaveValue('Cairo');
    await user.click(screen.getByRole('button', { name: 'Rank contacts' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(2));
  });
  it('restores the form on Back and Forward, distinguishing unranked edits', async () => {
    const user = userEvent.setup();
    renderWithApp(<HistoryControls />, { route: '/?city=Cairo&run=1' });
    await screen.findByText('Ada Chen');
    await user.clear(screen.getByLabelText('City'));
    await user.type(screen.getByLabelText('City'), 'Paris');
    expect(screen.getByText('Your changes have not been ranked yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rank contacts' }));
    await screen.findByText('Ada Chen');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('City')).toHaveValue('Cairo');
    await user.click(screen.getByRole('button', { name: 'Forward' }));
    expect(screen.getByLabelText('City')).toHaveValue('Paris');
  });
  it('does not report an empty network when ranking data is malformed', async () => {
    mockApi.post.mockResolvedValue({});
    renderWithApp(<Ask />, { route: '/?run=1' });
    expect(await screen.findByText("Couldn't rank anyone")).toBeInTheDocument();
    expect(screen.queryByText('No one to call')).not.toBeInTheDocument();
  });
  it('does not wait for recent asks to finish before displaying a ranking', async () => {
    mockApi.get.mockImplementation(() => new Promise(() => {}));
    renderWithApp(<Ask />, { route: '/?run=1' });
    expect(await screen.findByText('Ada Chen')).toBeInTheDocument();
    expect(screen.getByText('Loading recent asks')).toBeInTheDocument();
  });
  it('reports malformed recall data without taking away ranked contacts', async () => {
    mockApi.get.mockResolvedValue({ asks: [{ label: 'Invalid recall', intent: null }] });
    renderWithApp(<Ask />, { route: '/?run=1' });
    expect(await screen.findByText('Recent asks could not be loaded')).toBeInTheDocument();
    expect(await screen.findByText('Ada Chen')).toBeInTheDocument();
  });
  it('does not render a broken context pack as a complete ranking', async () => {
    mockApi.post.mockResolvedValue({ results: [{ ...person('p1'), pack: { topics: [] } }] });
    renderWithApp(<Ask />, { route: '/?run=1' });
    expect(await screen.findByText("Couldn't rank anyone")).toBeInTheDocument();
    expect(screen.getByText('The ranking was incomplete. Try again.')).toBeInTheDocument();
  });
  it('distinguishes an unmatched leader from an entirely unmatched list', async () => {
    mockApi.post.mockResolvedValue({ results: [person('p1'), person('p2', true)] });
    renderWithApp(<Ask />, { route: '/?topics=Research' });
    expect(
      await screen.findByText('The first contact has no request-specific match'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No contact matched the intent')).not.toBeInTheDocument();
  });
  it('does not claim a request mismatch when no constraints were supplied', async () => {
    renderWithApp(<Ask />, { route: '/?run=1' });
    await screen.findByText('Ada Chen');
    expect(screen.queryByText('No contact matched the intent')).not.toBeInTheDocument();
    expect(screen.queryByText('Relationship context only')).not.toBeInTheDocument();
  });
  it('shows negative factors, truthful context labels and permission restrictions', async () => {
    permissions.canWrite = false;
    const ranked = person('p1');
    ranked.chips.push({ factor: 'reciprocity', raw: -1, weighted: -0.5 });
    mockApi.post.mockResolvedValue({ results: [ranked] });
    const user = userEvent.setup();
    renderWithApp(<Ask />, { route: '/?run=1' });
    await user.click(await screen.findByRole('button', { name: /Open contact dossier for Ada/ }));
    expect(screen.getByText('favors -0.50')).toBeInTheDocument();
    expect(screen.getByText('Recorded follow-ups')).toBeInTheDocument();
    expect(screen.getByText('Related records')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log outreach' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Fieldwork' })).toHaveAttribute(
      'href',
      '/network/organizations/o1',
    );
  });
});
