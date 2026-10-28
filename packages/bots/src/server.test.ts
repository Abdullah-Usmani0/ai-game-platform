import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runnerScript } from './scripts.js';
import { serveDir } from './server.js';

describe('serveDir', () => {
  it('serves files from the bundle dir and refuses traversal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gg-bots-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>t</title>');
    writeFileSync(join(dir, 'game.js'), 'window.x = 1;');
    const server = await serveDir(dir);
    try {
      const index = await fetch(`${server.url}/index.html?mode=manual&seed=3`);
      expect(index.status).toBe(200);
      expect(index.headers.get('content-type')).toContain('text/html');
      const js = await fetch(`${server.url}/game.js`);
      expect(js.headers.get('content-type')).toContain('javascript');
      const missing = await fetch(`${server.url}/nope.png`);
      expect(missing.status).toBe(404);
      const traversal = await fetch(`${server.url}/..%2F..%2Fetc%2Fpasswd`);
      expect(traversal.status).toBe(404);
    } finally {
      await server.close();
    }
  });
});

describe('runnerScript', () => {
  it('holds right for the whole run and jumps periodically', () => {
    const s = runnerScript(300, 50, 10);
    expect(s[0]).toEqual({ from: 0, to: 300, input: { right: true } });
    const jumps = s.slice(1);
    expect(jumps.length).toBe(6);
    expect(jumps.every((j) => j.input.jump === true && j.to - j.from === 10)).toBe(true);
  });
});
