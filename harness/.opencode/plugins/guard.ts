/**
 * OpenCode plugin: re-implements the Claude Code PreToolUse guards for the open-model runner.
 * Blocks protected paths and dangerous shell commands by throwing from tool.execute.before.
 * The Stop gate is not a plugin here; the generator worker runs `pnpm gate` after every session.
 */
const PROTECTED = [/^\.claude\//, /^\.agents\//, /(^|\/)node_modules\//, /^game\/src\/engine\//, /^game\/provenance\.json$/, /^game\/reports\//, /^stage\.json$/, /^scripts\//];
const BANNED_CMD = /(^|[;&| ])(curl|wget|ssh|scp|sudo|npm (i|install|add)|pnpm (add|install|i)\b|git push|rm -rf +\/|chmod -R)/;

type ToolInput = { tool: string; args: Record<string, unknown> };

export const GuardPlugin = async () => ({
  'tool.execute.before': async (input: ToolInput) => {
    const file = typeof input.args['filePath'] === 'string' ? (input.args['filePath'] as string) : '';
    if (file && (input.tool === 'edit' || input.tool === 'write')) {
      const rel = file.replace(/^.*?\/work\/[^/]+\//, '').replace(/\\/g, '/');
      if (PROTECTED.some((p) => p.test(rel))) throw new Error(`Blocked: '${rel}' is protected.`);
    }
    const cmd = typeof input.args['command'] === 'string' ? (input.args['command'] as string) : '';
    if (input.tool === 'bash' && BANNED_CMD.test(cmd)) throw new Error('Blocked: network, install, destructive or privileged command.');
  },
});
