import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithApp } from '../test/render.js';
import { PersonDetails } from './PersonDetails.js';

describe('Person contact details', () => {
  it('shows canonical arrays and unique legacy values with actionable contact links', () => {
    renderWithApp(
      <PersonDetails
        props={{
          emails: ['ada@example.com', 'research@example.com'],
          email: 'ada@example.com',
          phones: ['+20 (100) 123-4567'],
          phone: '020 7946 0123',
        }}
        topics={['Research', 'Research']}
      />,
    );
    expect(
      within(screen.getByRole('list', { name: 'Email addresses' })).getAllByRole('listitem'),
    ).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'research@example.com' })).toHaveAttribute(
      'href',
      'mailto:research%40example.com',
    );
    expect(screen.getByRole('link', { name: '+20 (100) 123-4567' })).toHaveAttribute(
      'href',
      'tel:+201001234567',
    );
    expect(
      within(screen.getByRole('list', { name: 'Phone numbers' })).getAllByRole('listitem'),
    ).toHaveLength(2);
    expect(screen.getAllByText('Research')).toHaveLength(1);
  });
  it('does not activate unsafe URLs, malformed contact data or infer a missing birth year', () => {
    renderWithApp(
      <PersonDetails
        props={{
          emails: [null, 'bad\naddress'],
          phones: ['Ask reception'],
          birthday: '2000-02-29',
          year_known: false,
          socials: { site: 'javascript:alert(1)', github: 'https://github.com/example' },
          do_not_contact: true,
        }}
        topics={[]}
      />,
    );
    expect(screen.getByText(/February 29/)).not.toHaveTextContent('2000');
    expect(screen.getByText('Do not contact')).toBeVisible();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /GitHub/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(screen.getByText('Website: javascript:alert(1)')).toBeVisible();
  });
  it('distinguishes missing contact details from unavailable relationship topics', () => {
    renderWithApp(<PersonDetails props={{}} topics={[]} topicsUnavailable />);
    expect(screen.getAllByText('Not recorded')).toHaveLength(3);
    expect(screen.getByText('Unavailable')).toBeVisible();
  });
});
