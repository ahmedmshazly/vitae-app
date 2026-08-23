/**
 * Public conversion controls must never promise a checkout before the launch
 * registry says that legal, support, and site configuration are complete.
 */
import type { MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { publicLaunchConfig } from '../../public/site.js';
import type { BillingPeriod } from './MarketingContent.js';

export function CloudAction({
  className,
  period,
  children = 'Start 14-day trial',
  fallbackChildren = 'Take the product tour',
  fallbackTo = '/tour',
  onClick,
}: {
  className: string;
  period?: BillingPeriod;
  children?: ReactNode;
  fallbackChildren?: ReactNode;
  fallbackTo?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const cloudEnabled = publicLaunchConfig.cloudEnabled;
  const to = cloudEnabled ? `/signup${period ? `?period=${period}` : ''}` : fallbackTo;

  return (
    <Link className={className} to={to} onClick={onClick}>
      {cloudEnabled ? children : fallbackChildren}
    </Link>
  );
}

export function cloudSignupCopy(): string {
  return publicLaunchConfig.cloudEnabled ? 'Start 14-day trial' : 'Take the product tour';
}
