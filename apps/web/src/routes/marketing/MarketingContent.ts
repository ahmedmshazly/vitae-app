/**
 * The public editorial register. Keeping route copy and its supporting
 * metadata in one typed source lets the shell, guides, and eventual static
 * renderer describe the same product without a second CMS or a pile of
 * unreviewed string literals.
 */
// This registry is also evaluated by Vite's Node-side static-page plugin.
// The plugin externalizes workspace package aliases, while direct TypeScript
// source remains transformable in both that build step and the browser bundle.
import {
  CLOUD_INDIVIDUAL_PLAN,
  cloudIndividualAnnualSavingsMinorUnits,
  type CloudIndividualBillingPeriod,
  type CloudIndividualEntitlement,
} from '../../../../../packages/core/src/cloud/individual-plan.ts';

export type MarketingNavItem = {
  label: string;
  to: string;
  match?: readonly string[];
};

export const MARKETING_NAV: readonly MarketingNavItem[] = [
  { label: 'How it works', to: '/how-it-works' },
  { label: 'Warm paths', to: '/product/warm-paths', match: ['/product/warm-paths'] },
  { label: 'Career evidence', to: '/product/career-evidence', match: ['/product/career-evidence'] },
  { label: 'Tour', to: '/tour' },
  { label: 'Pricing', to: '/pricing' },
] as const;

export type Guide = {
  slug: string;
  section: string;
  title: string;
  summary: string;
  readingTime: string;
  steps: readonly { title: string; body: string }[];
  checklist: readonly string[];
};

export const GUIDES: readonly Guide[] = [
  {
    slug: 'first-career-record',
    section: 'Start here',
    title: 'Build the first useful career record',
    summary:
      'Set up a small, trustworthy starting point instead of attempting to reconstruct every role at once.',
    readingTime: '6 min',
    steps: [
      {
        title: 'Name the next move',
        body: 'Record a role, organization, or conversation you want to be ready for. A concrete target gives the rest of the graph a purpose.',
      },
      {
        title: 'Capture three anchors',
        body: 'Add one person, one piece of work, and one relationship or event that explains how they connect. Use quick capture when the detail is still fresh.',
      },
      {
        title: 'Add the evidence you can defend',
        body: 'Use structured fields and source notes for the achievement, role, or interaction. Keep a claim attached to the record that supports it.',
      },
      {
        title: 'Choose one next action',
        body: 'Create a follow-up, reconnect task, or application step while the context is present. The record is useful when it changes a decision.',
      },
    ],
    checklist: [
      'One current target or direction',
      'One person with relationship context',
      'One defensible achievement or project',
      'One next action',
    ],
  },
  {
    slug: 'ask-for-an-introduction',
    section: 'Relationships',
    title: 'Ask for an introduction with context',
    summary:
      'Trace a recorded relationship path, inspect each hop, and make a request that respects the people involved.',
    readingTime: '5 min',
    steps: [
      {
        title: 'Start with the organization or person',
        body: 'Open relationship intelligence and name the destination. Vitae only works from links in your own recorded network.',
      },
      {
        title: 'Inspect the route',
        body: 'Read each hop, the relationship type, and the supporting context. A path is evidence to consider, not permission to make an ask.',
      },
      {
        title: 'Pick the human route',
        body: 'Prefer the person with recent, relevant context and a relationship that makes the request reasonable. Record why the path is appropriate.',
      },
      {
        title: 'Write a bounded request',
        body: 'State the role or conversation, the reason you are a fit, and an easy decline. Keep the request short enough to forward unchanged.',
      },
    ],
    checklist: [
      'A real target and reason for the conversation',
      'Visible context for every relationship hop',
      'A specific, easy-to-decline request',
      'A follow-up or thank-you task',
    ],
  },
  {
    slug: 'turn-work-into-evidence',
    section: 'Career evidence',
    title: 'Turn past work into usable evidence',
    summary:
      'Capture achievement atoms that are specific enough to reuse, inspect, and tailor for a future role.',
    readingTime: '7 min',
    steps: [
      {
        title: 'Start from a project or role',
        body: 'Add the work before polishing the wording. Connect it to the team, skills, artifact, or outcome that makes the achievement inspectable.',
      },
      {
        title: 'Write the observed change',
        body: 'Describe what changed, what you did, and the evidence you have. Avoid generic responsibility statements that cannot support a later claim.',
      },
      {
        title: 'Keep provenance beside the claim',
        body: 'Attach dates, source, confidence, and linked records where the form provides them. This is how Vitae keeps a résumé from becoming a memory test.',
      },
      {
        title: 'Select evidence for the target',
        body: 'When tailoring, review the selected atoms and the role signals they answer. You keep the final choice; the selection stays visible.',
      },
    ],
    checklist: [
      'A project, role, or artifact',
      'A clear contribution and observed outcome',
      'Supporting context or source',
      'A target role or skill signal to answer',
    ],
  },
  {
    slug: 'import-with-care',
    section: 'Bring records in',
    title: 'Import records without losing their meaning',
    summary:
      'Stage LinkedIn, vCard, calendar, bookmark, and CSV data before it reaches the living record.',
    readingTime: '5 min',
    steps: [
      {
        title: 'Choose the smallest source first',
        body: 'Begin with the source most likely to create a useful next action, not the largest archive you own.',
      },
      {
        title: 'Review the staged result',
        body: 'Inspect proposed people, organizations, and fields before commit. Imports are a review queue, not an invisible background write.',
      },
      {
        title: 'Resolve identity collisions',
        body: 'Compare likely duplicates and merge only when the supporting identifiers agree. Preserve the lineage of the imported source.',
      },
      {
        title: 'Add the missing relationship',
        body: 'An imported contact becomes useful when it is connected to a role, interaction, topic, or next action you recognize.',
      },
    ],
    checklist: [
      'A copy of the source file',
      'A review of staged records',
      'Deliberate duplicate decisions',
      'A useful connection after import',
    ],
  },
  {
    slug: 'tailor-a-resume',
    section: 'Career output',
    title: 'Tailor a résumé from evidence you can inspect',
    summary:
      'Parse a role, review the evidence selection, keep the final editorial control, and compile an ATS-safe PDF.',
    readingTime: '8 min',
    steps: [
      {
        title: 'Create a target from the role description',
        body: 'Use the target workspace to capture the job details and the terms that matter. Keep the source description attached to the target.',
      },
      {
        title: 'Review the evidence ranking',
        body: 'Vitae surfaces relevant achievement atoms and role signals. Inspect the score and supporting records before accepting any selection.',
      },
      {
        title: 'Edit for truth and voice',
        body: 'Select, block, reorder, and rewrite only claims you can support. The system helps manage evidence; it does not invent professional history.',
      },
      {
        title: 'Compile and keep the output',
        body: 'Compile the selected evidence into an ATS-safe LaTeX PDF, then retain the target, selection, and output record for future revisions.',
      },
    ],
    checklist: [
      'A saved target and source role description',
      'Reviewed achievement selection',
      'Claims you can defend in conversation',
      'A compiled output linked to its target',
    ],
  },
  {
    slug: 'export-and-leave',
    section: 'Ownership',
    title: 'Export the record and leave with context intact',
    summary:
      'Create a complete export before a major change, keep the checksum manifest, and verify that your records remain readable outside Vitae.',
    readingTime: '4 min',
    steps: [
      {
        title: 'Choose a full export',
        body: 'Use the export workspace to create identity-preserving JSONL collections, a Markdown vault, and a checksum manifest.',
      },
      {
        title: 'Store the manifest with the files',
        body: 'The checksums let you verify the archive after download or transfer. Keep the export in a location you control.',
      },
      {
        title: 'Open the Markdown vault',
        body: 'Confirm that a person, project, and relationship can be read outside the product. Portability is more than a download button.',
      },
      {
        title: 'Use deletion deliberately',
        body: 'Export before deleting material records. Trash and recovery exist for ordinary mistakes; account deletion should be a conscious final action.',
      },
    ],
    checklist: [
      'JSONL collections',
      'Markdown vault',
      'Checksum manifest',
      'A verified local copy',
    ],
  },
] as const;

