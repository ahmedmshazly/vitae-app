/**
 * The decisions the import pipeline makes before it touches the database:
 * what a row would write, which stored record it resolves to, and what it would
 * change about that record (FR-SYNC-001, FR-SYNC-002).
 *
 * The commit and rollback passes are proved against real Postgres in
 * routes/v1/imports.integration.test.ts. What is here is everything that can be
 * decided from a row and a record alone, because the trap this guards against
 * is the diff shown at review drifting from the write made at commit.
 */
import { describe, expect, it } from 'vitest';
import type { NodeRecord } from '@vitae/core';
import { buildNodeRecord } from '@vitae/testkit';
import { buildProposal, githubLinkNext, matchGithubRepository, nodeDraftFor, resolveIdentity } from './imports.js';

function person(overrides: Parameters<typeof buildNodeRecord>[0] = {}): NodeRecord {
  return buildNodeRecord({ type: 'person', title: 'Sarah Chen', ...overrides });
}

const vcardRow = {
  entity: 'person' as const,
  title: 'Sarah Chen',
  subtitle: 'Staff SWE · Nile Robotics',
  payload: {
    emails: ['sarah@nile-robotics.com'],
    phones: [],
    headline: 'Staff SWE @ Nile Robotics',
    city: 'Cairo',
  },
  identityKeys: ['contact:email:sarah@nile-robotics.com'],
};

describe('nodeDraftFor', () => {
  it('carries the synthesized identity keys onto the node the row writes', () => {
    expect(nodeDraftFor(vcardRow)!.identity_keys).toEqual([
      'contact:email:sarah@nile-robotics.com',
    ]);
  });

  it('drops an address the person schema would reject rather than failing the row', () => {
    const draft = nodeDraftFor({ ...vcardRow, payload: { emails: ['john at work', 'a@b.test'] } });
    expect((draft!.props as { emails: string[] }).emails).toEqual(['a@b.test']);
  });

  it('writes no node for a résumé line, which owns nothing on its own', () => {
    expect(
      nodeDraftFor({ entity: 'atom', title: 'Shipped it', subtitle: null, payload: {} }),
    ).toBeNull();
  });

  it('writes a task draft from stated props and keeps sensitive', () => {
    const draft = nodeDraftFor({
      entity: 'task',
      title: 'Renew passport',
      subtitle: null,
      payload: {
        type: 'task',
        props: { status: 'next', due: '2026-09-11', priority: 'p1' },
        notes_md: 'Bring photos',
        sensitivity: 'sensitive',
      },
      identityKeys: ['asana:task:123'],
    });
    expect(draft).toMatchObject({
      type: 'task',
      title: 'Renew passport',
      props: { status: 'next', due: '2026-09-11', priority: 'p1' },
      notes_md: 'Bring photos',
      sensitivity: 'sensitive',
      identity_keys: ['asana:task:123'],
    });
  });

  it('writes a project draft', () => {
    const draft = nodeDraftFor({
      entity: 'project',
      title: 'Admin',
      subtitle: 'project',
      payload: { type: 'project', props: {}, notes_md: '' },
      identityKeys: ['project:trello:board1'],
    });
    expect(draft).toMatchObject({ type: 'project', title: 'Admin', identity_keys: ['project:trello:board1'] });
  });

  it('writes no node for a staged skip row', () => {
    expect(
      nodeDraftFor({
        entity: 'task',
        title: 'section',
        subtitle: 'section',
        payload: { skip_reason: 'section' },
      }),
    ).toBeNull();
  });

  it('takes a bundle node whole, since its producer already chose the shape', () => {
    const draft = nodeDraftFor({
      entity: 'graph_node',
      title: 'Jane Smith',
      subtitle: null,
      payload: {
        type: 'person',
        title: 'Jane Smith',
        props: { headline: 'Staff Engineer' },
        identity_keys: ['linkedin:person:jane-smith'],
        notes_md: '',
      },
    });
    expect(draft).toMatchObject({
      type: 'person',
      title: 'Jane Smith',
      identity_keys: ['linkedin:person:jane-smith'],
    });
  });
});

describe('resolveIdentity', () => {
  const stored = person({ id: 'p1', identity_keys: ['contact:email:sarah@nile-robotics.com'] });
  const byKey = new Map<string, NodeRecord>([
    ['contact:email:sarah@nile-robotics.com', stored],
  ]);

  it('resolves a row to the record its key names', () => {
    const draft = nodeDraftFor(vcardRow)!;
    expect(resolveIdentity(vcardRow.identityKeys, draft, byKey)?.node.id).toBe('p1');
  });

  it('tries keys in order, so the primary decides and a secondary only fills in', () => {
    const draft = nodeDraftFor(vcardRow)!;
    const resolved = resolveIdentity(
      ['vcard:person:unknown-uid', 'contact:email:sarah@nile-robotics.com'],
      draft,
      byKey,
    );
    expect(resolved?.key).toBe('contact:email:sarah@nile-robotics.com');
  });

  it('passes over a record of another type, because a person is never an event', () => {
    const draft = nodeDraftFor({
      entity: 'event',
      title: 'Standup',
      subtitle: null,
      payload: {},
      identityKeys: ['contact:email:sarah@nile-robotics.com'],
    })!;
    expect(resolveIdentity(['contact:email:sarah@nile-robotics.com'], draft, byKey)).toBeNull();
  });

  it('resolves nothing for a row whose source identifies it by nothing', () => {
    const draft = nodeDraftFor({ ...vcardRow, identityKeys: [] })!;
    expect(resolveIdentity([], draft, byKey)).toBeNull();
  });
});

