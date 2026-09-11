import { describe, expect, it } from 'vitest';
import { parseFilterQuery } from '../algorithms/filter-grammar.js';
import { filterTasks, parseProductivityFilter } from './filters.js';
import type { TaskReadModel } from './read-models.js';

const inbox: TaskReadModel = {
  id: 't1',
  title: 'Renew passport',
  status: 'inbox',
  rev: 0,
  due: '2026-09-11',
  open: true,
};

const waiting: TaskReadModel = {
  id: 't2',
  title: 'Ask Sam',
  status: 'waiting',
  rev: 1,
  follow_up: '2026-09-03',
};

describe('parseProductivityFilter', () => {
  it('does not replace the existing graph parseFilterQuery', () => {
    const graph = parseFilterQuery('type:task after:2026-09-01 passport');
    expect(graph.clauses.some((clause) => clause.field === 'type')).toBe(true);
    const productivity = parseProductivityFilter('status:inbox due_before:2026-09-20 passport');
    expect(productivity.clauses.map((clause) => clause.field).sort()).toEqual(['due_before', 'status']);
    expect(productivity.text).toBe('passport');
  });

  it('rejects an invalid date instead of treating it as a clause', () => {
    const ast = parseProductivityFilter('due_before:2026-13-40');
    expect(ast.clauses).toEqual([]);
    expect(ast.invalid[0]?.reason).toBe('invalid_date');
  });
});

describe('filterTasks', () => {
  it('matches Vitae task read models', () => {
    expect(filterTasks([inbox, waiting], 'status:inbox').map((task) => task.id)).toEqual(['t1']);
    expect(filterTasks([inbox, waiting], 'is:waiting').map((task) => task.id)).toEqual(['t2']);
    expect(filterTasks([inbox, waiting], 'passport').map((task) => task.id)).toEqual(['t1']);
    expect(filterTasks([inbox, waiting], 'due_before:2026-09-20').map((task) => task.id)).toEqual(['t1']);
  });
});
