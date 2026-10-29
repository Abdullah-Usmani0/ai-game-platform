// eslint-plugin-gg: GlueTS rules for generated game simulation code.
// The simulation must be deterministic, synchronous, engine-free and free of
// module-level mutable state so that replay hashes are stable and the code can
// run both in the browser (under Phaser) and in Node (under bots and tests).

const BANNED_GLOBALS = new Set([
  'window',
  'document',
  'navigator',
  'fetch',
  'XMLHttpRequest',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'requestAnimationFrame',
  'requestIdleCallback',
  'queueMicrotask',
  'performance',
  'crypto',
  'Phaser',
  'GG',
]);

const BANNED_MEMBER_CALLS = [
  ['Math', 'random'],
  ['Date', 'now'],
];

const ALLOWED_IMPORT_PREFIXES = ['@gg/sdk', '@gg/schemas', './', '../'];
const BANNED_IMPORT_PREFIXES = ['phaser', '@gg/sdk/phaser', '@gg/sdk/render', 'node:'];

function isIdentifier(node, name) {
  return node && node.type === 'Identifier' && node.name === name;
}

const noNondeterminism = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow non-deterministic APIs; use ctx.rng and ctx.clock instead.' },
    messages: {
      banned: '`{{name}}` is non-deterministic. Use `ctx.rng` for randomness and `ctx.clock` / tick counts for time.',
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        for (const [obj, prop] of BANNED_MEMBER_CALLS) {
          if (isIdentifier(node.object, obj) && isIdentifier(node.property, prop)) {
            context.report({ node, messageId: 'banned', data: { name: `${obj}.${prop}` } });
          }
        }
      },
      NewExpression(node) {
        if (isIdentifier(node.callee, 'Date')) {
          context.report({ node, messageId: 'banned', data: { name: 'new Date' } });
        }
      },
    };
  },
};

const noAsync = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow async/await, promises and generators in simulation code.' },
    messages: { banned: '`{{name}}` is not allowed in simulation code; the fixed-step loop is synchronous.' },
    schema: [],
  },
  create(context) {
    const checkFn = (node) => {
      if (node.async) context.report({ node, messageId: 'banned', data: { name: 'async' } });
      if (node.generator) context.report({ node, messageId: 'banned', data: { name: 'function*' } });
    };
    return {
      FunctionDeclaration: checkFn,
      FunctionExpression: checkFn,
      ArrowFunctionExpression: checkFn,
      AwaitExpression(node) {
        context.report({ node, messageId: 'banned', data: { name: 'await' } });
      },
      Identifier(node) {
        if (node.name === 'Promise' && node.parent && node.parent.type !== 'ImportSpecifier') {
          context.report({ node, messageId: 'banned', data: { name: 'Promise' } });
        }
      },
    };
  },
};

const noHostGlobals = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow DOM, timer and engine globals in simulation code.' },
    messages: { banned: '`{{name}}` is a host global; simulation code must only use the ctx passed to it.' },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      'Program:exit'(program) {
        const scope = sourceCode.getScope(program);
        for (const ref of scope.through) {
          const name = ref.identifier.name;
          if (BANNED_GLOBALS.has(name)) {
            context.report({ node: ref.identifier, messageId: 'banned', data: { name } });
          }
        }
      },
    };
  },
};

const noEngineImport = {
  meta: {
    type: 'problem',
    docs: { description: 'Only allow imports from @gg/sdk, @gg/schemas and relative paths.' },
    messages: {
      banned: 'Import of `{{source}}` is not allowed in simulation code. Use the typed `@gg/sdk` API.',
    },
    schema: [],
  },
  create(context) {
    const check = (node, source) => {
      if (typeof source !== 'string') return;
      const banned = BANNED_IMPORT_PREFIXES.some((p) => source === p || source.startsWith(p + '/'));
      const allowed = ALLOWED_IMPORT_PREFIXES.some((p) => source === p || source.startsWith(p));
      if (banned || !allowed) context.report({ node, messageId: 'banned', data: { source } });
    };
    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ImportExpression(node) {
        context.report({ node, messageId: 'banned', data: { source: 'dynamic import()' } });
      },
      CallExpression(node) {
        if (isIdentifier(node.callee, 'require')) {
          context.report({ node, messageId: 'banned', data: { source: 'require()' } });
        }
      },
    };
  },
};

