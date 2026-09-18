import {
  CLOUD_INDIVIDUAL_PLAN,
  type PublicLaunchConfig,
  type PublicMetadata,
  publicDocumentForPath,
  publicGuideForSlug,
  publicRoutePathsForSitemap,
} from './site.js';

const SOCIAL_IMAGE_PATH = '/social-card.svg';

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case "'":
        return '&#39;';
      case '"':
        return '&quot;';
      default:
        return character;
    }
  });
}

function escapeXml(value: string): string {
  return escapeHtml(value);
}

export function absolutePublicUrl(siteUrl: string | null, path: string): string | null {
  if (!siteUrl) return null;
  return path === '/' ? `${siteUrl}/` : `${siteUrl}${path}`;
}

function pageRobots(page: PublicMetadata, launch: PublicLaunchConfig): string {
  return launch.cloudEnabled && page.indexable !== false ? 'index,follow' : 'noindex,nofollow';
}

function structuredData(
  page: PublicMetadata,
  launch: PublicLaunchConfig,
): Record<string, unknown> | null {
  const url = absolutePublicUrl(launch.siteUrl, page.path);
  if (!launch.cloudEnabled || !url) return null;

  if (page.schema === 'software') {
    return {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Vitae Cloud',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: page.description,
      url,
      offers: {
        '@type': 'Offer',
        price: String(CLOUD_INDIVIDUAL_PLAN.monthlyUsd),
        priceCurrency: 'USD',
        description: `${CLOUD_INDIVIDUAL_PLAN.name}, billed monthly.`,
      },
    };
  }

  if (page.schema === 'faq' && page.path === '/pricing') {
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Is there a trial?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: `Yes. Vitae Cloud Individual includes a ${CLOUD_INDIVIDUAL_PLAN.trialDays}-day full trial without a card.`,
          },
        },
        {
          '@type': 'Question',
          name: 'What happens if I do not subscribe after the trial?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: `The workspace becomes read-only and remains exportable for ${CLOUD_INDIVIDUAL_PLAN.exportGraceDays} days before scheduled deletion notices apply.`,
          },
        },
      ],
    };
  }

  if (page.schema === 'howto') {
    return {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: page.title.replace(' | Vitae', ''),
      description: page.description,
      url,
    };
  }

  if (page.schema === 'article') {
    return {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: page.title.replace(' | Vitae', ''),
      description: page.description,
      mainEntityOfPage: url,
    };
  }

  return null;
}

export function publicHeadMarkup(page: PublicMetadata, launch: PublicLaunchConfig): string {
  const canonical = absolutePublicUrl(launch.siteUrl, page.path);
  const socialImage = absolutePublicUrl(launch.siteUrl, SOCIAL_IMAGE_PATH);
  const jsonLd = structuredData(page, launch);
  const tags = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta data-vitae-public-seo name="description" content="${escapeHtml(page.description)}" />`,
    `<meta data-vitae-public-seo name="robots" content="${pageRobots(page, launch)}" />`,
    '<meta data-vitae-public-seo name="theme-color" content="#f7f4ed" />',
  ];

  if (canonical) {
    tags.push(`<link data-vitae-public-seo rel="canonical" href="${escapeHtml(canonical)}" />`);
    tags.push('<meta data-vitae-public-seo property="og:type" content="website" />');
    tags.push(
      `<meta data-vitae-public-seo property="og:title" content="${escapeHtml(page.title)}" />`,
    );
    tags.push(
      `<meta data-vitae-public-seo property="og:description" content="${escapeHtml(page.description)}" />`,
    );
    tags.push(
      `<meta data-vitae-public-seo property="og:url" content="${escapeHtml(canonical)}" />`,
    );
    tags.push('<meta data-vitae-public-seo name="twitter:card" content="summary_large_image" />');
    tags.push(
      `<meta data-vitae-public-seo name="twitter:title" content="${escapeHtml(page.title)}" />`,
    );
    tags.push(
      `<meta data-vitae-public-seo name="twitter:description" content="${escapeHtml(page.description)}" />`,
    );
  }
  if (socialImage) {
    tags.push(
      `<meta data-vitae-public-seo property="og:image" content="${escapeHtml(socialImage)}" />`,
    );
    tags.push(
      '<meta data-vitae-public-seo property="og:image:alt" content="Vitae, a private career record" />',
    );
    tags.push(
      `<meta data-vitae-public-seo name="twitter:image" content="${escapeHtml(socialImage)}" />`,
    );
  }
  if (jsonLd) {
    // JSON-LD comes from typed local metadata, never untrusted content.
    tags.push(
      `<script data-vitae-public-seo type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`,
    );
  }

  return `<!-- public-seo:start -->\n    ${tags.join('\n    ')}\n    <!-- public-seo:end -->`;
}

const SEO_BLOCK = /<!-- public-seo:start -->[\s\S]*?<!-- public-seo:end -->/;

/** Replace the durable marker in the Vite shell without changing its JS entry. */
export function withPublicHead(
  html: string,
  page: PublicMetadata,
  launch: PublicLaunchConfig,
): string {
  const head = publicHeadMarkup(page, launch);
  if (SEO_BLOCK.test(html)) return html.replace(SEO_BLOCK, head);
  return html.replace('</head>', `    ${head}\n  </head>`);
}

export function robotsTxt(launch: PublicLaunchConfig): string {
  if (!launch.cloudEnabled || !launch.siteUrl) {
    return 'User-agent: *\nDisallow: /\n';
  }
  return `User-agent: *\nAllow: /\n\nSitemap: ${launch.siteUrl}/sitemap.xml\n`;
}

/** Every indexable public URL. */
export function sitemapXml(launch: PublicLaunchConfig): string {
  const urls = publicRoutePathsForSitemap(launch);
  const entries = urls
    .map((path) => absolutePublicUrl(launch.siteUrl, path))
    .filter((url): url is string => url !== null)
    .map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries ? `\n${entries}\n` : ''}</urlset>\n`;
}

