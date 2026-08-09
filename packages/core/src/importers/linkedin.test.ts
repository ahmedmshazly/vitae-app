import { describe, expect, it } from 'vitest';
import {
  parseLinkedInConnections,
  parseLinkedInDate,
  parseLinkedInEducation,
  parseLinkedInPositions,
  parseLinkedInSkills,
} from './linkedin.js';

describe('parseLinkedInDate', () => {
  it('handles the formats LinkedIn has shipped', () => {
    expect(parseLinkedInDate('Jan 2023')).toBe('2023-01-01');
    expect(parseLinkedInDate('2023-06')).toBe('2023-06-01');
    expect(parseLinkedInDate('2023-06-15')).toBe('2023-06-15');
    expect(parseLinkedInDate('2023')).toBe('2023-01-01');
    expect(parseLinkedInDate('')).toBeNull();
    expect(parseLinkedInDate('ongoing')).toBeNull();
  });
});

describe('parseLinkedInPositions', () => {
  it('is header-tolerant across export versions', () => {
    const v1 = 'Company Name,Title,Description,Location,Started On,Finished On\nNile Robotics,Senior MLE,"Built perception, shipped it",Cairo,Jan 2023,';
    const [p] = parseLinkedInPositions(v1);
    expect(p).toMatchObject({ company: 'Nile Robotics', title: 'Senior MLE', location: 'Cairo', start: '2023-01-01', end: null });
  });
});

describe('parseLinkedInEducation', () => {
  it('parses schools with degrees', () => {
    const csv = 'School Name,Start Date,End Date,Degree Name\nCairo University,2016,2020,B.Sc CS';
    expect(parseLinkedInEducation(csv)[0]).toMatchObject({ school: 'Cairo University', degree: 'B.Sc CS', start: '2016-01-01', end: '2020-01-01' });
  });
});

describe('parseLinkedInSkills', () => {
  it('parses the one-column skills file', () => {
    expect(parseLinkedInSkills('Name\nReinforcement Learning\nKubernetes')).toEqual(['Reinforcement Learning', 'Kubernetes']);
  });
});

describe('parseLinkedInConnections', () => {
  it('skips the notes preamble and lowercases emails', () => {
    const csv = `Notes:\n"When exporting your connection data, you may be missing emails."\n\nFirst Name,Last Name,URL,Email Address,Company,Position,Connected On\nSarah,Chen,https://linkedin.com/in/sc,Sarah.Chen@nile.com,Nile Robotics,Staff SWE,12 Mar 2024`;
    const [c] = parseLinkedInConnections(csv);
    expect(c).toMatchObject({
      fullName: 'Sarah Chen',
      email: 'sarah.chen@nile.com',
      company: 'Nile Robotics',
      position: 'Staff SWE',
    });
  });
});
