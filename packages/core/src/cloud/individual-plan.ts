/**
 * Commercial terms for the hosted Individual plan.
 *
 * Prices, billing intervals, and lifecycle durations live here so the API
 * enforces the same offer that the public product surface describes. Provider
 * price identifiers remain deployment configuration because they are secrets
 * of a particular Paddle catalog, not commercial terms.
 */

export const CLOUD_INDIVIDUAL_BILLING_PERIODS = ['monthly', 'annual'] as const;

export type CloudIndividualBillingPeriod = (typeof CLOUD_INDIVIDUAL_BILLING_PERIODS)[number];

export const CLOUD_INDIVIDUAL_ENTITLEMENTS = [
  'private_personal_workspace',
  'career_system',
  'full_export',
  'no_ads_or_usage_credits',
] as const;

export type CloudIndividualEntitlement = (typeof CLOUD_INDIVIDUAL_ENTITLEMENTS)[number];

export interface CloudIndividualPlan {
  readonly code: 'cloud_individual';
  readonly name: string;
  readonly currency: 'USD';
  readonly trialDays: number;
  readonly paymentGraceDays: number;
  readonly exportGraceDays: number;
  readonly billing: Readonly<
    Record<
      CloudIndividualBillingPeriod,
      Readonly<{
        period: CloudIndividualBillingPeriod;
        priceMinorUnits: number;
        intervalMonths: number;
      }>
    >
  >;
  readonly entitlements: readonly CloudIndividualEntitlement[];
}

/**
 * The one-person hosted plan. Keep this compact and policy-oriented: UI copy
 * belongs to the surface that presents it, while access guarantees stay
 * available to both the browser and the API.
 */
export const CLOUD_INDIVIDUAL_PLAN = {
  code: 'cloud_individual',
  name: 'Vitae Cloud Individual',
  currency: 'USD',
  trialDays: 14,
  paymentGraceDays: 7,
  exportGraceDays: 30,
  billing: {
    monthly: { period: 'monthly', priceMinorUnits: 2400, intervalMonths: 1 },
    annual: { period: 'annual', priceMinorUnits: 21600, intervalMonths: 12 },
  },
  entitlements: CLOUD_INDIVIDUAL_ENTITLEMENTS,
} as const satisfies CloudIndividualPlan;

export function isCloudIndividualBillingPeriod(value: unknown): value is CloudIndividualBillingPeriod {
  return typeof value === 'string' && (CLOUD_INDIVIDUAL_BILLING_PERIODS as readonly string[]).includes(value);
}

/** The savings from paying for the annual interval instead of twelve monthly intervals. */
export function cloudIndividualAnnualSavingsMinorUnits(): number {
  const { monthly, annual } = CLOUD_INDIVIDUAL_PLAN.billing;
  return monthly.priceMinorUnits * annual.intervalMonths - annual.priceMinorUnits;
}
