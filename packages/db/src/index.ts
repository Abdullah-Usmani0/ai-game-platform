export * from './types.js';
export * from './file-store.js';
export * from './supabase-store.js';

import { FileStore } from './file-store.js';
import { SupabaseStore } from './supabase-store.js';
import type { Store } from './types.js';

/** Supabase when credentials are present, otherwise a local file store under GG_STORE_DIR (default .gg-store). */
export function storeFromEnv(env: NodeJS.ProcessEnv = process.env): Store {
  if (env['SUPABASE_URL'] && env['SUPABASE_SERVICE_ROLE_KEY']) return SupabaseStore.fromEnv(env);
  return new FileStore(env['GG_STORE_DIR'] ?? '.gg-store');
}
