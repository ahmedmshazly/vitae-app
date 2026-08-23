import {
  GUIDES,
  guideForSlug,
  type Guide,
} from '../routes/marketing/MarketingContent.js';
// This registry is evaluated by Vite's Node-side static-page plugin. See the
// matching import in MarketingContent for why this stays a direct TS source
// import instead of a workspace package alias.
import {
  CLOUD_INDIVIDUAL_PLAN as SHARED_CLOUD_INDIVIDUAL_PLAN,
} from '../../../../packages/core/src/cloud/individual-plan.ts';

/**
 * The public site's one source of truth for route metadata and launch-safe
 * customer information.  It deliberately contains no user data and no
 * provider secrets, so the same registry can drive the browser, static build
 * artifacts, and tests without making public copy drift between them.
 */

export type PublicEnvironment = Readonly<Record<string, string | undefined>>;

export type PublicLaunchConfig = Readonly<{
  /** A requested launch is not enough: the public legal identity must exist. */
  cloudRequested: boolean;
  cloudEnabled: boolean;
  siteUrl: string | null;
  supportEmail: string | null;
  legalEntityName: string | null;
  legalTermsVersion: string | null;
  /** Public checkout-scoped token. It is never an API key. */
  paddleClientToken: string | null;
  missingLaunchRequirements: readonly string[];
}>;

