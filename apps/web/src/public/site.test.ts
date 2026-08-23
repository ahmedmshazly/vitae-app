import { describe, expect, it } from 'vitest';
import { CLOUD_PLAN } from '../routes/marketing/MarketingContent.js';
import {
  CLOUD_INDIVIDUAL_PLAN,
  getPublicLaunchConfig,
  publicDocumentForPath,
  publicGuideForSlug,
  publicMetadataForPath,
  publicRoutePathsForSitemap,
} from './site.js';

const liveEnvironment = {
  VITE_PUBLIC_CLOUD_ENABLED: 'true',
  VITE_PUBLIC_SITE_URL: 'https://vitae.example.com',
  VITE_PUBLIC_SUPPORT_EMAIL: 'support@vitae.example.com',
  VITE_PUBLIC_LEGAL_ENTITY_NAME: 'Vitae Example, Inc.',
  VITE_PUBLIC_LEGAL_TERMS_VERSION: '2026-08-23',
  VITE_PADDLE_CLIENT_TOKEN: 'test_public_checkout_token',
};

describe('public launch registry', () => {
  it('keeps Cloud unavailable when the public legal configuration is incomplete', () => {
    const launch = getPublicLaunchConfig({ VITE_PUBLIC_CLOUD_ENABLED: 'true' });

    expect(launch.cloudRequested).toBe(true);
    expect(launch.cloudEnabled).toBe(false);
    expect(launch.missingLaunchRequirements).toContain('VITE_PUBLIC_SITE_URL');
    expect(launch.missingLaunchRequirements).toContain('VITE_PADDLE_CLIENT_TOKEN');
    expect(publicRoutePathsForSitemap(launch)).toEqual([]);
  });

  it('enables public metadata only with a deliberate complete launch configuration', () => {
    const launch = getPublicLaunchConfig(liveEnvironment);

    expect(launch.cloudEnabled).toBe(true);
    expect(launch.siteUrl).toBe('https://vitae.example.com');
    expect(publicRoutePathsForSitemap(launch)).toContain('/pricing');
    expect(publicRoutePathsForSitemap(launch)).not.toContain('/signin');
  });

  it('derives the public guide surface from the marketing editorial registry', () => {
    const guide = publicGuideForSlug('first-career-record');

    expect(guide?.title).toBe('Build the first useful career record');
    expect(guide?.blocks.at(0)).toMatchObject({ type: 'steps' });
    expect(publicGuideForSlug('start-a-career-move')).toBeNull();
  });

  it('keeps pricing data aligned with the visible Cloud plan', () => {
    expect(CLOUD_INDIVIDUAL_PLAN.name).toBe(CLOUD_PLAN.name);
    expect(CLOUD_INDIVIDUAL_PLAN.monthlyUsd).toBe(24);
    expect(CLOUD_INDIVIDUAL_PLAN.annualUsd).toBe(216);
  });

  it('renders legal pages as a pre-launch gate by default', () => {
    const terms = publicDocumentForPath('/legal/terms', getPublicLaunchConfig({}));

    expect(terms?.title).toMatch(/not published/i);
    expect(JSON.stringify(terms)).toMatch(/not open yet/i);
  });

  it('keeps all public route metadata addressable', () => {
    expect(publicMetadataForPath('/pricing')?.schema).toBe('faq');
    expect(publicMetadataForPath('/guides/tailor-a-resume')?.kind).toBe('guide');
    expect(publicMetadataForPath('/unknown')).toBeNull();
  });
});
