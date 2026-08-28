/** One transparent hosted plan. Checkout itself stays server-authoritative. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Glyph } from '@vitae/ui';
import { publicLaunchConfig } from '../../public/site.js';
import { CLOUD_PLAN, type BillingPeriod } from './MarketingContent.js';
import { MarketingShell } from './Chrome.js';
import { CloudAction } from './CloudAction.js';

export function priceForBillingPeriod(period: 'annual'): typeof CLOUD_PLAN.annual;
export function priceForBillingPeriod(period: 'monthly'): typeof CLOUD_PLAN.monthly;
export function priceForBillingPeriod(
  period: BillingPeriod,
): typeof CLOUD_PLAN.annual | typeof CLOUD_PLAN.monthly;
export function priceForBillingPeriod(period: BillingPeriod): typeof CLOUD_PLAN.annual | typeof CLOUD_PLAN.monthly {
  return period === 'annual' ? CLOUD_PLAN.annual : CLOUD_PLAN.monthly;
}

export function Pricing() {
  const [period, setPeriod] = useState<BillingPeriod>('annual');
  const price = priceForBillingPeriod(period);
  const cloudEnabled = publicLaunchConfig.cloudEnabled;

  return (
    <MarketingShell>
      <section className="mk-page-hero mk-page-hero--center" aria-labelledby="pricing-heading">
        <div className="mk__inner">
          <h1 id="pricing-heading">One plan for the career record you want to keep.</h1>
          <p>
            Vitae Cloud Individual gives one person the complete career system: relationship context,
            evidence-led career output, and a real export path without an upgrade maze.
          </p>
        </div>
      </section>

      <section className="mk-pricing" aria-labelledby="plan-heading">
        <div className="mk__inner">
          <div className="mk-pricing__plan">
            <div className="mk-pricing__lead">
              <p>{CLOUD_PLAN.name}</p>
              <h2 id="plan-heading">Private, full-access, and built for one person.</h2>
              <span>{cloudEnabled ? CLOUD_PLAN.trial : 'Planned launch offer · Cloud access is not open for customer accounts yet.'}</span>
            </div>
            <div className="mk-pricing__purchase">
              <fieldset className="mk-period-picker">
                <legend>Billing period</legend>
                <label className={period === 'annual' ? 'mk-period-picker__option mk-period-picker__option--selected' : 'mk-period-picker__option'}>
                  <input
                    type="radio"
                    name="billing-period"
                    value="annual"
                    checked={period === 'annual'}
                    onChange={() => setPeriod('annual')}
                  />
                  <span>Annual</span>
                  <small>Save $72</small>
                </label>
                <label className={period === 'monthly' ? 'mk-period-picker__option mk-period-picker__option--selected' : 'mk-period-picker__option'}>
                  <input
                    type="radio"
                    name="billing-period"
                    value="monthly"
                    checked={period === 'monthly'}
                    onChange={() => setPeriod('monthly')}
                  />
                  <span>Monthly</span>
                </label>
              </fieldset>
              <div className="mk-pricing__amount" aria-live="polite">
                <strong>{price.price}</strong>
                <span>{price.suffix}</span>
                {'note' in price && <small>{price.note}</small>}
              </div>
              <CloudAction className="mk-action mk-action--primary mk-action--lg" period={period} />
              <p>
                {cloudEnabled
                  ? 'No card required to begin. Billing starts only if you choose to continue.'
                  : 'Cloud signup and checkout stay unavailable until Vitae publishes its launch requirements.'}
              </p>
            </div>
            <div className="mk-pricing__includes">
              <h3>Included from day one</h3>
              <ul>
                {CLOUD_PLAN.includes.map((item) => (
                  <li key={item}><Glyph name="check" size={16} /> {item}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mk-pricing__lifecycle">
            {cloudEnabled
              ? CLOUD_PLAN.lifecycle
              : 'At launch, the intended lifecycle is a 14-day no-card trial, then read-only access with export available for 30 days if you do not continue.'}
          </p>
        </div>
      </section>

      <section className="mk-section" aria-labelledby="pricing-fit-heading">
        <div className="mk__inner mk-boundary">
          <div>
            <h2 id="pricing-fit-heading">Built for the person carrying the career story.</h2>
            <p>
              Vitae Cloud Individual is for an experienced professional who wants a dependable record
              before a career move, not a recruiter seat, a sales CRM, a shared company workspace, or a social network.
            </p>
          </div>
          <ul aria-label="Plan boundaries">
            <li><strong>One personal workspace</strong><span>Your people, work, evidence, and outputs remain in one private career record.</span></li>
            <li><strong>No contacts or output credits</strong><span>The plan does not turn relationship context or export into a metered feature.</span></li>
            <li><strong>No team collaboration</strong><span>Shared workspaces and recruiting workflows are intentionally outside this launch scope.</span></li>
          </ul>
        </div>
      </section>

      <section className="mk-section mk-section--inset" aria-labelledby="pricing-questions-heading">
        <div className="mk__inner mk-faq-layout">
          <div className="mk-section__intro">
            <h2 id="pricing-questions-heading">Pricing should not hide the exit.</h2>
          </div>
          <div className="mk-faq">
            <details>
              <summary>{cloudEnabled ? 'What happens when the 14-day trial ends?' : 'What is planned for the 14-day trial?'}</summary>
              <p>
                {cloudEnabled
                  ? 'If you do not continue, the workspace becomes read-only and retains a full export path for 30 days. You are not silently charged at the end of the trial.'
                  : 'The intended launch model is a full 14-day trial with no card. If a person does not continue, their workspace should become read-only and retain a full export path for 30 days.'}
              </p>
            </details>
            <details>
              <summary>Can I cancel a paid subscription?</summary>
              <p>
                {cloudEnabled
                  ? 'Yes. Cancellation keeps the workspace available through the paid period, then follows the read-only export window. Billing management is available from account settings.'
                  : 'At launch, cancellation is intended to keep the workspace available through the paid period before the read-only export window begins.'}
              </p>
            </details>
            <details>
              <summary>Do I lose exports unless I pay more?</summary>
              <p>
                No. Full export is included in the only plan. Your archive includes JSONL collections, a Markdown vault,
                and a checksum manifest.
              </p>
            </details>
            <details>
              <summary>Can a company buy seats for a team?</summary>
              <p>
                Not at launch. Vitae Cloud Individual is intentionally designed around one private career workspace.
              </p>
            </details>
          </div>
        </div>
      </section>

      <section className="mk-closing" aria-labelledby="pricing-closing-heading">
        <div className="mk__inner mk-closing__layout">
          <div>
            <h2 id="pricing-closing-heading">
              {cloudEnabled
                ? 'Try the full career record before you decide to keep it.'
                : 'See the full career record before Cloud opens.'}
            </h2>
            <p>
              {cloudEnabled
                ? 'Fourteen days, no card, and a clear path to export if Vitae is not right for you.'
                : 'Explore the product tour and ownership model. Signup and checkout remain unavailable until the hosted service is ready.'}
            </p>
          </div>
          <div className="mk-closing__actions">
            <CloudAction className="mk-action mk-action--primary mk-action--lg" period={period} />
            <Link className="mk-action mk-action--lg" to="/security-and-ownership">Read ownership details</Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
