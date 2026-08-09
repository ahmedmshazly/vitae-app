/**
 * Form descriptors for every node type (FR-CAP-002). One schema-driven form
 * engine renders these; per-type quirks (person socials grid, habit weekday
 * picker) are handled by web-side overrides keyed on the same field ids.
 *
 * Edge directions follow the SRS §4.4 catalog (e.g. ROLE_AT: role → org,
 * HELD: person → role, WITH: interaction|trip → person).
 */
import { NODE_TYPES, type NodeType } from '../types.js';
import type {
  EdgeSubEditor,
  FieldDescriptor,
  SelectOption,
  TypeFormDescriptor,
} from './types.js';

const ALL_TYPES: NodeType[] = [...NODE_TYPES];

/** "snake_case" → "Snake case" select options. */
function sel(...values: string[]): SelectOption[] {
  return values.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' '),
  }));
}

const noDates = { dates: false } as const;

/** Issuer sub-editor shared by education/certification/award (RELATES_TO org). */
function issuerEdge(label: string): EdgeSubEditor {
  return {
    edgeType: 'RELATES_TO',
    direction: 'out',
    label,
    targetTypes: ['organization'],
    cardinality: 'one',
    inlineProps: [{ key: 'label', label: 'Relation label', widget: 'text', placeholder: label.toLowerCase() }],
  };
}

const usesSkillInline: FieldDescriptor[] = [
  { key: 'level', label: 'Level', widget: 'select', options: sel('learning', 'working', 'proficient', 'expert') },
  { key: 'centrality', label: 'Centrality', widget: 'select', options: sel('core', 'supporting') },
];

