import { resolve } from 'node:path';
import { FileStore, storeFromEnv, type Store } from '@gg/db';

let store: Store | null = null;

/** The platform store: Supabase when configured, else the repo's local file store (shared with the worker CLI). */
export function getStore(): Store {
  if (!store) store = storeFromEnv({ ...process.env, GG_STORE_DIR: process.env['GG_STORE_DIR'] ?? resolve(process.cwd(), '../../.gg-store') });
  return store;
}

export function isFileStore(s: Store = getStore()): s is FileStore {
  return s instanceof FileStore;
}

/** Public URL prefix of a version's bundle directory (index.html, game.js, thumbnail.png live under it). */
export function bundleBaseUrl(bundlePath: string | null): string | null {
  if (!bundlePath) return null;
  if (isFileStore()) return `/b/${bundlePath}`;
  const base = process.env['SUPABASE_URL'] ?? process.env['NEXT_PUBLIC_SUPABASE_URL'];
  return base ? `${base.replace(/\/$/, '')}/storage/v1/object/public/${bundlePath}` : null;
}

export const OWNER_ID = process.env['GG_DEV_USER'] ?? 'local-dev';