export function guideForSlug(slug: string | undefined): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

export type BillingPeriod = CloudIndividualBillingPeriod;

const formatPrice = (minorUnits: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: CLOUD_INDIVIDUAL_PLAN.currency,
    maximumFractionDigits: 0,
  }).format(minorUnits / 100);

const ENTITLEMENT_COPY: Record<CloudIndividualEntitlement, string> = {
  private_personal_workspace: 'One private personal workspace',
  career_system: 'Capture, relationship intelligence, career evidence, and tailoring',
  full_export: 'Full export without an upgrade tier',
  no_ads_or_usage_credits: 'No ads or usage credits',
};

const { monthly: MONTHLY_BILLING, annual: ANNUAL_BILLING } = CLOUD_INDIVIDUAL_PLAN.billing;

export const CLOUD_PLAN = {
  name: CLOUD_INDIVIDUAL_PLAN.name,
  trial: `${CLOUD_INDIVIDUAL_PLAN.trialDays}-day full trial · no card required`,
  monthly: { period: MONTHLY_BILLING.period, price: formatPrice(MONTHLY_BILLING.priceMinorUnits), suffix: '/ month' },
  annual: {
    period: ANNUAL_BILLING.period,
    price: formatPrice(ANNUAL_BILLING.priceMinorUnits),
    suffix: '/ year',
    note: `Save ${formatPrice(cloudIndividualAnnualSavingsMinorUnits())} each year`,
  },
  includes: CLOUD_INDIVIDUAL_PLAN.entitlements.map((entitlement) => ENTITLEMENT_COPY[entitlement]),
  lifecycle:
    `If you do not continue after the trial, your workspace becomes read-only with export available for ${CLOUD_INDIVIDUAL_PLAN.exportGraceDays} days.`,
} as const;
