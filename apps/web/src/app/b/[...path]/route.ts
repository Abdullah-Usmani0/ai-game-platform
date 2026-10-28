import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { getStore, isFileStore } from '@/lib/store';

const TYPES: Record<string, string> = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', json: 'application/json', png: 'image/png', md: 'text/markdown; charset=utf-8' };

/** Serves objects of the local file store (bundles, screenshots) in development; production bundles come from the CDN. */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const store = getStore();
  if (!isFileStore(store)) return new Response('not a file store', { status: 404 });
  const { path } = await ctx.params;
  if (!path?.length || path.some((p) => p === '..' || p.includes('\\'))) return new Response('bad path', { status: 400 });
  const [bucket, ...rest] = path;
  const root = resolve(store.objectPath(bucket!, ''));
  const file = resolve(store.objectPath(bucket!, rest.join('/')));
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return new Response('not found', { status: 404 });
  const ext = file.slice(file.lastIndexOf('.') + 1);
  return new Response(new Uint8Array(readFileSync(file)), { headers: { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable' } });
}
