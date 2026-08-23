/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_USE_EMULATOR: string;
  readonly VITE_PUBLIC_REPOSITORY_URL?: string;
  readonly VITE_PUBLIC_CLOUD_ENABLED?: string;
  readonly VITE_PUBLIC_SITE_URL?: string;
  readonly VITE_PUBLIC_SUPPORT_EMAIL?: string;
  readonly VITE_PUBLIC_LEGAL_ENTITY_NAME?: string;
  readonly VITE_PUBLIC_LEGAL_TERMS_VERSION?: string;
  /** Public Paddle client token, scoped to checkout only. Never use an API key here. */
  readonly VITE_PADDLE_CLIENT_TOKEN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url' {
  const url: string;
  export default url;
}
