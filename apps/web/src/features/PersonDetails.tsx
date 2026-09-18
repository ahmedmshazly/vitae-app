import { Chip, Section } from '@vitae/ui';

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const values = (canonical: unknown, legacy: unknown) => [
  ...new Set([...(Array.isArray(canonical) ? canonical : []), legacy].map(text).filter(Boolean)),
];

function webHref(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Canonical contact arrays plus retained legacy values; never discard stored contact details. */
export function PersonDetails({
  props,
  topics,
  topicsUnavailable = false,
  topicsLoading = false,
}: {
  props: Record<string, unknown>;
  topics: string[];
  topicsUnavailable?: boolean;
  topicsLoading?: boolean;
}) {
  const emails = values(props.emails, props.email);
  const phones = values(props.phones, props.phone);
  const socials =
    props.socials && typeof props.socials === 'object'
      ? (props.socials as Record<string, unknown>)
      : {};
  const links = Object.entries({ linkedin: 'LinkedIn', github: 'GitHub', x: 'X', site: 'Website' })
    .map(([key, label]) => ({ label, value: text(socials[key]) }))
    .filter((item) => item.value);
  const birthday = text(props.birthday);
  const birthdayDate = /^\d{4}-\d{2}-\d{2}$/.test(birthday)
    ? new Date(`${birthday}T12:00:00Z`)
    : null;
  const birthdayLabel =
    birthdayDate && Number.isFinite(birthdayDate.getTime())
      ? new Intl.DateTimeFormat('en', {
          month: 'long',
          day: 'numeric',
          ...(props.year_known === false ? {} : { year: 'numeric' as const }),
          timeZone: 'UTC',
        }).format(birthdayDate)
      : birthday;
  return (
    <Section title="Details">
      {props.do_not_contact === true && (
        <p className="person-details__preference">
          <strong>Do not contact</strong>
          <br />
          This person’s saved contact preference. Past interactions can still be recorded.
        </p>
      )}
      <dl className="person-details">
        <div>
          <dt>Email</dt>
          <dd>
            {emails.length ? (
              <ul aria-label="Email addresses">
                {emails.map((email) => (
                  <li key={email}>
                    {/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? (
                      <a href={`mailto:${encodeURIComponent(email)}`}>{email}</a>
                    ) : (
                      email
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              'Not recorded'
            )}
          </dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>
            {phones.length ? (
              <ul aria-label="Phone numbers">
                {phones.map((phone) => (
                  <li key={phone}>
                    {/^\+?[\d\s().-]+$/.test(phone) && /\d/.test(phone) ? (
                      <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a>
                    ) : (
                      phone
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              'Not recorded'
            )}
          </dd>
        </div>
        <div>
          <dt>City</dt>
          <dd>{text(props.city) || 'Not recorded'}</dd>
        </div>
        {text(props.timezone) && (
          <div>
            <dt>Time zone</dt>
            <dd>{text(props.timezone)}</dd>
          </div>
        )}
        {text(props.pronouns) && (
          <div>
            <dt>Pronouns</dt>
            <dd>{text(props.pronouns)}</dd>
          </div>
        )}
        {birthdayLabel && (
          <div>
            <dt>Birthday</dt>
            <dd>
              {birthdayLabel}
              {props.year_known === false && (
                <span className="text-muted"> · year not recorded</span>
              )}
            </dd>
          </div>
        )}
        {links.length > 0 && (
          <div>
            <dt>Profiles</dt>
            <dd>
              <ul aria-label="Online profiles">
                {links.map(({ label, value }) => (
                  <li key={label}>
                    {webHref(value) ? (
                      <a href={webHref(value)} target="_blank" rel="noopener noreferrer">
                        {label}
                        <span className="u-visually-hidden"> (opens in a new tab)</span>
                      </a>
                    ) : (
                      <span>
                        {label}: {value}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        <div>
          <dt>Topics</dt>
          <dd>
            {topicsLoading ? (
              'Loading topics…'
            ) : topicsUnavailable ? (
              'Unavailable'
            ) : topics.length ? (
              <ul className="person-details__topics" aria-label="Relationship topics">
                {[...new Set(topics)].map((topic) => (
                  <li key={topic}>
                    <Chip>{topic}</Chip>
                  </li>
                ))}
              </ul>
            ) : (
              'None recorded'
            )}
          </dd>
        </div>
      </dl>
    </Section>
  );
}
