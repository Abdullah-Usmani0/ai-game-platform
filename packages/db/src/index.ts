export * from './types';
export * from './ranking';
export * from './file-store';
export * from './supabase-store';

import { FileStore } from './file-store';
import { SupabaseStore } from './supabase-store';
import type { Store } from './types';

/** Supabase when credentials are present, otherwise a local file store under GG_STORE_DIR (default .gg-store). */
export function storeFromEnv(env: NodeJS.ProcessEnv = process.env): Store {
  if (env['SUPABASE_URL'] && env['SUPABASE_SERVICE_ROLE_KEY']) return SupabaseStore.fromEnv(env);
  return new FileStore(env['GG_STORE_DIR'] ?? '.gg-store');
}
