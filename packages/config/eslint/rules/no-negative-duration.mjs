/**
 * R13 — Never render a negative duration.
 *
 * BUILD-PLAN.md §2 R13, §10.3, defect V2.
 *
 * The production system this replaces renders `-08:20` in red on the kitchen
 * display. It happens because a timer subtracts two timestamps and formats the
 * result without clamping: clock skew between the till and the server, or a
 * line whose `sent_at` is written after the read, and the elapsed time is
 * negative. A cook reading `-08:20` cannot tell whether the ticket is late.
 *
 * Any subtraction passed to a duration formatter must be clamped at zero.
 */

const DEFAULT_FORMATTERS = [
  'formatDuration',
  'formatElapsed',
  'formatMmSs',
  'toDuration',
  'humanizeDuration',
  'elapsed',
  'Duration',
];

/** `Math.max(0, x)` or `Math.max(0n, x)` — the sanctioned clamp. */
function isClampedAtZero(node) {
  if (node?.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (
    callee.type !== 'MemberExpression' ||
    callee.object.type !== 'Identifier' ||
    callee.object.name !== 'Math' ||
    callee.property.type !== 'Identifier' ||
    callee.property.name !== 'max'
  ) {
    return false;
  }
  return node.arguments.some(
    (arg) => arg.type === 'Literal' && (arg.value === 0 || arg.bigint === '0'),
  );
}

/** Peel parentheses/casts so `(a - b) as number` still reads as a subtraction. */
function unwrap(node) {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'TSSatisfiesExpression')
  ) {
    current = current.expression;
  }
  return current;
}

function isUnclampedSubtraction(node) {
  const inner = unwrap(node);
  if (!inner) return false;
  if (inner.type === 'BinaryExpression' && inner.operator === '-') return true;
  if (inner.type === 'ConditionalExpression') {
    return isUnclampedSubtraction(inner.consequent) || isUnclampedSubtraction(inner.alternate);
  }
  return false;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Duration formatters must receive a value clamped at zero (BUILD-PLAN §2 R13)',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          formatters: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unclamped:
        'R13: `{{name}}` receives a raw subtraction and can render a negative duration (defect V2). Wrap it: `Math.max(0, ...)`.',
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const formatters = new Set(options.formatters ?? DEFAULT_FORMATTERS);

    function calleeName(callee) {
      if (callee.type === 'Identifier') return callee.name;
      if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
        return callee.property.name;
      }
      return undefined;
    }

    return {
      CallExpression(node) {
        const name = calleeName(node.callee);
        if (!name || !formatters.has(name)) return;
        for (const arg of node.arguments) {
          if (isClampedAtZero(arg)) continue;
          if (isUnclampedSubtraction(arg)) {
            context.report({ node: arg, messageId: 'unclamped', data: { name } });
          }
        }
      },

      // <Duration value={a - b} /> — the JSX form used by the design system.
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier') return;
        if (!['value', 'seconds', 'ms', 'elapsed'].includes(node.name.name)) return;
        const parent = node.parent;
        const tag = parent?.name;
        if (tag?.type !== 'JSXIdentifier' || !formatters.has(tag.name)) return;
        const expr = node.value;
        if (expr?.type !== 'JSXExpressionContainer') return;
        if (isClampedAtZero(expr.expression)) return;
        if (isUnclampedSubtraction(expr.expression)) {
          context.report({
            node: expr.expression,
            messageId: 'unclamped',
            data: { name: tag.name },
          });
        }
      },
    };
  },
};
