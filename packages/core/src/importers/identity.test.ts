import { describe, expect, it } from 'vitest';
import { identityKey } from '../schema/envelope.js';
import {
  asanaTaskKey,
  bookmarkUrlKey,
  contactEmailKey,
  icsEventKey,
  githubRepoKey,
  identityKeyFor,
  linkedinProfileKey,
  notionPageKey,
  taskProjectKey,
  tasksCsvTaskKey,
  tasksJsonTaskKey,
  thingsTaskKey,
  ticktickTaskKey,
  todoistTaskKey,
  trelloCardKey,
  vcardUidKey,
} from './identity.js';

/** Every key a parser emits has to survive the schema that persists it. */
function isStorable(key: string): boolean {
  return identityKey.safeParse(key).success;
}

describe('identityKeyFor', () => {
  it('lowercases the whole key so one record cannot fork on casing', () => {
    expect(identityKeyFor('VCard', 'Person', 'ABC-123')).toBe('vcard:person:abc-123');
  });

  it('refuses a key with no value, since that identifies every row at once', () => {
    expect(identityKeyFor('vcard', 'person', '')).toBeNull();
    expect(identityKeyFor('vcard', 'person', '   ')).toBeNull();
    expect(identityKeyFor('vcard', 'person', null)).toBeNull();
  });

  it('refuses a value with whitespace in it rather than mangling it', () => {
    expect(identityKeyFor('vcard', 'person', 'two words')).toBeNull();
  });

  it('refuses a key past the length the envelope stores', () => {
    expect(identityKeyFor('vcard', 'person', 'x'.repeat(200))).toBeNull();
  });

  it('emits keys the envelope accepts', () => {
    expect(isStorable(identityKeyFor('vcard', 'person', 'abc-123')!)).toBe(true);
  });
});

describe('contactEmailKey', () => {
  it('is neutral about which app exported the address book', () => {
    // The same address from a vCard, a Google CSV and a LinkedIn export is one
    // person. Naming the exporter in the key would fork them into three.
    expect(contactEmailKey('Sarah.Chen@Nile-Robotics.com')).toBe(
      'contact:email:sarah.chen@nile-robotics.com',
    );
  });

  it('refuses the junk address books carry, which would never be stored anyway', () => {
    expect(contactEmailKey('john at work')).toBeNull();
    expect(contactEmailKey('-')).toBeNull();
    expect(contactEmailKey('')).toBeNull();
    expect(contactEmailKey(undefined)).toBeNull();
  });

  it('emits a key the envelope accepts', () => {
    expect(isStorable(contactEmailKey('a@b.test')!)).toBe(true);
  });
});

describe('vcardUidKey', () => {
  it('keeps a URN-shaped UID whole, colons included', () => {
    const key = vcardUidKey('urn:uuid:6d6b1e34-0e2e-4c2f-9f0a-1f7f0b1f2a3b');
    expect(key).toBe('vcard:person:urn:uuid:6d6b1e34-0e2e-4c2f-9f0a-1f7f0b1f2a3b');
    expect(isStorable(key!)).toBe(true);
  });

  it('yields nothing for a card that states no UID', () => {
    expect(vcardUidKey(null)).toBeNull();
  });
});

describe('icsEventKey', () => {
  it('uses the UID RFC 5545 makes the event global identity', () => {
    expect(icsEventKey('abc-123@calendar.test')).toBe('ics:event:abc-123@calendar.test');
  });
});