const SITE_URL_PATTERN = /^https:\/\/[a-z0-9.-]+(?:\/[a-z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanSiteUrl(value: string | undefined): string | null {
  const candidate = clean(value)?.replace(/\/$/, '') ?? null;
  return candidate && SITE_URL_PATTERN.test(candidate) ? candidate : null;
}

function cleanPaddleClientToken(value: string | undefined): string | null {
  const candidate = clean(value);
  // Paddle client tokens are public but still need to be recognizable as a
  // checkout-scoped token. Rejecting a random value keeps an incomplete launch
  // from looking live in search or on the pricing page.
  return candidate && /^(?:test|live)_[A-Za-z0-9_-]+$/.test(candidate) ? candidate : null;
}

/**
 * A public Cloud page must stay in its safe, pre-launch state until all of
 * these values are deliberately configured.  The API has its own stricter
 * release gate; this protects the public promise from getting ahead of it.
 */
export function getPublicLaunchConfig(env: PublicEnvironment): PublicLaunchConfig {
  const cloudRequested = env.VITE_PUBLIC_CLOUD_ENABLED === 'true';
  const siteUrl = cleanSiteUrl(env.VITE_PUBLIC_SITE_URL);
  const supportEmail = clean(env.VITE_PUBLIC_SUPPORT_EMAIL);
  const legalEntityName = clean(env.VITE_PUBLIC_LEGAL_ENTITY_NAME);
  const legalTermsVersion = clean(env.VITE_PUBLIC_LEGAL_TERMS_VERSION);
  const paddleClientToken = cleanPaddleClientToken(env.VITE_PADDLE_CLIENT_TOKEN);
  const missingLaunchRequirements = [
    !siteUrl && 'VITE_PUBLIC_SITE_URL',
    (!supportEmail || !EMAIL_PATTERN.test(supportEmail)) && 'VITE_PUBLIC_SUPPORT_EMAIL',
    !legalEntityName && 'VITE_PUBLIC_LEGAL_ENTITY_NAME',
    !legalTermsVersion && 'VITE_PUBLIC_LEGAL_TERMS_VERSION',
    !paddleClientToken && 'VITE_PADDLE_CLIENT_TOKEN',
  ].filter(Boolean) as string[];

  return {
    cloudRequested,
    cloudEnabled: cloudRequested && missingLaunchRequirements.length === 0,
    siteUrl,
    supportEmail: supportEmail && EMAIL_PATTERN.test(supportEmail) ? supportEmail : null,
    legalEntityName,
    legalTermsVersion,
    paddleClientToken,
    missingLaunchRequirements,
  };
}

// Vite injects `import.meta.env` in browser modules. The same registry is also
// imported by the Node build plugin, where that property is absent.
export const publicLaunchConfig = getPublicLaunchConfig(import.meta.env ?? {});

/** Public SEO projection of the shared commercial plan, never an independent offer. */
export const CLOUD_INDIVIDUAL_PLAN = {
  name: SHARED_CLOUD_INDIVIDUAL_PLAN.name,
  monthlyUsd: SHARED_CLOUD_INDIVIDUAL_PLAN.billing.monthly.priceMinorUnits / 100,
  annualUsd: SHARED_CLOUD_INDIVIDUAL_PLAN.billing.annual.priceMinorUnits / 100,
  trialDays: SHARED_CLOUD_INDIVIDUAL_PLAN.trialDays,
  exportGraceDays: SHARED_CLOUD_INDIVIDUAL_PLAN.exportGraceDays,
};

export type PublicPageKind =
  'marketing' | 'guide-index' | 'guide' | 'legal' | 'status' | 'resource';

export type PublicMetadata = Readonly<{
  path: string;
  title: string;
  description: string;
  kind: PublicPageKind;
  indexable?: boolean;
  schema?: 'software' | 'faq' | 'howto' | 'article';
}>;

export type PublicContentBlock =
  | Readonly<{ type: 'paragraph'; text: string }>
  | Readonly<{ type: 'notice'; title: string; text: string }>
  | Readonly<{ type: 'list'; items: readonly string[] }>
  | Readonly<{ type: 'steps'; items: readonly string[] }>;

export type PublicDocument = Readonly<{
  slug: string;
  title: string;
  eyebrow: string;
  summary: string;
  blocks: readonly PublicContentBlock[];
  related?: readonly string[];
}>;

const marketingMetadata = [
  {
    path: '/',
    title: 'Vitae | Career context for your next move',
    description:
      'Keep the people, evidence, and decisions behind a career move connected in one private record.',
    kind: 'marketing',
    schema: 'software',
  },
  {
    path: '/how-it-works',
    title: 'How Vitae works | Vitae',
    description:
      'Capture context, follow the evidence, and prepare a deliberate career move with a private record you can inspect.',
    kind: 'marketing',
    schema: 'howto',
  },
  {
    path: '/product/warm-paths',
    title: 'Warm paths with visible evidence | Vitae',
    description:
      'Trace a potential introduction through the relationships you recorded, with each hop visible and explainable.',
    kind: 'marketing',
  },
  {
    path: '/product/career-evidence',
    title: 'Career evidence that stays traceable | Vitae',
    description:
      'Build role-relevant résumé material from the work evidence you already recorded, without inventing achievements.',
    kind: 'marketing',
  },
  {
    path: '/tour',
    title: 'Product tour | Vitae',
    description:
      'Take a guided look at capture, relationships, career evidence, tailoring, and export in Vitae.',
    kind: 'marketing',
  },
  {
    path: '/pricing',
    title: 'Pricing | Vitae Cloud',
    description:
      'One private Vitae Cloud workspace, transparent pricing, a 14-day trial, and export access when you need it.',
    kind: 'marketing',
    schema: 'faq',
  },
  {
    path: '/security-and-ownership',
    title: 'Security and ownership | Vitae',
    description:
      'Understand what Vitae stores, what you can export, and the release safeguards required before Vitae Cloud opens.',
    kind: 'marketing',
  },
  {
    path: '/manifesto',
    title: 'Manifesto | Vitae',
    description:
      'Vitae is built around inspectable evidence, calm action, and a record you can carry with you.',
    kind: 'marketing',
    schema: 'article',
  },
  {
    path: '/signup',
    title: 'Start your Vitae trial | Vitae',
    description: 'Create or resume your private Vitae workspace with a verified Google account.',
    kind: 'marketing',
    indexable: false,
  },
  {
    path: '/signin',
    title: 'Sign in | Vitae',
    description: 'Sign in to your private Vitae workspace.',
    kind: 'marketing',
    indexable: false,
  },
] as const satisfies readonly PublicMetadata[];

const resourceMetadata = [
  {
    path: '/resources',
    title: 'Guides and resources | Vitae',
    description:
      'Practical guides for preserving career context, building evidence, and keeping your record portable.',
    kind: 'resource',
  },
  {
    path: '/guides',
    title: 'Vitae guides | Vitae',
    description:
      'Start with a career move, capture context safely, build evidence, and export on your terms.',
    kind: 'guide-index',
  },
  {
    path: '/changelog',
    title: 'Changelog | Vitae',
    description: 'Product changes, fixes, and release notes for Vitae.',
    kind: 'resource',
  },
  {
    path: '/legal/terms',
    title: 'Terms | Vitae',
    description: 'The launch status and terms publication requirements for Vitae Cloud.',
    kind: 'legal',
    indexable: false,
  },
  {
    path: '/legal/privacy',
    title: 'Privacy | Vitae',
    description:
      'How to understand data handling for the Vitae source project and a future Cloud service.',
    kind: 'legal',
    indexable: false,
  },
  {
    path: '/legal/dpa',
    title: 'Data processing addendum | Vitae',
    description: 'The publication requirements for the Vitae Cloud data processing addendum.',
    kind: 'legal',
    indexable: false,
  },
  {
    path: '/legal/subprocessors',
    title: 'Subprocessors | Vitae',
    description: 'The pre-launch subprocessor publication requirements for Vitae Cloud.',
    kind: 'legal',
    indexable: false,
  },
  {
    path: '/status',
    title: 'Service status | Vitae',
    description: 'The public service status and launch state for Vitae Cloud.',
    kind: 'status',
    indexable: false,
  },
] as const satisfies readonly PublicMetadata[];

const guideMetadata = GUIDES.map((guide) => ({
  path: `/guides/${guide.slug}`,
  title: `${guide.title} | Vitae guide`,
  description: guide.summary,
  kind: 'guide' as const,
  schema: 'howto' as const,
}));

export const PUBLIC_METADATA: readonly PublicMetadata[] = [
  ...marketingMetadata,
  ...resourceMetadata,
  ...guideMetadata,
];

export const PUBLIC_STATIC_PATHS = PUBLIC_METADATA.filter(
  (page) => page.path !== '/signin' && page.path !== '/signup',
).map((page) => page.path);

export function publicMetadataForPath(pathname: string): PublicMetadata | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PUBLIC_METADATA.find((page) => page.path === normalized) ?? null;
}

function publicDocumentFromGuide(guide: Guide): PublicDocument {
  return {
    slug: guide.slug,
    eyebrow: guide.section,
    title: guide.title,
    summary: guide.summary,
    blocks: [
      {
        type: 'steps',
        items: guide.steps.map((step) => `${step.title}. ${step.body}`),
      },
      {
        type: 'list',
        items: guide.checklist,
      },
    ],
  };
}

export function publicGuideForSlug(slug: string | undefined): PublicDocument | null {
  const guide = guideForSlug(slug);
  return guide ? publicDocumentFromGuide(guide) : null;
}

function releaseGateBlocks(config: PublicLaunchConfig): readonly PublicContentBlock[] {
  if (config.cloudEnabled) {
    return [
      {
        type: 'notice',
        title: 'Cloud availability',
        text: 'Vitae Cloud is enabled for new private workspaces. Read the published terms and privacy information before starting a trial.',
      },
    ];
  }
  return [
    {
      type: 'notice',
      title: 'Cloud is not open yet',
      text: 'Vitae Cloud remains unavailable for new accounts until the service, support contact, legal identity, terms, privacy notice, data processing addendum, subprocessor list, backup and restore checks, and billing controls are all live and reviewed.',
    },
  ];
}

export function publicDocumentForPath(
  pathname: string,
  config: PublicLaunchConfig = publicLaunchConfig,
): PublicDocument | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const direct: Record<string, PublicDocument> = {
    '/resources': {
      slug: 'resources',
      eyebrow: 'Resources',
      title: 'Work with a career record you can inspect',
      summary:
        'Guides for the practical work around career context, evidence, relationships, and ownership.',
      blocks: [
        {
          type: 'list',
          items: [
            'Start with a career move instead of a blank workspace.',
            'Capture details while they are specific and connected.',
            'Review a warm path with the people and evidence behind it.',
            'Build a reusable record of work, then export it when needed.',
          ],
        },
      ],
      related: GUIDES.map((guide) => guide.slug),
    },
    '/guides': {
      slug: 'guides',
      eyebrow: 'Guides',
      title: 'A durable career record, one useful step at a time',
      summary:
        'Read these in the order that matches the work you are doing now. Each guide stays grounded in records you can inspect and export.',
      blocks: [
        {
          type: 'notice',
          title: 'Use only what fits',
          text: 'These guides describe supported workflows. They do not replace professional legal, financial, recruiting, or career advice.',
        },
      ],
      related: GUIDES.map((guide) => guide.slug),
    },
    '/changelog': {
      slug: 'changelog',
      eyebrow: 'Changelog',
      title: 'What changed in Vitae',
      summary:
        'Release notes live with the source so changes remain reviewable alongside the work that shipped them.',
      blocks: [
        {
          type: 'paragraph',
          text: 'The public changelog will be published here when Vitae Cloud is open. Until then, inspect the source release notes for verified changes and compatibility notes.',
        },
      ],
    },
    '/legal/terms': {
      slug: 'terms',
      eyebrow: 'Legal',
      title: 'Terms are not published for an unopened service',
      summary:
        'Vitae Cloud cannot accept subscriptions until a reviewed agreement identifies the provider, service, pricing, cancellations, refunds, governing law, and support contact.',
      blocks: releaseGateBlocks(config),
    },
    '/legal/privacy': {
      slug: 'privacy',
      eyebrow: 'Legal',
      title: 'Privacy information for Vitae',
      summary:
        'The open-source project does not currently operate a hosted data service. A Cloud privacy notice must be published and reviewed before customer data is accepted.',
      blocks: releaseGateBlocks(config),
    },
    '/legal/dpa': {
      slug: 'dpa',
      eyebrow: 'Legal',
      title: 'Data processing addendum publication',
      summary:
        'A Cloud data processing addendum must identify the controller, processor, processing purpose, retention, security commitments, and customer rights before the service opens.',
      blocks: releaseGateBlocks(config),
    },
    '/legal/subprocessors': {
      slug: 'subprocessors',
      eyebrow: 'Legal',
      title: 'Subprocessor publication',
      summary:
        'A complete, current list of Cloud subprocessors must be published before customer data is accepted and must be kept current when the service changes.',
      blocks: releaseGateBlocks(config),
    },
    '/status': {
      slug: 'status',
      eyebrow: 'Service status',
      title: config.cloudEnabled
        ? 'Vitae Cloud service status'
        : 'Vitae Cloud is not open for customer accounts',
      summary: config.cloudEnabled
        ? 'Status reporting is enabled. Check this page for current service incidents and scheduled maintenance.'
        : 'There is no public Cloud service to report on yet. The source project remains separately available for development and review.',
      blocks: releaseGateBlocks(config),
    },
  };

  return direct[normalized] ?? null;
}

export function publicRoutePathsForSitemap(config: PublicLaunchConfig): readonly string[] {
  if (!config.cloudEnabled || !config.siteUrl) return [];
  return PUBLIC_METADATA.filter((page) => page.indexable !== false).map((page) => page.path);
}