// Methods that change the object they are called on (arrays, maps, sets).
const MUTATING_METHODS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin', 'set', 'add', 'delete', 'clear']);
const MUTATING_OBJECT_CALLS = new Set(['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf']);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const TS_WRAPPERS = new Set(['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression', 'TSTypeAssertion']);

function insideFunction(node) {
  for (let n = node.parent; n; n = n.parent) if (FUNCTIONS.has(n.type)) return true;
  return false;
}

/** Up through casts and member accesses from a binding (`(X as T).a.b`): the outermost expression still inside X. */
function reach(id) {
  let n = id;
  for (;;) {
    const p = n.parent;
    if (p && TS_WRAPPERS.has(p.type) && p.expression === n) n = p;
    else if (p && p.type === 'MemberExpression' && p.object === n) n = p;
    else return n;
  }
}

/** How this reference to a module-level binding changes what the binding holds, or null when it only reads it. */
function mutation(id) {
  const top = reach(id);
  const p = top.parent;
  if (top !== id && top.type === 'MemberExpression') {
    if (p.type === 'AssignmentExpression' && p.left === top) return 'assigns into';
    if (p.type === 'UpdateExpression' && p.argument === top) return 'increments or decrements';
    if (p.type === 'UnaryExpression' && p.operator === 'delete' && p.argument === top) return 'deletes from';
    if (p.type === 'CallExpression' && p.callee === top && !top.computed && top.property.type === 'Identifier' && MUTATING_METHODS.has(top.property.name)) return `calls ${top.property.name}() on`;
  }
  if (p && p.type === 'CallExpression' && p.arguments[0] === top && p.callee.type === 'MemberExpression' && isIdentifier(p.callee.object, 'Object') && !p.callee.computed && MUTATING_OBJECT_CALLS.has(p.callee.property.name)) return `passes to Object.${p.callee.property.name}()`;
  return null;
}

const noModuleState = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow module-level mutable bindings, writes into module-level objects from functions, classes and `this`; state lives in the system state object.',
    },
    messages: {
      let: 'Module-level `{{kind}}` creates hidden mutable state. Keep state in the system state object.',
      mutate:
        'This {{how}} the module-level `{{name}}`: state kept at module level is shared by every sim (replays, bots, a second player) and survives a reset. Keep it in the system state object.',
      cls: 'Classes are not allowed in simulation code; use plain data and functions.',
      thisExpr: '`this` is not allowed in simulation code.',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      // A const binding cannot be reassigned, but what it holds can be changed: inside a function (that is, while a sim
      // runs) any write through a module-level binding is hidden state. Filling a table while the module loads is fine.
      'Program:exit'(program) {
        const global = sourceCode.getScope(program);
        for (const scope of [global, ...global.childScopes.filter((c) => c.type === 'module')]) {
          for (const variable of scope.variables) {
            for (const ref of variable.references) {
              const how = insideFunction(ref.identifier) ? mutation(ref.identifier) : null;
              if (how) context.report({ node: ref.identifier, messageId: 'mutate', data: { how, name: variable.name } });
            }
          }
        }
      },
      VariableDeclaration(node) {
        if (node.parent && node.parent.type === 'Program' && node.kind !== 'const') {
          context.report({ node, messageId: 'let', data: { kind: node.kind } });
        }
        if (
          node.parent &&
          node.parent.type === 'ExportNamedDeclaration' &&
          node.parent.parent.type === 'Program' &&
          node.kind !== 'const'
        ) {
          context.report({ node, messageId: 'let', data: { kind: node.kind } });
        }
      },
      ClassDeclaration(node) {
        context.report({ node, messageId: 'cls' });
      },
      ClassExpression(node) {
        context.report({ node, messageId: 'cls' });
      },
      ThisExpression(node) {
        context.report({ node, messageId: 'thisExpr' });
      },
    };
  },
};

export const rules = {
  'no-nondeterminism': noNondeterminism,
  'no-async': noAsync,
  'no-host-globals': noHostGlobals,
  'no-engine-import': noEngineImport,
  'no-module-state': noModuleState,
};

const plugin = { meta: { name: 'eslint-plugin-gg', version: '0.1.0' }, rules };

/** Flat-config block applying every GlueTS rule to the given file globs. */
export function glueTsConfig(files) {
  return {
    name: 'gg/gluets',
    files,
    plugins: { gg: plugin },
    rules: {
      'gg/no-nondeterminism': 'error',
      'gg/no-async': 'error',
      'gg/no-host-globals': 'error',
      'gg/no-engine-import': 'error',
      'gg/no-module-state': 'error',
    },
  };
}

export default plugin;