export const NODE_FORM_DESCRIPTORS: Record<NodeType, TypeFormDescriptor> = {
  // ── Career core ─────────────────────────────────────────────────────────
  person: {
    type: 'person',
    titleLabel: 'Full name',
    titlePlaceholder: 'Lina Farouk',
    subtitleLabel: 'One-liner',
    sections: [
      { id: 'identity', label: 'Identity' },
      { id: 'contact', label: 'Contact' },
      { id: 'context', label: 'Context' },
    ],
    fields: [
      { key: 'given_name', label: 'Given name', widget: 'text', section: 'identity' },
      { key: 'family_name', label: 'Family name', widget: 'text', section: 'identity' },
      { key: 'pronouns', label: 'Pronouns', widget: 'text', section: 'identity', placeholder: 'she/her' },
      { key: 'headline', label: 'Headline', widget: 'text', section: 'identity', placeholder: 'ML engineer @ …' },
      { key: 'birthday', label: 'Birthday', widget: 'date', section: 'identity', mono: true },
      { key: 'emails', label: 'Emails', widget: 'email-list', section: 'contact', mono: true },
      { key: 'phones', label: 'Phones', widget: 'string-list', section: 'contact', mono: true },
      { key: 'city', label: 'City', widget: 'text', section: 'context' },
      { key: 'timezone', label: 'Timezone', widget: 'text', section: 'context', placeholder: 'Africa/Cairo', mono: true },
      {
        key: 'do_not_contact',
        label: 'Do not contact',
        widget: 'checkbox',
        section: 'context',
        help: 'Excluded from “Who should I call” and composer suggestions.',
      },
    ],
    edges: [
      {
        edgeType: 'USES_SKILL',
        direction: 'out',
        label: 'Skills',
        targetTypes: ['skill'],
        cardinality: 'many',
        inlineProps: usesSkillInline,
      },
      {
        edgeType: 'WORKED_ON',
        direction: 'out',
        label: 'Projects',
        targetTypes: ['project'],
        cardinality: 'many',
        inlineProps: [
          { key: 'involvement', label: 'Involvement', widget: 'select', options: sel('led', 'core', 'contributor', 'advisor') },
        ],
      },
      {
        edgeType: 'MEMBER_OF',
        direction: 'out',
        label: 'Memberships',
        targetTypes: ['organization'],
        cardinality: 'many',
        inlineProps: [
          { key: 'role', label: 'Role', widget: 'text', placeholder: 'Senior Member' },
          { key: 'since', label: 'Since', widget: 'date' },
        ],
      },
      {
        edgeType: 'FOLLOWS',
        direction: 'out',
        label: 'Follows',
        targetTypes: ['organization', 'person'],
        cardinality: 'many',
        help: 'One-way interest. Use Knows for an actual relationship.',
      },
    ],
    envelope: noDates,
  },

  organization: {
    type: 'organization',
    titleLabel: 'Name',
    titlePlaceholder: 'Instabug',
    subtitleLabel: 'One-liner',
    sections: [{ id: 'main', label: 'Details' }],
    fields: [
      { key: 'kind', label: 'Kind', widget: 'select', options: sel('company', 'university', 'community', 'nonprofit', 'team') },
      { key: 'industry', label: 'Industry', widget: 'text' },
      { key: 'website', label: 'Website', widget: 'url', mono: true },
      { key: 'domain', label: 'Domain', widget: 'text', placeholder: 'instabug.com', mono: true },
      { key: 'linkedin_url', label: 'LinkedIn', widget: 'url', mono: true },
      { key: 'hq_city', label: 'HQ city', widget: 'text' },
      { key: 'size_hint', label: 'Size', widget: 'text', placeholder: '51-200' },
    ],
    edges: [],
    envelope: noDates,
  },

  role: {
    type: 'role',
    subject: {
      edgeType: 'HELD',
      direction: 'in',
      label: 'Whose role is this?',
      required: true,
      defaultToSelf: true,
    },
    titleLabel: 'Role title',
    titlePlaceholder: 'Senior ML Engineer',
    sections: [
      { id: 'main', label: 'Role' },
      { id: 'detail', label: 'Details' },
    ],
    fields: [
      {
        key: 'employment_type',
        label: 'Employment type',
        widget: 'select',
        options: sel('full_time', 'part_time', 'intern', 'contract', 'freelance', 'volunteer'),
        required: true,
      },
      { key: 'seniority', label: 'Seniority', widget: 'select', options: sel('intern', 'junior', 'mid', 'senior', 'staff', 'lead', 'principal', 'manager', 'director') },
      { key: 'team', label: 'Team', widget: 'text' },
      { key: 'location_mode', label: 'Location mode', widget: 'select', options: sel('onsite', 'hybrid', 'remote') },
      { key: 'city', label: 'City', widget: 'text' },
      { key: 'tech_stack', label: 'Tech stack', widget: 'suggest-list', suggestKind: 'tech', section: 'detail', mono: true },
      { key: 'comp', label: 'Compensation', widget: 'money', section: 'detail', amountKey: 'base', help: 'Stored privately; never exported to résumés.' },
      { key: 'reason_left', label: 'Reason left', widget: 'textarea', section: 'detail' },
    ],
    edges: [
      {
        edgeType: 'ROLE_AT',
        direction: 'out',
        label: 'Organization',
        targetTypes: ['organization'],
        cardinality: 'one',
        inlineProps: [{ key: 'department', label: 'Department', widget: 'text' }],
      },
      {
        edgeType: 'USES_SKILL',
        direction: 'out',
        label: 'Skills used',
        targetTypes: ['skill'],
        cardinality: 'many',
        inlineProps: usesSkillInline,
      },
    ],
    envelope: { dates: true, dateLabels: { start: 'Started', end: 'Ended' } },
  },

  project: {
    type: 'project',
    subject: {
      edgeType: 'WORKED_ON',
      direction: 'in',
      label: 'Who worked on this?',
      required: true,
      defaultToSelf: true,
    },
    titleLabel: 'Project name',
    subtitleLabel: 'One-liner',
    sections: [{ id: 'main', label: 'Project' }],
    fields: [
      { key: 'kind', label: 'Kind', widget: 'select', options: sel('work', 'personal', 'research', 'oss') },
      { key: 'status', label: 'Status', widget: 'select', options: sel('active', 'paused', 'done', 'archived') },
      { key: 'my_role', label: 'My role', widget: 'text', placeholder: 'tech lead' },
      { key: 'url', label: 'URL', widget: 'url', mono: true },
      { key: 'outcome', label: 'Outcome', widget: 'textarea' },
    ],
    edges: [
      {
        edgeType: 'PART_OF',
        direction: 'out',
        label: 'Part of',
        targetTypes: ['role', 'organization'],
        cardinality: 'one',
        inlineProps: [{ key: 'context', label: 'Context', widget: 'text', placeholder: '20% time' }],
      },
      {
        edgeType: 'USES_SKILL',
        direction: 'out',
        label: 'Skills used',
        targetTypes: ['skill'],
        cardinality: 'many',
        inlineProps: usesSkillInline,
      },
      {
        edgeType: 'WORKED_ON',
        direction: 'in',
        label: 'Collaborators',
        targetTypes: ['person'],
        cardinality: 'many',
        inlineProps: [
          { key: 'involvement', label: 'Involvement', widget: 'select', options: sel('led', 'core', 'contributor', 'advisor') },
        ],
      },
    ],
    envelope: { dates: true },
  },

  repository: {
    type: 'repository',
    subject: {
      edgeType: 'AUTHORED',
      direction: 'in',
      label: 'Whose repository is this?',
      required: true,
      defaultToSelf: true,
    },
    titleLabel: 'Repository',
    titlePlaceholder: 'vitae',
    sections: [{ id: 'main', label: 'Repository' }],
    fields: [
      { key: 'full_name', label: 'Full name', widget: 'text', placeholder: 'owner/repo', mono: true, required: true },
      { key: 'host', label: 'Host', widget: 'select', options: sel('github', 'gitlab', 'self') },
      { key: 'url', label: 'URL', widget: 'url', mono: true },
      { key: 'primary_language', label: 'Primary language', widget: 'text', mono: true },
      { key: 'description', label: 'Description', widget: 'textarea' },
      { key: 'topics', label: 'Topics', widget: 'suggest-list', suggestKind: 'topic', mono: true },
      { key: 'stars', label: 'Stars', widget: 'number', mono: true, min: 0 },
      { key: 'forks', label: 'Forks', widget: 'number', mono: true, min: 0 },
      { key: 'default_branch', label: 'Default branch', widget: 'text', mono: true },
      { key: 'is_private', label: 'Private', widget: 'checkbox' },
    ],
    edges: [
      {
        edgeType: 'USES_SKILL',
        direction: 'out',
        label: 'Skills',
        targetTypes: ['skill'],
        cardinality: 'many',
        inlineProps: usesSkillInline,
      },
    ],
    envelope: noDates,
  },

  skill: {
    type: 'skill',
    titleLabel: 'Skill name',
    titlePlaceholder: 'PyTorch',
    sections: [{ id: 'main', label: 'Skill' }],
    fields: [
      { key: 'category', label: 'Category', widget: 'select', options: sel('language', 'framework', 'tool', 'platform', 'domain', 'method', 'soft') },
      { key: 'proficiency', label: 'Proficiency', widget: 'select', options: sel('learning', 'working', 'proficient', 'expert') },
      { key: 'aliases', label: 'Aliases', widget: 'suggest-list', suggestKind: 'skill', mono: true, help: 'Alternate spellings the JD parser should match.' },
      { key: 'years_estimate', label: 'Years', widget: 'number', mono: true, min: 0 },
      { key: 'last_used', label: 'Last used', widget: 'date', mono: true },
    ],
    edges: [],
    envelope: noDates,
  },

  education: {
    type: 'education',
    subject: {
      edgeType: 'ATTENDED',
      direction: 'in',
      label: 'Who studied here?',
      required: true,
      defaultToSelf: true,
    },
    titleLabel: 'Program',
    titlePlaceholder: 'BSc Computer Engineering',
    sections: [{ id: 'main', label: 'Education' }],
    fields: [
      { key: 'degree', label: 'Degree', widget: 'text', placeholder: 'BSc' },
      { key: 'field_of_study', label: 'Field of study', widget: 'text' },
      { key: 'gpa', label: 'GPA', widget: 'number', mono: true, min: 0 },
      { key: 'honors', label: 'Honors', widget: 'text' },
      { key: 'coursework', label: 'Coursework', widget: 'suggest-list', suggestKind: 'topic' },
      { key: 'thesis_title', label: 'Thesis', widget: 'text' },
      { key: 'activities', label: 'Activities', widget: 'textarea' },
    ],
    edges: [issuerEdge('Institution')],
    envelope: { dates: true, dateLabels: { start: 'Started', end: 'Graduated' } },
  },

  certification: {
    type: 'certification',
    subject: {
      edgeType: 'EARNED',
      direction: 'in',
      label: 'Who earned this?',
      required: true,
      defaultToSelf: true,
    },
    titleLabel: 'Certification',
    titlePlaceholder: 'AWS Solutions Architect',
    sections: [{ id: 'main', label: 'Certification' }],
    fields: [
      { key: 'credential_id', label: 'Credential ID', widget: 'text', mono: true },
      { key: 'credential_url', label: 'Credential URL', widget: 'url', mono: true },
      { key: 'issued_on', label: 'Issued', widget: 'date', mono: true },
      { key: 'expires_on', label: 'Expires', widget: 'date', mono: true },
      { key: 'status', label: 'Status', widget: 'select', options: sel('valid', 'expired') },
    ],
    edges: [issuerEdge('Issuer')],
    envelope: noDates,
  },

  course: {
    type: 'course',
    subject: {
      edgeType: 'COMPLETED',
      direction: 'in',
      label: 'Who took this course?',
      required: true,
      defaultToSelf: true,
    },
    titleLabel: 'Course',
    titlePlaceholder: 'Deep Learning Specialization',
    subtitleLabel: 'One-liner',
    sections: [{ id: 'main', label: 'Course' }],
    fields: [
      { key: 'provider', label: 'Provider', widget: 'text', placeholder: 'Coursera · Udacity · MIT OCW' },
      { key: 'platform', label: 'Platform', widget: 'text' },
      { key: 'format', label: 'Format', widget: 'select', options: sel('self_paced', 'cohort', 'in_person', 'bootcamp') },
      { key: 'course_status', label: 'Status', widget: 'select', options: sel('enrolled', 'in_progress', 'completed', 'dropped') },
      { key: 'completion', label: 'Completion %', widget: 'number', mono: true, min: 0, max: 100 },
      { key: 'hours', label: 'Hours', widget: 'number', mono: true, min: 0 },
      { key: 'started_on', label: 'Started', widget: 'date', mono: true },
      { key: 'completed_on', label: 'Completed', widget: 'date', mono: true },
      { key: 'credential_url', label: 'Credential URL', widget: 'url', mono: true },
      { key: 'skills_gained', label: 'Skills gained', widget: 'suggest-list', suggestKind: 'tech', help: 'Also link them below so the résumé engine can use them.' },
    ],
    edges: [
      issuerEdge('Provider'),
      {
        edgeType: 'USES_SKILL',
        direction: 'out',
        label: 'Skills gained',
        targetTypes: ['skill'],
        cardinality: 'many',
        inlineProps: usesSkillInline,
      },
    ],
    envelope: { dates: true, dateLabels: { start: 'Started', end: 'Completed' } },
  },

  publication: {
    type: 'publication',
    subject: {
      edgeType: 'AUTHORED',
      direction: 'in',
      label: 'Who authored this?',
      required: true,
      defaultToSelf: true,
    },
    titleLabel: 'Title',
    sections: [{ id: 'main', label: 'Publication' }],
    fields: [
      { key: 'pub_type', label: 'Type', widget: 'select', options: sel('journal', 'conference', 'workshop', 'preprint', 'blog', 'thesis') },
      { key: 'venue', label: 'Venue', widget: 'text', placeholder: 'NeurIPS 2025' },
      { key: 'published_on', label: 'Published', widget: 'date', mono: true },
      { key: 'doi', label: 'DOI', widget: 'text', mono: true },
      { key: 'url', label: 'URL', widget: 'url', mono: true },
      { key: 'authors', label: 'Authors', widget: 'string-list' },
      { key: 'author_position', label: 'My author position', widget: 'number', mono: true, min: 1 },
      { key: 'my_contribution', label: 'My contribution', widget: 'textarea' },
      { key: 'citation_count', label: 'Citations', widget: 'number', mono: true, min: 0 },
    ],
    edges: [
      {
        edgeType: 'AUTHORED',
        direction: 'in',
        label: 'Co-authors',
        targetTypes: ['person'],
        cardinality: 'many',
        inlineProps: [
          { key: 'author_position', label: 'Position', widget: 'number', min: 1 },
          { key: 'weight', label: 'Weight', widget: 'select', options: sel('sole', 'lead', 'co') },
        ],
      },
    ],
    envelope: noDates,
  },

  talk: {
    type: 'talk',
    subject: {
      edgeType: 'AUTHORED',
      direction: 'in',
      label: 'Who gave this talk?',
      required: true,
      defaultToSelf: true,
    },
    titleLabel: 'Talk title',
    sections: [{ id: 'main', label: 'Talk' }],
    fields: [
      { key: 'talk_type', label: 'Type', widget: 'select', options: sel('conference', 'meetup', 'guest_lecture', 'podcast', 'webinar', 'workshop') },
      { key: 'event_name', label: 'Event', widget: 'text' },
      { key: 'venue', label: 'Venue', widget: 'text' },
      { key: 'city', label: 'City', widget: 'text' },
      { key: 'delivered_on', label: 'Delivered', widget: 'date', mono: true },
      { key: 'audience_size', label: 'Audience size', widget: 'number', mono: true, min: 0 },
      { key: 'slides_url', label: 'Slides', widget: 'url', mono: true },
      { key: 'video_url', label: 'Video', widget: 'url', mono: true },
      { key: 'co_presenters', label: 'Co-presenters', widget: 'string-list' },
    ],
    edges: [
      {
        edgeType: 'LOCATED_IN',
        direction: 'out',
        label: 'Location',
        targetTypes: ['location'],
        cardinality: 'one',
      },
    ],
    envelope: noDates,
  },

  award: {
    type: 'award',
    subject: {
      edgeType: 'EARNED',
      direction: 'in',
      label: 'Who earned this?',
      required: true,
      defaultToSelf: true,
    },
    titleLabel: 'Award',
    titlePlaceholder: 'Best Paper Award',
    sections: [{ id: 'main', label: 'Award' }],
    fields: [
      { key: 'level', label: 'Level', widget: 'select', options: sel('team', 'org', 'national', 'international') },
      { key: 'award_for', label: 'Awarded for', widget: 'text' },
      { key: 'awarded_on', label: 'Awarded', widget: 'date', mono: true },
      { key: 'prize', label: 'Prize', widget: 'text' },
      { key: 'url', label: 'URL', widget: 'url', mono: true },
    ],
    edges: [issuerEdge('Issuer')],
    envelope: noDates,
  },

  reference: {
    type: 'reference',
    subject: {
      edgeType: 'RECOMMENDS',
      direction: 'in',
      label: 'Who gave this reference?',
      required: true,
      defaultToSelf: false,
    },
    titleLabel: 'Reference',
    titlePlaceholder: 'Reference from Dr. Nour',
    subtitleLabel: 'One-liner',
    sections: [
      { id: 'main', label: 'Reference' },
      { id: 'contact', label: 'Contact' },
    ],
    fields: [
      { key: 'reference_type', label: 'Type', widget: 'select', options: sel('professional', 'academic', 'personal', 'character') },
      { key: 'relationship', label: 'Relationship', widget: 'text', placeholder: 'Manager at Goodera' },
      { key: 'strength', label: 'Strength', widget: 'rating', min: 1, max: 5 },
      { key: 'blurb', label: 'What they say', widget: 'textarea', help: 'The testimonial / recommendation text.' },
      { key: 'context', label: 'Context', widget: 'textarea', help: 'Where and when they worked with you.' },
      { key: 'can_contact', label: 'OK to contact', widget: 'checkbox', section: 'contact' },
      { key: 'contact_email', label: 'Email', widget: 'text', section: 'contact', mono: true },
      { key: 'contact_phone', label: 'Phone', widget: 'text', section: 'contact', mono: true },
    ],
    edges: [
      // The referee is the subject picker, not a connection row.
    ],
    envelope: noDates,
  },

  job_posting: {
    type: 'job_posting',
    titleLabel: 'Posting',
    titlePlaceholder: 'ML Engineer @ Stripe',
    subtitleLabel: 'One-liner',
    sections: [
      { id: 'main', label: 'Posting' },
      { id: 'jd', label: 'Job description' },
    ],
    fields: [
      { key: 'company', label: 'Company', widget: 'text' },
      { key: 'role_title', label: 'Role title', widget: 'text' },
      { key: 'posting_status', label: 'Status', widget: 'select', options: sel('watching', 'interested', 'applied', 'closed', 'passed') },
      { key: 'location', label: 'Location', widget: 'text' },
      { key: 'location_mode', label: 'Location mode', widget: 'select', options: sel('onsite', 'hybrid', 'remote') },
      { key: 'employment_type', label: 'Employment type', widget: 'select', options: sel('full_time', 'part_time', 'intern', 'contract', 'freelance') },
      { key: 'salary_range', label: 'Salary range', widget: 'text', placeholder: '$120k-140k' },
      { key: 'deadline', label: 'Deadline', widget: 'date', mono: true },
      { key: 'source', label: 'Source', widget: 'text', placeholder: 'LinkedIn · referral · careers page' },
      { key: 'url', label: 'Posting URL', widget: 'url', mono: true },
      { key: 'jd_text', label: 'Job description', widget: 'textarea', section: 'jd', help: 'Paste the JD, you can tailor a résumé straight from it.' },
    ],
    edges: [
      {
        edgeType: 'APPLIED_TO',
        direction: 'out',
        label: 'Company',
        targetTypes: ['organization'],
        cardinality: 'one',
      },
    ],
    envelope: noDates,
  },

  application: {
    type: 'application',
    titleLabel: 'Position',
    titlePlaceholder: 'ML Engineer @ Instabug',
    sections: [{ id: 'main', label: 'Application' }],
    fields: [
      { key: 'role_title', label: 'Role title', widget: 'text', required: true },
      {
        key: 'status',
        label: 'Status',
        widget: 'select',
        options: sel('draft', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn', 'accepted'),
        required: true,
      },
      { key: 'applied_on', label: 'Applied', widget: 'date', mono: true },
      { key: 'deadline', label: 'Deadline', widget: 'date', mono: true },
      { key: 'channel', label: 'Channel', widget: 'select', options: sel('referral', 'cold', 'recruiter', 'inbound') },
      { key: 'location_mode', label: 'Location mode', widget: 'select', options: sel('onsite', 'hybrid', 'remote') },
      { key: 'salary_range', label: 'Salary range', widget: 'text', placeholder: '$120k-140k' },
      { key: 'job_url', label: 'Job URL', widget: 'url', mono: true },
      { key: 'next_step', label: 'Next step', widget: 'text' },
      { key: 'next_step_date', label: 'Next step date', widget: 'date', mono: true },
    ],
    edges: [
      {
        edgeType: 'APPLIED_TO',
        direction: 'out',
        label: 'Company',
        targetTypes: ['organization'],
        cardinality: 'one',
      },
      {
        edgeType: 'REFERRED_BY',
        direction: 'out',
        label: 'Referred by',
        targetTypes: ['person'],
        cardinality: 'one',
        inlineProps: [
          { key: 'asked_on', label: 'Asked on', widget: 'date' },
          { key: 'outcome', label: 'Outcome', widget: 'select', options: sel('agreed', 'declined', 'pending') },
        ],
      },
      {
        edgeType: 'INTERVIEW_FOR',
        direction: 'in',
        label: 'Interviews',
        targetTypes: ['interview'],
        cardinality: 'many',
      },
    ],
    envelope: noDates,
  },

  interview: {
    type: 'interview',
    titleLabel: 'Interview',
    titlePlaceholder: 'System design: Stripe',
    subtitleLabel: 'Round',
    sections: [
      { id: 'main', label: 'Interview' },
      { id: 'prep', label: 'Prep & reflection' },
    ],
    fields: [
      { key: 'round', label: 'Round', widget: 'text', placeholder: 'Recruiter screen · Onsite · System design' },
      { key: 'stage_no', label: 'Stage #', widget: 'number', mono: true, min: 1 },
      { key: 'format', label: 'Format', widget: 'select', options: sel('phone', 'video', 'onsite', 'take_home', 'panel') },
      { key: 'scheduled_at', label: 'Scheduled', widget: 'datetime', mono: true },
      { key: 'duration_min', label: 'Duration (min)', widget: 'number', mono: true, min: 0 },
      { key: 'outcome', label: 'Outcome', widget: 'select', options: sel('scheduled', 'passed', 'failed', 'pending', 'cancelled') },
      { key: 'interviewers', label: 'Interviewers', widget: 'string-list', section: 'prep' },
      { key: 'prep_notes', label: 'Prep notes', widget: 'textarea', section: 'prep' },
      { key: 'reflection', label: 'Reflection', widget: 'textarea', section: 'prep', help: 'What went well, what to improve.' },
    ],
    edges: [
      {
        edgeType: 'INTERVIEW_FOR',
        direction: 'out',
        label: 'For',
        targetTypes: ['application', 'job_posting'],
        cardinality: 'one',
      },
      {
        edgeType: 'WITH',
        direction: 'out',
        label: 'Interviewers (people)',
        targetTypes: ['person'],
        cardinality: 'many',
      },
    ],
    envelope: noDates,
  },

  // ── Life core ───────────────────────────────────────────────────────────
  event: {
    type: 'event',
    titleLabel: 'Event name',
    titlePlaceholder: 'DevFest Cairo',
    sections: [{ id: 'main', label: 'Event' }],
    fields: [
      { key: 'kind', label: 'Kind', widget: 'select', options: sel('conference', 'meetup', 'hackathon', 'party', 'wedding', 'class', 'appointment'), required: true },
      { key: 'venue', label: 'Venue', widget: 'text' },
      { key: 'city', label: 'City', widget: 'text' },
      { key: 'starts_at', label: 'Starts', widget: 'datetime', mono: true },
      { key: 'ends_at', label: 'Ends', widget: 'datetime', mono: true },
      { key: 'url', label: 'URL', widget: 'url', mono: true },
      { key: 'attended', label: 'Attended', widget: 'checkbox' },
    ],
    edges: [
      {
        edgeType: 'ATTENDED',
        direction: 'in',
        label: 'Attendees',
        targetTypes: ['person'],
        cardinality: 'many',
        inlineProps: [
          { key: 'role', label: 'Role', widget: 'select', options: sel('attendee', 'speaker', 'organizer', 'volunteer') },
        ],
      },
      {
        edgeType: 'LOCATED_IN',
        direction: 'out',
        label: 'Location',
        targetTypes: ['location'],
        cardinality: 'one',
      },
    ],
    envelope: noDates,
  },

  interaction: {
    type: 'interaction',
    titleLabel: 'Summary',
    titlePlaceholder: 'Coffee with Lina',
    sections: [{ id: 'main', label: 'Interaction' }],
    fields: [
      { key: 'kind', label: 'Kind', widget: 'select', options: sel('meeting', 'coffee', 'call', 'video', 'message', 'email', 'comment', 'encounter', 'outreach'), required: true },
      { key: 'occurred_at', label: 'When', widget: 'datetime', mono: true, required: true },
      { key: 'duration_min', label: 'Duration (min)', widget: 'number', mono: true, min: 0 },
      { key: 'initiated_by', label: 'Initiated by', widget: 'select', options: sel('me', 'them') },
      { key: 'sentiment', label: 'Sentiment', widget: 'select', options: sel('great', 'good', 'neutral', 'tense') },
      { key: 'channel', label: 'Channel', widget: 'text', placeholder: 'WhatsApp' },
      { key: 'note', label: 'Note', widget: 'textarea' },
      { key: 'talking_points', label: 'Talking points', widget: 'string-list' },
      {
        key: 'follow_ups',
        label: 'Follow-ups',
        widget: 'object-list',
        itemFields: [
          { key: 'what', label: 'What', widget: 'text', required: true },
          { key: 'due', label: 'Due', widget: 'date' },
        ],
      },
    ],
    edges: [
      { edgeType: 'WITH', direction: 'out', label: 'With', targetTypes: ['person'], cardinality: 'many' },
      { edgeType: 'ABOUT', direction: 'out', label: 'About', targetTypes: ALL_TYPES, cardinality: 'many' },
    ],
    envelope: noDates,
  },

  task: {
    type: 'task',
    titleLabel: 'Task',
    sections: [{ id: 'main', label: 'Task' }],
    fields: [
      { key: 'status', label: 'Status', widget: 'select', options: sel('inbox', 'next', 'doing', 'waiting', 'done', 'dropped'), required: true },
      { key: 'priority', label: 'Priority', widget: 'select', options: sel('p1', 'p2', 'p3', 'p4') },
      { key: 'due', label: 'Due', widget: 'date', mono: true },
      { key: 'scheduled', label: 'Scheduled', widget: 'date', mono: true },
      { key: 'effort_min', label: 'Effort (min)', widget: 'number', mono: true, min: 0 },
    ],
    edges: [
      { edgeType: 'ABOUT', direction: 'out', label: 'About', targetTypes: ALL_TYPES, cardinality: 'many' },
    ],
    envelope: noDates,
  },

  goal: {
    type: 'goal',
    titleLabel: 'Goal',
    titlePlaceholder: 'Publish at a top-tier venue',
    sections: [{ id: 'main', label: 'Goal' }],
    fields: [
      { key: 'horizon', label: 'Horizon', widget: 'select', options: sel('month', 'quarter', 'year', 'life') },
      { key: 'goal_status', label: 'Status', widget: 'select', options: sel('active', 'paused', 'achieved', 'abandoned') },
      { key: 'target_date', label: 'Target date', widget: 'date', mono: true },
      { key: 'success_criteria', label: 'Success criteria', widget: 'textarea' },
      { key: 'motivation', label: 'Motivation', widget: 'textarea' },
      {
        key: 'key_results',
        label: 'Key results',
        widget: 'object-list',
        itemFields: [
          { key: 'name', label: 'Result', widget: 'text', required: true },
          { key: 'current', label: 'Current', widget: 'number' },
          { key: 'target', label: 'Target', widget: 'number' },
          { key: 'unit', label: 'Unit', widget: 'text' },
          { key: 'done', label: 'Done', widget: 'checkbox' },
        ],
      },
    ],
    edges: [
      {
        edgeType: 'RELATES_TO',
        direction: 'in',
        label: 'Supported by',
        targetTypes: ['project', 'habit', 'task'],
        cardinality: 'many',
        inlineProps: [{ key: 'label', label: 'How', widget: 'text', placeholder: 'supports' }],
      },
    ],
    envelope: noDates,
  },

  habit: {
    type: 'habit',
    titleLabel: 'Habit',
    titlePlaceholder: 'Morning run',
    sections: [{ id: 'main', label: 'Habit' }],
    fields: [
      { key: 'cadence', label: 'Cadence', widget: 'select', options: sel('daily', 'weekly', 'monthly') },
      { key: 'target_per_period', label: 'Target per period', widget: 'number', mono: true, min: 1 },
      { key: 'schedule_days', label: 'Days', widget: 'tags', help: 'Weekdays (weekly cadence).' },
      { key: 'started_on', label: 'Started', widget: 'date', mono: true },
      { key: 'active', label: 'Active', widget: 'checkbox' },
      { key: 'cue', label: 'Cue', widget: 'text', placeholder: 'after coffee' },
      { key: 'why', label: 'Why', widget: 'textarea' },
    ],
    edges: [
      {
        edgeType: 'RELATES_TO',
        direction: 'out',
        label: 'Supports goal',
        targetTypes: ['goal'],
        cardinality: 'one',
        inlineProps: [{ key: 'label', label: 'How', widget: 'text', placeholder: 'supports' }],
      },
    ],
    envelope: noDates,
  },

  journal_entry: {
    type: 'journal_entry',
    titleLabel: 'Entry title',
    sections: [{ id: 'main', label: 'Entry' }],
    fields: [
      { key: 'entry_date', label: 'Date', widget: 'date', mono: true, required: true },
      { key: 'mood', label: 'Mood', widget: 'rating', min: 1, max: 5 },
      { key: 'energy', label: 'Energy', widget: 'rating', min: 1, max: 5 },
      { key: 'gratitude', label: 'Gratitude', widget: 'textarea' },
    ],
    edges: [],
    envelope: noDates,
  },

  idea: {
    type: 'idea',
    titleLabel: 'Idea',
    sections: [{ id: 'main', label: 'Idea' }],
    fields: [
      { key: 'status', label: 'Status', widget: 'select', options: sel('spark', 'explored', 'building', 'shipped', 'discarded'), required: true },
      { key: 'one_liner', label: 'One-liner', widget: 'text' },
      { key: 'excitement', label: 'Excitement', widget: 'rating', min: 1, max: 5 },
      { key: 'effort_guess', label: 'Effort guess', widget: 'select', options: sel('hours', 'days', 'weeks', 'months') },
      { key: 'problem', label: 'Problem', widget: 'textarea' },
      { key: 'next_experiment', label: 'Next experiment', widget: 'text' },
    ],
    edges: [
      { edgeType: 'ABOUT', direction: 'out', label: 'About', targetTypes: ALL_TYPES, cardinality: 'many' },
    ],
    envelope: noDates,
  },

  link: {
    type: 'link',
    titleLabel: 'Title',
    sections: [{ id: 'main', label: 'Link' }],
    fields: [
      { key: 'url', label: 'URL', widget: 'url', mono: true, required: true },
      { key: 'saved_reason', label: 'Why saved', widget: 'text' },
      { key: 'read_status', label: 'Read status', widget: 'select', options: sel('unread', 'read', 'reference') },
      { key: 'description', label: 'Description', widget: 'textarea' },
    ],
    edges: [
      {
        edgeType: 'SHARED_BY',
        direction: 'out',
        label: 'Shared by',
        targetTypes: ['person'],
        cardinality: 'one',
        inlineProps: [
          { key: 'shared_on', label: 'On', widget: 'date' },
          { key: 'channel', label: 'Channel', widget: 'text', placeholder: 'WhatsApp' },
        ],
      },
      { edgeType: 'ABOUT', direction: 'out', label: 'About', targetTypes: ALL_TYPES, cardinality: 'many' },
    ],
    envelope: noDates,
  },

  post: {
    type: 'post',
    subject: {
      edgeType: 'AUTHORED',
      direction: 'in',
      label: 'Who wrote this?',
      required: true,
      defaultToSelf: false,
    },
    titleLabel: 'Title',
    titlePlaceholder: 'First line, or a summary of the post',
    sections: [{ id: 'main', label: 'Post' }],
    fields: [
      {
        key: 'post_kind',
        label: 'Kind',
        widget: 'select',
        options: sel('post', 'article', 'comment', 'share'),
      },
      { key: 'text', label: 'Text', widget: 'textarea' },
      { key: 'url', label: 'URL', widget: 'url', mono: true },
      { key: 'posted_at', label: 'Posted at', widget: 'datetime', mono: true },
      { key: 'lang', label: 'Language', widget: 'text', mono: true, placeholder: 'en' },
    ],
    edges: [
      // The author is the subject picker, not a connection row.
      {
        edgeType: 'ABOUT',
        direction: 'out',
        label: 'About',
        targetTypes: ALL_TYPES,
        cardinality: 'many',
        help: 'For a comment, point this at the post it replies to.',
      },
      {
        edgeType: 'REACTED_TO',
        direction: 'in',
        label: 'Reactions',
        targetTypes: ['person'],
        cardinality: 'many',
        inlineProps: [
          {
            key: 'reaction_kind',
            label: 'Reaction',
            widget: 'select',
            options: sel('like', 'celebrate', 'support', 'love', 'insightful', 'funny'),
          },
        ],
      },
    ],
    // `engagement` and `media` are import-populated snapshots, not fields anyone
    // types by hand, they round-trip through passthrough without a widget.
    envelope: noDates,
  },

  document: {
    type: 'document',
    titleLabel: 'Document name',
    sections: [{ id: 'main', label: 'Document' }],
    fields: [
      { key: 'doc_kind', label: 'Kind', widget: 'select', options: sel('contract', 'transcript', 'certificate', 'statement', 'paper', 'manual', 'other'), required: true },
      { key: 'issued_on', label: 'Issued', widget: 'date', mono: true },
      { key: 'expires_on', label: 'Expires', widget: 'date', mono: true },
    ],
    edges: [
      { edgeType: 'RELATES_TO', direction: 'out', label: 'Related to', targetTypes: ALL_TYPES, cardinality: 'many', inlineProps: [{ key: 'label', label: 'Label', widget: 'text' }] },
    ],
    envelope: noDates,
  },

  // ── Long-tail ───────────────────────────────────────────────────────────
  location: {
    type: 'location',
    titleLabel: 'Place name',
    titlePlaceholder: 'Cairo',
    sections: [{ id: 'main', label: 'Place' }],
    fields: [
      { key: 'kind', label: 'Kind', widget: 'select', options: sel('country', 'region', 'city', 'venue', 'address') },
      { key: 'address', label: 'Address', widget: 'text' },
      { key: 'country_code', label: 'Country code', widget: 'text', placeholder: 'EG', mono: true },
      { key: 'lat', label: 'Latitude', widget: 'number', mono: true, min: -90, max: 90 },
      { key: 'lng', label: 'Longitude', widget: 'number', mono: true, min: -180, max: 180 },
    ],
    edges: [],
    envelope: noDates,
  },

  trip: {
    type: 'trip',
    titleLabel: 'Trip name',
    titlePlaceholder: 'NeurIPS 2026, Vancouver',
    sections: [{ id: 'main', label: 'Trip' }],
    fields: [
      { key: 'purpose', label: 'Purpose', widget: 'select', options: sel('work', 'conference', 'vacation', 'family', 'relocation') },
      { key: 'destination', label: 'Destination', widget: 'text' },
      { key: 'transport', label: 'Transport', widget: 'tags' },
      { key: 'budget', label: 'Budget', widget: 'money' },
      { key: 'highlights', label: 'Highlights', widget: 'textarea' },
    ],
    edges: [
      {
        edgeType: 'VISITED',
        direction: 'out',
        label: 'Places visited',
        targetTypes: ['location'],
        cardinality: 'many',
        inlineProps: [{ key: 'nights', label: 'Nights', widget: 'number', min: 0 }],
      },
      { edgeType: 'WITH', direction: 'out', label: 'Companions', targetTypes: ['person'], cardinality: 'many' },
    ],
    envelope: { dates: true, dateLabels: { start: 'Departed', end: 'Returned' } },
  },

  media_item: {
    type: 'media_item',
    titleLabel: 'Title',
    sections: [{ id: 'main', label: 'Media' }],
    fields: [
      { key: 'media_kind', label: 'Kind', widget: 'select', options: sel('book', 'paper', 'article', 'course', 'film', 'podcast', 'video') },
      { key: 'creator', label: 'Creator', widget: 'text' },
      { key: 'consumption_status', label: 'Status', widget: 'select', options: sel('want', 'in_progress', 'done', 'abandoned') },
      { key: 'rating', label: 'Rating', widget: 'rating', min: 1, max: 5 },
      { key: 'platform', label: 'Platform', widget: 'text', placeholder: 'Audible' },
      { key: 'url', label: 'URL', widget: 'url', mono: true },
      { key: 'isbn', label: 'ISBN', widget: 'text', mono: true },
      { key: 'doi', label: 'DOI', widget: 'text', mono: true },
      { key: 'started_on', label: 'Started', widget: 'date', mono: true },
      { key: 'finished_on', label: 'Finished', widget: 'date', mono: true },
      { key: 'key_takeaways', label: 'Key takeaways', widget: 'textarea' },
    ],
    edges: [
      {
        edgeType: 'SHARED_BY',
        direction: 'out',
        label: 'Recommended by',
        targetTypes: ['person'],
        cardinality: 'one',
        inlineProps: [
          { key: 'shared_on', label: 'On', widget: 'date' },
          { key: 'channel', label: 'Channel', widget: 'text' },
        ],
      },
    ],
    envelope: noDates,
  },

  highlight: {
    type: 'highlight',
    titleLabel: 'Highlight',
    sections: [{ id: 'main', label: 'Highlight' }],
    fields: [
      { key: 'excerpt', label: 'Excerpt', widget: 'textarea', help: 'The passage itself (≤500 chars).' },
      { key: 'loc_ref', label: 'Where', widget: 'text', placeholder: 'p. 141 · 32:10', mono: true },
      { key: 'thought', label: 'Your thought', widget: 'textarea' },
    ],
    edges: [
      {
        edgeType: 'ABOUT',
        direction: 'out',
        label: 'Source',
        targetTypes: ['media_item', 'link', 'publication'],
        cardinality: 'one',
      },
    ],
    envelope: noDates,
  },

  asset: {
    type: 'asset',
    titleLabel: 'Asset name',
    titlePlaceholder: 'ThinkPad X1',
    sections: [{ id: 'main', label: 'Asset' }],
    fields: [
      { key: 'category', label: 'Category', widget: 'select', options: sel('electronics', 'furniture', 'vehicle', 'instrument', 'appliance', 'other') },
      { key: 'vendor', label: 'Vendor', widget: 'text' },
      { key: 'model', label: 'Model', widget: 'text', mono: true },
      { key: 'serial', label: 'Serial', widget: 'text', mono: true },
      { key: 'purchased_on', label: 'Purchased', widget: 'date', mono: true },
      { key: 'price', label: 'Price', widget: 'money' },
      { key: 'warranty_until', label: 'Warranty until', widget: 'date', mono: true },
      { key: 'asset_status', label: 'Status', widget: 'select', options: sel('owned', 'sold', 'gifted', 'broken') },
    ],
    edges: [],
    envelope: noDates,
  },

  health_log: {
    type: 'health_log',
    titleLabel: 'Entry',
    titlePlaceholder: 'Morning weigh-in',
    sections: [{ id: 'main', label: 'Health' }],
    fields: [
      { key: 'metric', label: 'Metric', widget: 'select', options: sel('weight', 'sleep_h', 'workout', 'illness', 'checkup', 'mood', 'custom') },
      { key: 'custom_metric', label: 'Custom metric', widget: 'text' },
      { key: 'value', label: 'Value', widget: 'number', mono: true },
      { key: 'unit', label: 'Unit', widget: 'text', placeholder: 'kg', mono: true },
      { key: 'logged_at', label: 'Logged', widget: 'datetime', mono: true },
      { key: 'note', label: 'Note', widget: 'textarea' },
    ],
    edges: [],
    envelope: { dates: false, sensitivityDefault: 'sensitive' },
  },

  account: {
    type: 'account',
    titleLabel: 'Account name',
    titlePlaceholder: 'Cloudflare',
    sections: [{ id: 'main', label: 'Account' }],
    fields: [
      { key: 'kind', label: 'Kind', widget: 'select', options: sel('financial', 'utility', 'subscription', 'online') },
      { key: 'service', label: 'Service', widget: 'text' },
      { key: 'username', label: 'Username', widget: 'text', mono: true },
      { key: 'url', label: 'URL', widget: 'url', mono: true },
      {
        key: 'identifier_masked',
        label: 'Masked identifier',
        widget: 'text',
        placeholder: '…4242',
        mono: true,
        help: 'Masked reference only, never store credentials here.',
      },
      { key: 'cost', label: 'Cost', widget: 'money', withPeriod: true },
      { key: 'renewal_on', label: 'Renews', widget: 'date', mono: true },
      { key: 'account_status', label: 'Status', widget: 'select', options: sel('active', 'closed') },
    ],
    edges: [],
    envelope: noDates,
  },

  subscription: {
    type: 'subscription',
    titleLabel: 'Subscription',
    titlePlaceholder: 'Project planner',
    subtitleLabel: 'One-liner',
    sections: [{ id: 'main', label: 'Subscription' }],
    fields: [
      { key: 'vendor', label: 'Vendor', widget: 'text', placeholder: 'GitHub · Notion · AWS' },
      { key: 'category', label: 'Category', widget: 'select', options: sel('software', 'media', 'utility', 'membership', 'cloud', 'other') },
      { key: 'plan', label: 'Plan', widget: 'text', placeholder: 'Pro · Team · Free' },
      { key: 'sub_status', label: 'Status', widget: 'select', options: sel('active', 'trial', 'paused', 'cancelled') },
      { key: 'cost', label: 'Cost', widget: 'money', withPeriod: true },
      { key: 'started_on', label: 'Started', widget: 'date', mono: true },
      { key: 'renews_on', label: 'Renews', widget: 'date', mono: true },
      { key: 'url', label: 'URL', widget: 'url', mono: true },
    ],
    edges: [],
    envelope: noDates,
  },
};

export function nodeFormDescriptor(type: NodeType): TypeFormDescriptor {
  return NODE_FORM_DESCRIPTORS[type];
}

/**
 * The subject expressed as an ordinary edge sub-editor.
 *
 * The subject *is* just an edge, so letting it ride the existing connection
 * pipeline means create, reassign and unlink all work already, reassigning a
 * role from you to someone else is the same diff as any other edge change.
 * Only the rendering differs (a prominent picker, not a connection row).
 */
export function subjectSubEditor(type: NodeType): EdgeSubEditor | null {
  const subject = NODE_FORM_DESCRIPTORS[type].subject;
  if (!subject) return null;
  return {
    edgeType: subject.edgeType,
    direction: subject.direction,
    label: subject.label,
    targetTypes: ['person'],
    cardinality: 'one',
  };
}