describe('buildProposal', () => {
  const identityKey = 'contact:email:sarah@nile-robotics.com';

  function proposalAgainst(stored: NodeRecord, row = vcardRow) {
    return buildProposal(nodeDraftFor(row)!, { key: identityKey, node: stored });
  }

  it('proposes nothing when the record already says what the file says', () => {
    const stored = person({
      identity_keys: [identityKey],
      subtitle: 'Staff SWE · Nile Robotics',
      props: {
        emails: ['sarah@nile-robotics.com'],
        headline: 'Staff SWE @ Nile Robotics',
        city: 'Cairo',
      },
    });
    expect(proposalAgainst(stored).fields).toEqual([]);
  });

  it('names the field that moved, with both sides of it', () => {
    const stored = person({
      identity_keys: [identityKey],
      subtitle: 'Staff SWE · Nile Robotics',
      props: {
        emails: ['sarah@nile-robotics.com'],
        headline: 'Staff SWE @ Nile Robotics',
        city: 'Berlin',
      },
    });
    expect(proposalAgainst(stored).fields).toEqual([
      { key: 'props.city', from: 'Berlin', to: 'Cairo' },
    ]);
  });

  it('does not offer to remove what the file is simply silent about', () => {
    // This card carries no phone number, which is not the same as saying the
    // person has none. Proposing to clear the stored one would be an invention.
    const stored = person({
      identity_keys: [identityKey],
      subtitle: 'Staff SWE · Nile Robotics',
      props: {
        emails: ['sarah@nile-robotics.com'],
        headline: 'Staff SWE @ Nile Robotics',
        city: 'Cairo',
        phones: ['+20 100 555 0101'],
      },
    });
    expect(proposalAgainst(stored).fields).toEqual([]);
  });

  it('never proposes a change to the identity keys that found the record', () => {
    const stored = person({
      identity_keys: [identityKey],
      subtitle: 'Staff SWE · Nile Robotics',
      props: {
        emails: ['sarah@nile-robotics.com'],
        headline: 'Staff SWE @ Nile Robotics',
        city: 'Cairo',
      },
    });
    const row = { ...vcardRow, identityKeys: [identityKey, 'vcard:person:new-uid'] };
    expect(proposalAgainst(stored, row).fields.map((f) => f.key)).not.toContain('identity_keys');
  });

  it('accepts every offered field by default and pins the revision it read', () => {
    const stored = { ...person({ identity_keys: [identityKey], props: {} }), rev: 7 };
    const proposal = proposalAgainst(stored);
    expect(proposal.target_rev).toBe(7);
    expect(proposal.identity_key).toBe(identityKey);
    expect(proposal.accepted).toEqual(proposal.fields.map((f) => f.key));
    expect(proposal.fields.length).toBeGreaterThan(0);
  });

  it('proposes project_id when a later file attaches an existing task', () => {
    const stored = buildNodeRecord({
      type: 'task',
      title: 'Orphan',
      props: { status: 'next' },
      identity_keys: ['tasks_json:task:o1'],
    });
    const draft = nodeDraftFor({
      entity: 'task',
      title: 'Orphan',
      subtitle: null,
      payload: { props: { status: 'next', project_id: 'proj-1' }, notes_md: '' },
      identityKeys: ['tasks_json:task:o1'],
    })!;
    const proposal = buildProposal(draft, { key: 'tasks_json:task:o1', node: stored });
    expect(proposal.fields).toContainEqual({ key: 'props.project_id', from: undefined, to: 'proj-1' });
  });
});

describe('githubLinkNext', () => {
  it("reads the next page from GitHub's Link header", () => {
    expect(
      githubLinkNext(
        '<https://api.github.com/user/repos?page=2>; rel="next", <https://api.github.com/user/repos?page=3>; rel="last"',
      ),
    ).toBe('https://api.github.com/user/repos?page=2');
    expect(githubLinkNext(null)).toBeNull();
    expect(githubLinkNext('')).toBeNull();
  });
});

describe('matchGithubRepository', () => {
  it('prefers the GitHub id identity key over a matching full_name', () => {
    const byKey = person({
      id: 'repo-id',
      type: 'repository',
      title: 'vitae',
      identity_keys: ['github:repo:99'],
      props: { full_name: 'old/vitae', github_id: 99 },
    });
    const byName = person({
      id: 'repo-name',
      type: 'repository',
      title: 'other',
      props: { full_name: 'new/vitae' },
    });
    expect(matchGithubRepository([byName, byKey], { id: 99, full_name: 'new/vitae' })?.id).toBe(
      'repo-id',
    );
  });
});
