/**
 * The application status vocabulary and the machine over it.
 *
 * Two separate claims are under test here. The first is that the eight
 * statuses are declared once: the enum, the pipeline partition and the
 * outcomes must agree, because a ninth status added to one of them and
 * forgotten in the others is exactly the drift this collapse exists to stop.
 * The second is the transition machine — which moves are recordings of
 * something that happened, and which are mistakes.
 */
import { describe, expect, it } from 'vitest';
import {
  APPLICATION_OUTCOMES,
  APPLICATION_PIPELINE,
  APPLICATION_STATUSES,
  APPLICATION_STATUS_FLOW,
  applicationStatusSchema,
  canTransition,
  illegalTransitionMessage,
  type ApplicationStatus,
} from './application.js';

describe('the application status vocabulary', () => {
  it('is what the schema validates against, in the order the wire carries', () => {
    expect(applicationStatusSchema.options).toEqual([...APPLICATION_STATUSES]);
  });

  it('partitions exactly into the open pipeline and the three outcomes', () => {
    // Not "covers" — partitions. A status in both halves, or in neither,
    // means one of the three lists was edited alone.
    expect([...APPLICATION_PIPELINE, ...APPLICATION_OUTCOMES].sort()).toEqual(
      [...APPLICATION_STATUSES].sort(),
    );
    for (const stage of APPLICATION_PIPELINE) {
      expect(APPLICATION_OUTCOMES).not.toContain(stage);
    }
  });
});

describe('the application status machine', () => {
  it('lets an open application move to any later stage, not only the next one', () => {
    // A role with no recruiter screen goes from applied straight to an
    // interview. Refusing to record that would be refusing a fact.
    expect(canTransition('applied', 'screening')).toBe(true);
    expect(canTransition('applied', 'interview')).toBe(true);
    expect(canTransition('applied', 'offer')).toBe(true);
    expect(canTransition('draft', 'interview')).toBe(true);
  });

  it('refuses to walk an application backwards', () => {
    expect(canTransition('offer', 'interview')).toBe(false);
    expect(canTransition('interview', 'screening')).toBe(false);
    expect(canTransition('screening', 'applied')).toBe(false);
    expect(canTransition('applied', 'draft')).toBe(false);
  });

  it('closes from anywhere still open', () => {
    for (const stage of APPLICATION_PIPELINE) {
      for (const outcome of APPLICATION_OUTCOMES) {
        expect(canTransition(stage, outcome)).toBe(true);
      }
    }
  });

  it('treats every outcome as the end of the record', () => {
    for (const outcome of APPLICATION_OUTCOMES) {
      expect(APPLICATION_STATUS_FLOW[outcome]).toEqual([]);
      for (const status of APPLICATION_STATUSES) {
        if (status === outcome) continue;
        expect(canTransition(outcome, status)).toBe(false);
      }
    }
  });

  it('allows a status to be re-saved as itself', () => {
    // Editing the deadline on an application in interviews resubmits the
    // whole record, status included. That is not a transition.
    for (const status of APPLICATION_STATUSES) {
      expect(canTransition(status, status)).toBe(true);
    }
  });

  it('agrees with itself: the flow map and the predicate are one machine', () => {
    for (const from of APPLICATION_STATUSES) {
      for (const to of APPLICATION_STATUSES) {
        const listed = APPLICATION_STATUS_FLOW[from].includes(to);
        expect(canTransition(from, to)).toBe(listed || from === to);
      }
    }
  });

  it('names a destination for every status the enum can hold', () => {
    const mapped = Object.keys(APPLICATION_STATUS_FLOW) as ApplicationStatus[];
    expect(mapped.sort()).toEqual([...APPLICATION_STATUSES].sort());
  });
});

describe('the sentence a refused move gets', () => {
  it('names both ends of the move an operator just tried to make', () => {
    expect(illegalTransitionMessage('rejected', 'screening')).toContain(
      'An application that was rejected cannot move to screening',
    );
    expect(illegalTransitionMessage('interview', 'applied')).toContain(
      'An application at interview cannot move back to applied',
    );
  });

  it('states the rule that refused it, so the error explains itself', () => {
    expect(illegalTransitionMessage('accepted', 'offer')).toContain('An outcome closes the record');
    expect(illegalTransitionMessage('offer', 'draft')).toContain('The pipeline only runs forwards');
  });

  it('points at the correction, because a guard with no way out traps real data', () => {
    for (const from of APPLICATION_STATUSES) {
      for (const to of APPLICATION_STATUSES) {
        if (canTransition(from, to)) continue;
        expect(illegalTransitionMessage(from, to)).toContain(
          `If ${from} was recorded by mistake, correct the status instead of moving it.`,
        );
      }
    }
  });
});
