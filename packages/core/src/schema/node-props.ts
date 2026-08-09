/**
 * Per-type `props` schemas (SRS §4.3). Each node type validates its `props`
 * object against one of these. All 28 types are fully modelled; the long-tail
 * types (SRS §4.3.22-28) use `.passthrough()` with all-optional fields so
 * legacy/imported docs with extra or sparse keys keep round-tripping.
 */
import { z } from 'zod';
import { INTERACTION_KINDS, type NodeType } from '../types.js';
import { isoDate, isoDateTime } from './envelope.js';

const urlish = z.string().url().or(z.literal('')).optional();

// ── Career core ──────────────────────────────────────────────────────────────

export const personProps = z.object({
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  emails: z.array(z.string().email()).default([]),
  phones: z.array(z.string()).default([]),
  birthday: isoDate.optional(),
  year_known: z.boolean().optional(),
  pronouns: z.string().optional(),
  headline: z.string().optional(),
  socials: z
    .object({
      linkedin: urlish,
      github: urlish,
      x: urlish,
      site: urlish,
    })
    .partial()
    .default({}),
  city: z.string().optional(),
  timezone: z.string().optional(),
  is_self: z.boolean().optional(),
  /**
   * The reserved owner for records that carry no subject edge. Ownership has to
   * be a total function or "not mine" and "nobody said" collapse into the same
   * answer, which is how other people's records reached the résumé. Attributing
   * the orphans to an explicit placeholder keeps them visible and reassignable
   * instead of silently counting as the owner's.
   */
  is_placeholder: z.boolean().optional(),
  do_not_contact: z.boolean().optional(),
});

export const organizationProps = z.object({
  kind: z.enum(['company', 'university', 'community', 'nonprofit', 'team']).optional(),
  domain: z.string().optional(),
  website: urlish,
  industry: z.string().optional(),
  size_hint: z.string().optional(),
  hq_city: z.string().optional(),
  linkedin_url: urlish,
});

export const roleProps = z.object({
  employment_type: z.enum([
    'full_time',
    'part_time',
    'intern',
    'contract',
    'freelance',
    'volunteer',
  ]),
  team: z.string().optional(),
  seniority: z
    .enum(['intern', 'junior', 'mid', 'senior', 'staff', 'lead', 'principal', 'manager', 'director'])
    .optional(),
  location_mode: z.enum(['onsite', 'hybrid', 'remote']).optional(),
  city: z.string().optional(),
  tech_stack: z.array(z.string()).default([]),
  reason_left: z.string().optional(),
  comp: z
    .object({ currency: z.string(), base: z.number(), notes: z.string().optional() })
    .partial()
    .optional(),
});

export const projectProps = z.object({
  kind: z.enum(['work', 'personal', 'research', 'oss']).optional(),
  my_role: z.string().optional(),
  status: z.enum(['active', 'paused', 'done', 'archived']).optional(),
  url: urlish,
  outcome: z.string().optional(),
});

export const repositoryProps = z.object({
  host: z.enum(['github', 'gitlab', 'self']).default('github'),
  full_name: z.string(),
  url: urlish,
  primary_language: z.string().optional(),
  languages: z.record(z.string(), z.number()).default({}),
  stars: z.number().int().optional(),
  forks: z.number().int().optional(),
  is_private: z.boolean().optional(),
  description: z.string().optional(),
  topics: z.array(z.string()).default([]),
  default_branch: z.string().optional(),
  last_synced_at: isoDateTime.optional(),
});

export const skillProps = z.object({
  // `language` is a programming language; `spoken_language` is a natural one.
  // LinkedIn reports both and they are not interchangeable on a résumé.
  category: z
    .enum([
      'language',
      'spoken_language',
      'framework',
      'tool',
      'platform',
      'domain',
      'method',
      'soft',
    ])
    .optional(),
  aliases: z.array(z.string()).default([]),
  proficiency: z.enum(['learning', 'working', 'proficient', 'expert']).optional(),
  years_estimate: z.number().optional(),
  last_used: isoDate.optional(),
});

