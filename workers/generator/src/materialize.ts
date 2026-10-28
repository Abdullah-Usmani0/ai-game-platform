import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { linkGameBase } from '@gg/scaffold';
import type { StageSpec } from './runners/types.js';

export interface MaterializeOptions {
  templateDir: string;
  workDir: string;
  /** Link an existing game package as ./game (demo and regression jobs). */
  gameSource?: string;
  /** Restore a checkpoint tarball into ./game (edit jobs). Without either, ./game starts empty for the scaffold stage. */
  checkpoint?: Uint8Array;
}

const TEMPLATE_ENTRIES = ['AGENTS.md', '.agents', '.claude', '.opencode', 'scripts', 'budgets.json', 'package.json', 'tsconfig.json', 'eslint.config.js'];

function safeRm(p: string): void {
  try {
    if (lstatSync(p)) rmSync(p, { recursive: true, force: true });
  } catch {
    /* missing */
  }
}

/** Copy the harness template into a fresh work directory, link node_modules and the game, recreate symlinks. */
export function materialize(opts: MaterializeOptions): { workDir: string; gameDir: string } {
  const workDir = resolve(opts.workDir);
  const template = resolve(opts.templateDir);
  mkdirSync(workDir, { recursive: true });
  for (const entry of TEMPLATE_ENTRIES) {
    const src = join(template, entry);
    if (!existsSync(src)) continue;
    const dest = join(workDir, entry);
    safeRm(dest);
    cpSync(src, dest, { recursive: true, dereference: false, filter: (s) => !s.includes(`${entry}/skills/phaser-`) || true });
  }
  // Symlinks that cpSync does not reproduce reliably across platforms.
  safeRm(join(workDir, 'CLAUDE.md'));
  symlinkSync('AGENTS.md', join(workDir, 'CLAUDE.md'));
  safeRm(join(workDir, '.claude', 'skills'));
  symlinkSync('../.agents/skills', join(workDir, '.claude', 'skills'));
  safeRm(join(workDir, 'node_modules'));
  symlinkSync(join(template, 'node_modules'), join(workDir, 'node_modules'), 'dir');
  const gameDir = join(workDir, 'game');
  safeRm(gameDir);
  if (opts.gameSource) {
    symlinkSync(resolve(opts.gameSource), gameDir, 'dir');
  } else {
    mkdirSync(gameDir, { recursive: true });
    if (opts.checkpoint) {
      const r = spawnSync('tar', ['-xzf', '-', '-C', gameDir], { input: opts.checkpoint, maxBuffer: 512 * 1024 * 1024 });
      if (r.status !== 0) throw new Error(`checkpoint restore failed: ${r.stderr?.toString().slice(0, 500)}`);
      linkGameBase(gameDir);
    }
  }
  return { workDir, gameDir };
}

export function writeStageFile(workDir: string, spec: StageSpec, attempt: number, extra: Record<string, unknown> = {}): void {
  const stage = {
    stage: spec.stage,
    attempt,
    runner: spec.runner ?? 'claude-sdk',
    model: extra['model'] ?? null,
    gate: spec.gate,
    allowedWrite: spec.allowedWrite ?? ['game/src/systems/**', 'game/content/**', 'game/design/**', 'game/tests/**'],
    seeds: spec.seeds ?? [1],
    ticks: spec.ticks ?? 600,
    skills: spec.skills ?? [],
    task: spec.task ?? null,
    caps: spec.caps ?? null,
    budget: extra['budget'] ?? {},
  };
  writeFileSync(join(workDir, 'stage.json'), JSON.stringify(stage, null, 2) + '\n');
}
