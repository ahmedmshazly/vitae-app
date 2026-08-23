/**
 * Browser-only Paddle boundary.
 *
 * The API creates a transaction from its server-owned price catalog. This
 * module receives only that opaque transaction ID and a public Paddle client
 * token; it never receives a price, customer identifier, or entitlement.
 */
import type { Paddle } from '@paddle/paddle-js';

type PaddleConfiguration = {
  token: string;
  environment: 'sandbox' | 'production';
};

function paddleConfiguration(): PaddleConfiguration | null {
  const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN?.trim();
  if (!token) return null;

  // Paddle test tokens are sandbox-only. A live token is deliberately the
  // only way a production build can open a production checkout.
  return { token, environment: token.startsWith('test_') ? 'sandbox' : 'production' };
}

let paddlePromise: Promise<Paddle> | null = null;

/** True only when the build has the public, checkout-scoped Paddle token. */
export function paddleCheckoutReady(): boolean {
  return paddleConfiguration() !== null;
}

async function getPaddle(): Promise<Paddle> {
  const configuration = paddleConfiguration();
  if (!configuration) {
    throw new Error('Secure checkout is not configured for this build yet.');
  }

  if (!paddlePromise) {
    paddlePromise = import('@paddle/paddle-js')
      .then(async ({ initializePaddle }) => {
        const paddle = await initializePaddle({
          token: configuration.token,
          environment: configuration.environment,
          checkout: {
            settings: {
              displayMode: 'overlay',
              theme: 'dark',
            },
          },
        });
        if (!paddle) throw new Error('Secure checkout could not start. Try again shortly.');
        return paddle;
      })
      .catch((error: unknown) => {
        // A failed CDN load must be retryable after connectivity/CSP is fixed;
        // do not permanently cache an unavailable checkout instance.
        paddlePromise = null;
        throw error;
      });
  }

  return paddlePromise;
}

/** Open a provider-hosted checkout for an API-created transaction. */
export async function openPaddleCheckout(transactionId: string): Promise<void> {
  const paddle = await getPaddle();
  paddle.Checkout.open({
    transactionId,
    settings: {
      displayMode: 'overlay',
      theme: 'dark',
      successUrl: `${window.location.origin}/settings/billing?checkout=completed`,
    },
  });
}
