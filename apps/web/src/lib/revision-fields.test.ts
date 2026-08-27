import { describe, expect, it } from 'vitest';
import { fieldLabel } from './revision-fields.js';

describe('fieldLabel', () => {
  it('names the field that moved, without the column it lives in', () => {
    expect(fieldLabel('props.status')).toBe('status');
    expect(fieldLabel('props.next_step_date')).toBe('next_step_date');
  });

  it('leaves a top-level field alone', () => {
    expect(fieldLabel('title')).toBe('title');
    expect(fieldLabel('deleted_at')).toBe('deleted_at');
  });

  it('leaves a bare props key alone, because that revision knows only that much', () => {
    expect(fieldLabel('props')).toBe('props');
  });

  it('drops only the first segment, so a field with a dot keeps its shape', () => {
    expect(fieldLabel('props.line_model.leading')).toBe('line_model.leading');
  });
});