export const educationProps = z.object({
  degree: z.string().optional(),
  field_of_study: z.string().optional(),
  gpa: z.number().optional(),
  honors: z.string().optional(),
  coursework: z.array(z.string()).default([]),
  thesis_title: z.string().optional(),
  activities: z.string().optional(),
});

export const certificationProps = z.object({
  credential_id: z.string().optional(),
  credential_url: urlish,
  issued_on: isoDate.optional(),
  expires_on: isoDate.optional(),
  status: z.enum(['valid', 'expired']).optional(),
});

export const courseProps = z
  .object({
    provider: z.string().optional(), // Coursera, Udacity, MIT OCW…
    platform: z.string().optional(),
    format: z.enum(['self_paced', 'cohort', 'in_person', 'bootcamp']).optional(),
    hours: z.number().nonnegative().optional(),
    completion: z.number().int().min(0).max(100).optional(), // percent
    course_status: z.enum(['enrolled', 'in_progress', 'completed', 'dropped']).optional(),
    started_on: isoDate.optional(),
    completed_on: isoDate.optional(),
    credential_url: urlish,
    // Free-text mirror for résumé text; the real links are USES_SKILL edges.
    skills_gained: z.array(z.string()).default([]),
  })
  .passthrough();

export const referenceProps = z
  .object({
    relationship: z.string().optional(), // "Manager at Goodera"
    reference_type: z.enum(['professional', 'academic', 'personal', 'character']).optional(),
    blurb: z.string().optional(), // the testimonial text
    strength: z.number().int().min(1).max(5).optional(),
    contact_email: z.string().email().or(z.literal('')).optional(),
    contact_phone: z.string().optional(),
    can_contact: z.boolean().optional(),
    context: z.string().optional(), // where/when they worked with you
    // The person is linked via a RECOMMENDS edge.
  })
  .passthrough();

export const jobPostingProps = z
  .object({
    company: z.string().optional(), // denormalized; the org is linked via an edge
    role_title: z.string().optional(),
    location: z.string().optional(),
    location_mode: z.enum(['onsite', 'hybrid', 'remote']).optional(),
    employment_type: z
      .enum(['full_time', 'part_time', 'intern', 'contract', 'freelance'])
      .optional(),
    url: urlish,
    jd_text: z.string().optional(), // pasted JD → seeds the résumé Tailor
    salary_range: z.string().optional(),
    deadline: isoDate.optional(),
    posting_status: z
      .enum(['watching', 'interested', 'applied', 'closed', 'passed'])
      .optional(),
    source: z.string().optional(), // LinkedIn, referral, careers page…
  })
  .passthrough();

export const applicationProps = z
  .object({
    role_title: z.string(),
    status: z.enum([
      'draft',
      'applied',
      'screening',
      'interview',
      'offer',
      'rejected',
      'withdrawn',
      'accepted',
    ]),
    applied_on: isoDate.optional(),
    deadline: isoDate.optional(),
    next_step: z.string().optional(),
    next_step_date: isoDate.optional(),
    channel: z.enum(['referral', 'cold', 'recruiter', 'inbound']).optional(),
    location_mode: z.enum(['onsite', 'hybrid', 'remote']).optional(),
    salary_range: z.string().optional(),
    job_url: urlish,
    target_id: z.string().optional(),
    resume_id: z.string().optional(),
  })
  .passthrough();

export const interviewProps = z
  .object({
    round: z.string().optional(), // "Recruiter screen", "System design", "Onsite"
    stage_no: z.number().int().positive().optional(),
    format: z.enum(['phone', 'video', 'onsite', 'take_home', 'panel']).optional(),
    scheduled_at: isoDateTime.optional(),
    duration_min: z.number().int().optional(),
    // Free-text mirror; the real interviewers are WITH edges to person nodes.
    interviewers: z.array(z.string()).default([]),
    prep_notes: z.string().optional(),
    outcome: z.enum(['scheduled', 'passed', 'failed', 'pending', 'cancelled']).optional(),
    reflection: z.string().optional(),
  })
  .passthrough();

