import test from 'node:test';
import assert from 'node:assert/strict';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { glueTsConfig } from './plugin-gg.js';

function lint(code) {
  const linter = new Linter({ configType: 'flat' });
  const config = [
    { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
    glueTsConfig(['**/*.ts']),
  ];
  return linter.verify(code, config, 'sim/system.ts').map((m) => m.ruleId);
}

test('clean GlueTS passes', () => {
  const code = `import { defineSystem } from '@gg/sdk';
export const sys = defineSystem({ id: 'x', init: () => ({ n: 0 }), fixedUpdate: (s, i, ctx) => { s.n += ctx.rng.int(3); } });`;
  assert.deepEqual(lint(code), []);
});

test('flags Math.random, Date.now, setTimeout, window', () => {
  const code = `export const f = () => { const a = Math.random(); const b = Date.now(); setTimeout(() => {}, 1); return window.x + a + b; };`;
  const ids = lint(code);
  assert.ok(ids.includes('gg/no-nondeterminism'));
  assert.ok(ids.includes('gg/no-host-globals'));
});

test('flags async, phaser import, module let, class, this', () => {
  const code = `import Phaser from 'phaser';
let counter = 0;
class Foo { run() { return this; } }
export async function g() { await Promise.resolve(1); counter++; return new Foo(); }`;
  const ids = lint(code);
  assert.ok(ids.includes('gg/no-engine-import'));
  assert.ok(ids.includes('gg/no-async'));
  assert.ok(ids.includes('gg/no-module-state'));
});

function lintMessages(code) {
  const linter = new Linter({ configType: 'flat' });
  const config = [
    { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
    glueTsConfig(['**/*.ts']),
  ];
  return linter.verify(code, config, 'sim/system.ts').filter((m) => m.ruleId === 'gg/no-module-state').map((m) => m.message);
}

test('flags writes into module-level objects from inside functions', () => {
  const code = `import { TABLE } from './table.js';
const seen = new Set<number>();
const counts: Record<string, number> = {};
const cache = { last: 0, deep: { n: 0 } };
const queue: number[] = [];
export const step = (id: number) => {
  seen.add(id);
  counts['x'] = 1;
  cache.deep.n++;
  delete counts['y'];
  queue.push(id);
  (cache as { last: number }).last = id;
  cache!.last = 2;
  Object.assign(cache, { last: 3 });
  TABLE.rows[0] = 1;
};`;
  const msgs = lintMessages(code);
  assert.equal(msgs.length, 9, msgs.join('\n'));
  assert.ok(msgs[0].includes('calls add() on the module-level `seen`'));
  assert.ok(msgs.some((m) => m.includes('`TABLE`')));
});

test('allows module tables filled at load, reads from functions and writes to local state', () => {
  const code = `const BY_ID: Record<string, number> = {};
for (const [i, id] of ['a', 'b'].entries()) BY_ID[id] = i;
const DIRS = [[1, 0], [0, 1]] as const;
export const step = (s: { n: number; list: number[] }) => {
  const local: number[] = [];
  local.push(DIRS.length);
  s.n += BY_ID['a'] ?? 0;
  s.list.push(...local);
  const sorted = DIRS.slice().sort();
  return sorted.length + DIRS[0][0];
};`;
  assert.deepEqual(lintMessages(code), []);
});
