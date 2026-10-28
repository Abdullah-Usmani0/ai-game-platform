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