describe('linkedinProfileKey', () => {
  it('matches the key an Aperture bundle carries for the same profile', () => {
    // fixtures/vitae-bundle.golden.json stores linkedin:person:jane-smith, so a
    // Connections.csv row for that profile has to land on the same record.
    expect(linkedinProfileKey('https://www.linkedin.com/in/jane-smith/')).toBe(
      'linkedin:person:jane-smith',
    );
  });

  it('ignores query strings and trailing segments around the slug', () => {
    expect(linkedinProfileKey('https://linkedin.com/in/sc?trk=contacts')).toBe(
      'linkedin:person:sc',
    );
    expect(linkedinProfileKey('linkedin.com/in/sc/detail/contact-info')).toBe(
      'linkedin:person:sc',
    );
  });

  it('yields nothing for a LinkedIn URL that names no person', () => {
    expect(linkedinProfileKey('https://www.linkedin.com/company/acme')).toBeNull();
    expect(linkedinProfileKey('')).toBeNull();
  });
});

describe('bookmarkUrlKey', () => {
  it('treats a bare trailing slash and a fragment as the same page', () => {
    expect(bookmarkUrlKey('https://x.test/')).toBe('bookmark:link:https://x.test');
    expect(bookmarkUrlKey('https://x.test/a#section')).toBe('bookmark:link:https://x.test/a');
  });

  it('keeps the query, which routinely selects which page you saved', () => {
    expect(bookmarkUrlKey('https://x.test/a?id=7')).toBe('bookmark:link:https://x.test/a?id=7');
  });

  it('keeps www as part of the host instead of guessing they are one site', () => {
    expect(bookmarkUrlKey('https://www.x.test/a')).not.toBe(bookmarkUrlKey('https://x.test/a'));
  });

  it('yields nothing for a URL too long to key, rather than a colliding prefix', () => {
    expect(bookmarkUrlKey(`https://x.test/${'a'.repeat(300)}`)).toBeNull();
  });

  it('yields nothing for something that is not a URL', () => {
    expect(bookmarkUrlKey('not a url')).toBeNull();
  });

  it('emits a key the envelope accepts', () => {
    expect(isStorable(bookmarkUrlKey('https://arxiv.org/abs/1706.03762')!)).toBe(true);
  });
});

describe('githubRepoKey', () => {
  it('keys a repository by GitHub numeric id so a rename cannot fork it', () => {
    expect(githubRepoKey(123456)).toBe('github:repo:123456');
    expect(githubRepoKey('123456')).toBe('github:repo:123456');
    expect(isStorable(githubRepoKey(123456)!)).toBe(true);
  });

  it("yields nothing for a value that is not GitHub's id", () => {
    expect(githubRepoKey('owner/name')).toBeNull();
    expect(githubRepoKey('')).toBeNull();
    expect(githubRepoKey(null)).toBeNull();
  });
});

describe('task-file identity keys', () => {
  it('uses the source-stated shapes the Import Hub kinds converge on', () => {
    expect(todoistTaskKey('123')).toBe('todoist:task:123');
    expect(thingsTaskKey('6d6b1e34-0e2e-4c2f-9f0a-1f7f0b1f2a3b')).toBe(
      'things:task:6d6b1e34-0e2e-4c2f-9f0a-1f7f0b1f2a3b',
    );
    expect(ticktickTaskKey('t1')).toBe('ticktick:task:t1');
    expect(trelloCardKey('card1')).toBe('trello:card:card1');
    expect(asanaTaskKey('123')).toBe('asana:task:123');
    expect(notionPageKey('page-1')).toBe('notion:page:page-1');
    expect(tasksJsonTaskKey('i1')).toBe('tasks_json:task:i1');
    expect(tasksCsvTaskKey('i1')).toBe('tasks_csv:task:i1');
    expect(taskProjectKey('trello', 'board1')).toBe('project:trello:board1');
  });

  it('refuses a title, so two tasks that share a name cannot fork into one', () => {
    expect(todoistTaskKey('Renew passport')).toBeNull();
    expect(taskProjectKey('todoist', 'Go Shopping')).toBeNull();
  });

  it('emits keys the envelope accepts', () => {
    expect(isStorable(asanaTaskKey('1201234567890')!)).toBe(true);
    expect(isStorable(taskProjectKey('trello', 'board1')!)).toBe(true);
  });
});