export function webManifest(): string {
  return `${JSON.stringify(
    {
      name: 'Vitae',
      short_name: 'Vitae',
      description: 'A private career record for deliberate next moves.',
      start_url: '/',
      display: 'standalone',
      background_color: '#f7f4ed',
      theme_color: '#f7f4ed',
      icons: [
        { src: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
        { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      ],
    },
    null,
    2,
  )}\n`;
}

/**
 * The Vite app remains a client-rendered workspace, but public URLs ship a
 * compact semantic first document so crawlers and no-JS visitors do not meet
 * an empty root. React replaces this static snapshot on bootstrap.
 */
export function staticPublicBody(page: PublicMetadata, launch: PublicLaunchConfig): string {
  const guideSlug = page.path.startsWith('/guides/')
    ? page.path.slice('/guides/'.length)
    : undefined;
  const document = publicDocumentForPath(page.path, launch) ?? publicGuideForSlug(guideSlug);
  const blocks =
    document?.blocks
      .map((block) => {
        if (block.type === 'paragraph') return `<p>${escapeHtml(block.text)}</p>`;
        if (block.type === 'notice') {
          return `<aside aria-label="${escapeHtml(block.title)}"><h2>${escapeHtml(block.title)}</h2><p>${escapeHtml(block.text)}</p></aside>`;
        }
        const list = block.type === 'steps' ? 'ol' : 'ul';
        return `<${list}>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</${list}>`;
      })
      .join('') ?? '';
  const related = document?.related?.length
    ? `<nav aria-label="Related guides"><ul>${document.related
        .map(
          (slug) =>
            `<li><a href="/guides/${encodeURIComponent(slug)}">Continue with this guide</a></li>`,
        )
        .join('')}</ul></nav>`
    : '';
  const action =
    page.path === '/' || page.path === '/pricing'
      ? `<p><a href="${launch.cloudEnabled ? '/signup' : '/tour'}">${launch.cloudEnabled ? 'Start a 14-day trial' : 'Take the tour'}</a></p>`
      : '';

  const fallbackTitle = page.title.split(' | ')[0] ?? page.title;
  return `<main id="main-content" data-vitae-static-public-page="${escapeHtml(page.path)}"><header><h1>${escapeHtml(document?.title ?? fallbackTitle)}</h1><p>${escapeHtml(document?.summary ?? page.description)}</p></header>${blocks}${related}${action}</main>`;
}

/** Update metadata for client-side navigation after the static first paint. */
export function applyPublicMetadata(page: PublicMetadata, launch: PublicLaunchConfig): void {
  if (typeof document === 'undefined') return;
  document.title = page.title;
  const scratch = document.createElement('template');
  scratch.innerHTML = publicHeadMarkup(page, launch);
  const current = document.head.querySelectorAll('[data-vitae-public-seo]');
  current.forEach((node) => node.remove());
  Array.from(scratch.content.children).forEach((node) => {
    if (node.tagName === 'TITLE') return;
    node.setAttribute('data-vitae-public-seo', '');
    document.head.append(node);
  });
}
