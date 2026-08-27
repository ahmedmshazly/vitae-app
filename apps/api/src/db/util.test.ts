/**
 * The revision diff.
 *
 * Every mutation writes one of these in the same transaction as the write, and
 * the Ledger reads them back as "what changed since you last looked". A diff
 * that only ever says `props` answers that question with the name of the
 * column rather than the name of the field, so the tests below pin the one
 * level of depth that makes the feed readable, and pin the places where going
 * deeper would start inventing structure that is not there.
 */
import { describe, expect, it } from 'vitest';
import { shallowDiff, stripUndefined } from './util.js';

describe('shallowDiff', () => {
  it('names the changed top-level fields with their before and after', () => {
    expect(shallowDiff({ title: 'Old', rev: 1 }, { title: 'New', rev: 2 })).toEqual({
      title: { from: 'Old', to: 'New' },
      rev: { from: 1, to: 2 },
    });
  });

  it('says nothing about fields that did not move', () => {
    expect(shallowDiff({ title: 'Same', type: 'person' }, { title: 'Same', type: 'person' })).toEqual(
      {},
    );
  });

  it('compares by value, not by reference', () => {
    // Props are read back out of JSONB, so the two sides are never the same
    // object even when nothing changed. Identity comparison would mark every
    // field of every record dirty on every write.
    expect(shallowDiff({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toEqual({});
  });

  it('opens props one level, so the field that moved is the one named', () => {
    // The whole point. Before this, a status move and a note edit both wrote a
    // single entry called `props`, and the Ledger showed the same chip for
    // both while hiding which of a dozen fields had actually changed.
    const before = { rev: 1, props: { status: 'applied', role_title: 'ML Engineer' } };
    const after = { rev: 2, props: { status: 'interview', role_title: 'ML Engineer' } };
    expect(shallowDiff(before, after)).toEqual({
      rev: { from: 1, to: 2 },
      'props.status': { from: 'applied', to: 'interview' },
    });
  });

  it('records a field appearing in props and a field leaving it', () => {
    const before = { props: { status: 'offer' } };
    const after = { props: { status: 'offer', salary_range: '120-140k' } };
    expect(shallowDiff(before, after)).toEqual({
      'props.salary_range': { from: undefined, to: '120-140k' },
    });
    expect(shallowDiff(after, before)).toEqual({
      'props.salary_range': { from: '120-140k', to: undefined },
    });
  });

  it('stops at one level, and does not walk into a nested object', () => {
    // A nested value is reported whole. Walking arbitrarily deep would turn one
    // edit of a props object into a dozen entries and make the feed unreadable,
    // and it would key entries on array indices, which are not stable names.
    const before = { props: { line_model: { lines_per_page: 44, leading: 12 } } };
    const after = { props: { line_model: { lines_per_page: 46, leading: 12 } } };
    expect(shallowDiff(before, after)).toEqual({
      'props.line_model': {
        from: { lines_per_page: 44, leading: 12 },
        to: { lines_per_page: 46, leading: 12 },
      },
    });
  });

  it('keeps props whole when one side has no props object to open', () => {
    // A record whose props are absent on one side has no fields to pair up, so
    // naming individual keys would imply a comparison that never happened.
    expect(shallowDiff({ props: undefined }, { props: { status: 'draft' } })).toEqual({
      props: { from: undefined, to: { status: 'draft' } },
    });
    expect(shallowDiff({ props: 'not-an-object' }, { props: { status: 'draft' } })).toEqual({
      props: { from: 'not-an-object', to: { status: 'draft' } },
    });
  });

  it('leaves an unchanged props object out entirely rather than opening it', () => {
    expect(shallowDiff({ props: { status: 'draft' } }, { props: { status: 'draft' } })).toEqual({});
  });
});

describe('stripUndefined', () => {
  it('drops undefined values and keeps null, which is a recorded answer', () => {
    expect(stripUndefined({ a: 1, b: undefined, c: null })).toEqual({ a: 1, c: null });
  });
});