// ── Life core ────────────────────────────────────────────────────────────────

export const interactionProps = z.object({
  kind: z.enum(INTERACTION_KINDS),
  occurred_at: isoDateTime,
  duration_min: z.number().int().optional(),
  initiated_by: z.enum(['me', 'them']).optional(),
  sentiment: z.enum(['great', 'good', 'neutral', 'tense']).optional(),
  note: z.string().optional(),
  channel: z.string().optional(),
  ask_kind: z.string().nullable().optional(),
  talking_points: z.array(z.string()).default([]),
  follow_ups: z.array(z.object({ what: z.string(), due: isoDate.optional() })).default([]),
});

export const eventProps = z.object({
  kind: z.enum([
    'conference',
    'meetup',
    'hackathon',
    'party',
    'wedding',
    'class',
    'appointment',
  ]),
  venue: z.string().optional(),
  city: z.string().optional(),
  url: urlish,
  starts_at: isoDateTime.optional(),
  ends_at: isoDateTime.optional(),
  attended: z.boolean().optional(),
});

export const taskProps = z.object({
  status: z.enum(['inbox', 'next', 'doing', 'waiting', 'done', 'dropped']),
  due: isoDate.optional(),
  scheduled: isoDate.optional(),
  priority: z.enum(['p1', 'p2', 'p3', 'p4']).optional(),
  effort_min: z.number().int().optional(),
  completed_at: isoDateTime.optional(),
});

export const ideaProps = z.object({
  status: z.enum(['spark', 'explored', 'building', 'shipped', 'discarded']),
  one_liner: z.string().optional(),
  problem: z.string().optional(),
  excitement: z.number().int().min(1).max(5).optional(),
  effort_guess: z.enum(['hours', 'days', 'weeks', 'months']).optional(),
  next_experiment: z.string().optional(),
});

export const linkProps = z.object({
  url: z.string().url(),
  domain: z.string().optional(),
  saved_reason: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  favicon_key: z.string().optional(),
  read_status: z.enum(['unread', 'read', 'reference']).default('unread'),
});

export const journalEntryProps = z.object({
  entry_date: isoDate,
  mood: z.number().int().min(1).max(5).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  gratitude: z.string().optional(),
});

export const documentProps = z.object({
  doc_kind: z.enum([
    'contract',
    'transcript',
    'certificate',
    'statement',
    'paper',
    'manual',
    'other',
  ]),
  issued_on: isoDate.optional(),
  expires_on: isoDate.optional(),
  extracted_text: z.string().optional(),
});

// ── Career long-tail (SRS §4.3.9-11) ────────────────────────────────────────
// All-optional + .passthrough(): stricter only for well-formed new data, never
// rejecting or stripping sparse/imported docs.

const money = z
  .object({ amount: z.number(), currency: z.string() })
  .partial()
  .optional();

