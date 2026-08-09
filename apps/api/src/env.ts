/**
 * Load `.env` from the repo root and expose the validated server environment.
 * Importing this module has the side effect of populating `process.env`.
 */
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadServerEnv } from '@vitae/config/env';

const here = dirname(fileURLToPath(import.meta.url));
// apps/api/src → repo root is three levels up.
loadDotenv({ path: resolve(here, '../../../.env') });

export const env = loadServerEnv();
