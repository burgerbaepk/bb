/**
 * §15.2 — the interface must survive `dir="rtl"`.
 *
 * BUILD-PLAN.md §13.1, §15.1, §15.2, §18 (M01 gate), §19.
 *
 * The storefront is fully localised into Urdu with `dir="rtl"`, and M18 gates on
 * axe passing in both text directions. In a Tailwind codebase there is exactly
 * one way that breaks: a physical direction utility. `ml-4` stays on the left
 * when the document flips, so a label that sat beside its field ends up on top
 * of the next one.
 *
 * Every one of these has a logical equivalent that flips correctly, so the fix
 * is always a rename and never a redesign. Enforcing it at edit time is a
 * stronger guarantee than toggling the direction once and looking.
 */

/** Utilities banned by prefix: `ml-4`, `-ml-4`, `md:ml-4`, `rounded-l-lg`. */
const PREFIXES = new Map([
  ['ml', 'ms'],
  ['mr', 'me'],
  ['pl', 'ps'],
  ['pr', 'pe'],
  ['left', 'start'],
  ['right', 'end'],
  ['border-l', 'border-s'],
  ['border-r', 'border-e'],
  ['rounded-l', 'rounded-s'],
  ['rounded-r', 'rounded-e'],
  ['rounded-tl', 'rounded-ss'],
  ['rounded-tr', 'rounded-se'],
  ['rounded-bl', 'rounded-es'],
  ['rounded-br', 'rounded-ee'],
  ['scroll-ml', 'scroll-ms'],
  ['scroll-mr', 'scroll-me'],
  ['scroll-pl', 'scroll-ps'],
  ['scroll-pr', 'scroll-pe'],
]);

/** Utilities banned as whole tokens. */
const EXACT = new Map([
  ['text-left', 'text-start'],
  ['text-right', 'text-end'],
  ['float-left', 'float-start'],
  ['float-right', 'float-end'],
  ['clear-left', 'clear-start'],
  ['clear-right', 'clear-end'],
]);

const CLASS_ATTRIBUTES = new Set(['className', 'class']);
const CLASS_HELPERS = new Set(['cn', 'clsx', 'classNames', 'cva', 'twMerge']);

/**
 * Reduce `md:hover:-ml-4` to `ml-4` so one matcher covers every variant and the
 * negative form.
 */
function bareUtility(token) {
  const afterVariants = token.slice(token.lastIndexOf(':') + 1);
  return afterVariants.startsWith('-') ? afterVariants.slice(1) : afterVariants;
}

function findViolation(token) {
  const utility = bareUtility(token);
  if (utility.length === 0) return null;

  const exact = EXACT.get(utility);
  if (exact !== undefined) return { logical: exact, family: false };

  for (const [physical, logical] of PREFIXES) {
    if (utility === physical || utility.startsWith(`${physical}-`)) {
      return { logical, family: true };
    }
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Use logical direction utilities so the layout survives dir="rtl" (BUILD-PLAN §15.2)',
      recommended: true,
    },
    schema: [],
    messages: {
      physical:
        '§15.2: `{{token}}` is a physical direction utility and does not flip under dir="rtl". Use `{{logical}}` instead.',
    },
  },

  create(context) {
    function checkClassString(node, value) {
      if (typeof value !== 'string') return;
      for (const token of value.split(/\s+/)) {
        if (token.length === 0) continue;
        const violation = findViolation(token);
        if (violation) {
          context.report({
            node,
            messageId: 'physical',
            data: {
              token,
              logical: violation.family ? `${violation.logical}-*` : violation.logical,
            },
          });
        }
      }
    }

    /** Reads string literals out of a value, including template literal chunks. */
    function checkValue(node) {
      if (node === null || node === undefined) return;
      if (node.type === 'Literal') {
        checkClassString(node, node.value);
        return;
      }
      if (node.type === 'TemplateLiteral') {
        for (const quasi of node.quasis) {
          checkClassString(quasi, quasi.value.cooked ?? quasi.value.raw);
        }
        return;
      }
      if (node.type === 'JSXExpressionContainer') {
        checkValue(node.expression);
        return;
      }
      if (node.type === 'ConditionalExpression') {
        checkValue(node.consequent);
        checkValue(node.alternate);
        return;
      }
      if (node.type === 'LogicalExpression') {
        checkValue(node.left);
        checkValue(node.right);
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier') return;
        if (!CLASS_ATTRIBUTES.has(node.name.name)) return;
        checkValue(node.value);
      },

      CallExpression(node) {
        const callee = node.callee;
        const name =
          callee.type === 'Identifier'
            ? callee.name
            : callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
              ? callee.property.name
              : undefined;
        if (name === undefined || !CLASS_HELPERS.has(name)) return;
        for (const argument of node.arguments) checkValue(argument);
      },
    };
  },
};
