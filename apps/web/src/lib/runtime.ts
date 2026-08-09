const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.toLocaleLowerCase());
}

/**
 * Build flags are not a sufficient security boundary: a local `.env` can
 * accidentally make a production build look like development. Developer-only
 * browser behavior therefore requires both Vite's DEV flag and a loopback URL.
 */
export const isLocalDeveloperRuntime =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  isLoopbackHostname(window.location.hostname);