export const publicationProps = z
  .object({
    pub_type: z
      .enum(['journal', 'conference', 'workshop', 'preprint', 'blog', 'thesis', 'patent'])
      .optional(),
    venue: z.string().optional(),
    doi: z.string().optional(),
    url: urlish,
    authors: z.array(z.string()).default([]),
    author_position: z.number().int().positive().optional(),
    my_contribution: z.string().optional(),
    published_on: isoDate.optional(),
    citation_count: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export const talkProps = z
  .object({
    talk_type: z
      .enum(['conference', 'meetup', 'guest_lecture', 'podcast', 'webinar', 'workshop'])
      .optional(),
    event_name: z.string().optional(),
    venue: z.string().optional(),
    city: z.string().optional(),
    slides_url: urlish,
    video_url: urlish,
    audience_size: z.number().int().nonnegative().optional(),
    delivered_on: isoDate.optional(),
    co_presenters: z.array(z.string()).default([]),
  })
  .passthrough();

export const awardProps = z
  .object({
    level: z.enum(['team', 'org', 'national', 'international']).optional(),
    award_for: z.string().optional(),
    awarded_on: isoDate.optional(),
    prize: z.string().optional(),
    url: urlish,
  })
  .passthrough();

// ── Life long-tail (SRS §4.3.16-17) ─────────────────────────────────────────

export const goalProps = z
  .object({
    horizon: z.enum(['month', 'quarter', 'year', 'life']).optional(),
    // Named goal_status to avoid colliding with the envelope's free-form status.
    goal_status: z.enum(['active', 'paused', 'achieved', 'abandoned']).optional(),
    success_criteria: z.string().optional(),
    target_date: isoDate.optional(),
    motivation: z.string().optional(),
    key_results: z
      .array(
        z.object({
          name: z.string(),
          target: z.number().optional(),
          current: z.number().optional(),
          unit: z.string().optional(),
          done: z.boolean().optional(),
        }),
      )
      .default([]),
  })
  .passthrough();

export const habitProps = z
  .object({
    cadence: z.enum(['daily', 'weekly', 'monthly']).optional(),
    target_per_period: z.number().int().positive().optional(),
    schedule_days: z.array(z.number().int().min(0).max(6)).default([]),
    active: z.boolean().optional(),
    started_on: isoDate.optional(),
    cue: z.string().optional(),
    why: z.string().optional(),
  })
  .passthrough();

// ── Proposed long-tail (SRS §4.3.22-28) ─────────────────────────────────────

export const locationProps = z
  .object({
    kind: z.enum(['country', 'region', 'city', 'venue', 'address']).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    address: z.string().optional(),
    country_code: z.string().length(2).optional(),
    place_ref: z.string().optional(),
  })
  .passthrough();

export const tripProps = z
  .object({
    purpose: z.enum(['work', 'conference', 'vacation', 'family', 'relocation']).optional(),
    destination: z.string().optional(),
    highlights: z.string().optional(),
    transport: z.array(z.string()).default([]),
    budget: money,
  })
  .passthrough();

export const mediaItemProps = z
  .object({
    media_kind: z
      .enum(['book', 'paper', 'article', 'course', 'film', 'podcast', 'video'])
      .optional(),
    creator: z.string().optional(),
    url: urlish,
    isbn: z.string().optional(),
    doi: z.string().optional(),
    platform: z.string().optional(),
    consumption_status: z.enum(['want', 'in_progress', 'done', 'abandoned']).optional(),
    started_on: isoDate.optional(),
    finished_on: isoDate.optional(),
    rating: z.number().int().min(1).max(5).optional(),
    key_takeaways: z.string().optional(),
  })
  .passthrough();

/**
 * Social/professional content, a feed post, a long-form article, a comment on
 * one, or a reshare. A comment is a `post` with `post_kind: 'comment'` and an
 * ABOUT edge to its parent, so threads are ordinary graph structure.
 *
 * Engagement counts are a snapshot at capture time, not a live figure.
 */
export const postProps = z
  .object({
    post_kind: z.enum(['post', 'article', 'comment', 'share']).default('post'),
    text: z.string().optional(),
    url: urlish,
    posted_at: isoDateTime.optional(),
    lang: z.string().max(16).optional(),
    engagement: z
      .object({
        likes: z.number().int().nonnegative().optional(),
        comments: z.number().int().nonnegative().optional(),
        reposts: z.number().int().nonnegative().optional(),
        views: z.number().int().nonnegative().optional(),
      })
      .default({}),
    media: z.array(z.string()).default([]),
  })
  .passthrough();

export const highlightProps = z
  .object({
    excerpt: z.string().max(500).optional(),
    loc_ref: z.string().optional(), // "p. 141", "32:10", location within the source.
    thought: z.string().optional(),
    // The source (media_item, link, …) is linked via an ABOUT edge.
  })
  .passthrough();

export const assetProps = z
  .object({
    category: z
      .enum(['electronics', 'furniture', 'vehicle', 'instrument', 'appliance', 'other'])
      .optional(),
    vendor: z.string().optional(),
    model: z.string().optional(),
    serial: z.string().optional(),
    purchased_on: isoDate.optional(),
    price: money,
    warranty_until: isoDate.optional(),
    asset_status: z.enum(['owned', 'sold', 'gifted', 'broken']).optional(),
  })
  .passthrough();

export const healthLogProps = z
  .object({
    metric: z
      .enum(['weight', 'sleep_h', 'workout', 'illness', 'checkup', 'mood', 'custom'])
      .optional(),
    custom_metric: z.string().optional(),
    value: z.number().optional(),
    unit: z.string().optional(),
    logged_at: isoDateTime.optional(),
    note: z.string().optional(),
  })
  .passthrough();

export const accountProps = z
  .object({
    kind: z.enum(['financial', 'utility', 'subscription', 'online']).optional(),
    service: z.string().optional(),
    username: z.string().optional(),
    url: urlish,
    // Masked identifier only ("…4242"), never store credentials (SRS AR-1).
    identifier_masked: z.string().optional(),
    cost: z
      .object({
        amount: z.number(),
        currency: z.string(),
        period: z.enum(['monthly', 'yearly']),
      })
      .partial()
      .optional(),
    renewal_on: isoDate.optional(),
    account_status: z.enum(['active', 'closed']).optional(),
  })
  .passthrough();

export const subscriptionProps = z
  .object({
    vendor: z.string().optional(),
    category: z
      .enum(['software', 'media', 'utility', 'membership', 'cloud', 'other'])
      .optional(),
    plan: z.string().optional(),
    cost: z
      .object({
        amount: z.number(),
        currency: z.string(),
        period: z.enum(['monthly', 'yearly', 'weekly']),
      })
      .partial()
      .optional(),
    renews_on: isoDate.optional(),
    started_on: isoDate.optional(),
    sub_status: z.enum(['active', 'trial', 'paused', 'cancelled']).optional(),
    url: urlish,
  })
  .passthrough();

/** Permissive fallback for unknown types (defensive only, all types are modelled). */
const passthroughProps = z.record(z.string(), z.unknown());

/**
 * The registry mapping every node type to its `props` schema. Every schema is
 * `.passthrough()` so unknown keys (imports, older versions) round-trip
 * through validate → PATCH without being silently stripped.
 */
export const NODE_PROPS_SCHEMAS = {
  person: personProps.passthrough(),
  organization: organizationProps.passthrough(),
  role: roleProps.passthrough(),
  project: projectProps.passthrough(),
  repository: repositoryProps.passthrough(),
  skill: skillProps.passthrough(),
  education: educationProps.passthrough(),
  certification: certificationProps.passthrough(),
  course: courseProps,
  publication: publicationProps,
  talk: talkProps,
  award: awardProps,
  reference: referenceProps,
  job_posting: jobPostingProps,
  application: applicationProps,
  interview: interviewProps,
  event: eventProps.passthrough(),
  interaction: interactionProps.passthrough(),
  task: taskProps.passthrough(),
  goal: goalProps,
  habit: habitProps,
  journal_entry: journalEntryProps.passthrough(),
  idea: ideaProps.passthrough(),
  link: linkProps.passthrough(),
  document: documentProps.passthrough(),
  post: postProps,
  location: locationProps,
  trip: tripProps,
  media_item: mediaItemProps,
  highlight: highlightProps,
  asset: assetProps,
  health_log: healthLogProps,
  account: accountProps,
  subscription: subscriptionProps,
} satisfies Record<NodeType, z.ZodType>;

export function propsSchemaFor(type: NodeType): z.ZodType {
  return NODE_PROPS_SCHEMAS[type] ?? passthroughProps;
}
