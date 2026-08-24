import { describe, expect, it } from 'vitest';
import { getPublicLaunchConfig, publicMetadataForPath } from './site.js';
import {
  absolutePublicUrl,
  applyPublicMetadata,
  publicHeadMarkup,
  robotsTxt,
  sitemapXml,
  staticPublicBody,
  webManifest,
  withPublicHead,
} from './seo.js';

const liveLaunch = getPublicLaunchConfig({
  VITE_PUBLIC_CLOUD_ENABLED: 'true',
  VITE_PUBLIC_SITE_URL: 'https://vitae.example.com',
  VITE_PUBLIC_SUPPORT_EMAIL: 'support@vitae.example.com',
  VITE_PUBLIC_LEGAL_ENTITY_NAME: 'Vitae Example, Inc.',
  VITE_PUBLIC_LEGAL_TERMS_VERSION: '2026-08-23',
  VITE_PADDLE_CLIENT_TOKEN: 'test_public_checkout_token',
});

describe('public SEO artifacts', () => {
  it('forms canonical URLs without a doubled root slash', () => {
    expect(absolutePublicUrl('https://vitae.example.com', '/')).toBe('https://vitae.example.com/');
    expect(absolutePublicUrl('https://vitae.example.com', '/pricing')).toBe(
      'https://vitae.example.com/pricing',
    );
  });

  it('uses a safe noindex posture before Cloud is open', () => {
    const pricing = publicMetadataForPath('/pricing')!;

    expect(publicHeadMarkup(pricing, getPublicLaunchConfig({}))).toContain(
      'name="robots" content="noindex,nofollow"',
    );
    expect(robotsTxt(getPublicLaunchConfig({}))).toBe('User-agent: *\nDisallow: /\n');
  });

  it('emits canonical, social, and structured data only for a configured launch', () => {
    const pricing = publicMetadataForPath('/pricing')!;
    const markup = publicHeadMarkup(pricing, liveLaunch);

    expect(markup).toContain('rel="canonical" href="https://vitae.example.com/pricing"');
    expect(markup).toContain('property="og:image"');
    expect(markup).toContain('FAQPage');
    expect(markup).toContain('name="robots" content="index,follow"');
  });

  it('writes an indexable sitemap only after the launch gate opens', () => {
    const sitemap = sitemapXml(liveLaunch);

    expect(sitemap).toContain('<loc>https://vitae.example.com/pricing</loc>');
    expect(sitemap).not.toContain('/signin');
    expect(robotsTxt(liveLaunch)).toContain('Sitemap: https://vitae.example.com/sitemap.xml');
  });

  it('replaces the SEO marker and includes semantic static public text', () => {
    const home = publicMetadataForPath('/')!;
    const html = withPublicHead(
      '<html><head><!-- public-seo:start -->old<!-- public-seo:end --></head><body><div id="root"></div></body></html>',
      home,
      liveLaunch,
    );

    expect(html).toContain('Career context for your next move');
    expect(staticPublicBody(home, liveLaunch)).toContain('Start a 14-day trial');
  });

  it('includes the guide content in a guide static entry', () => {
    const guide = publicMetadataForPath('/guides/first-career-record')!;

    expect(staticPublicBody(guide, liveLaunch)).toContain('Name the next move');
  });

  it('keeps the installed web manifest local and standalone', () => {
    const manifest = JSON.parse(webManifest()) as { start_url: string; display: string };
    expect(manifest).toMatchObject({ start_url: '/', display: 'standalone' });
  });

  it('replaces public metadata during client-side navigation instead of duplicating it', () => {
    const originalHead = document.head.innerHTML;
    try {
      document.head.innerHTML = publicHeadMarkup(publicMetadataForPath('/')!, liveLaunch);
      applyPublicMetadata(publicMetadataForPath('/pricing')!, liveLaunch);

      expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
      expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
      expect(document.title).toBe('Pricing | Vitae Cloud');
    } finally {
      document.head.innerHTML = originalHead;
    }
  });
});
