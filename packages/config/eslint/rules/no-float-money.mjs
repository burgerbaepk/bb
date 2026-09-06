/**
 * R1 — Represent all money as `bigint` paisa.
 *
 * BUILD-PLAN.md §2 R1, §6.10, §6.11.
 *
 * Floating point cannot represent 0.1 exactly. A POS that adds 8% tax to a
 * 12,220.00 base in `number` will, often enough to matter, produce a total that
 * is one paisa away from the figure transmitted to PRA and FBR. PSTSA s.17
 * makes excess tax collected payable to Government, so the drift is not
 * cosmetic. All arithmetic is integer paisa; conversion happens once, at the
 * transmission boundary, in `toFiscalDecimal()`.
 *
 * This rule reports:
 *   1. `parseFloat` / `Number.parseFloat` — never correct in this codebase
 *   2. `.toFixed()` outside the configured render boundary
 *   3. a plain number literal assigned to a money-named binding
 *   4. `*` or `/` between a money-named identifier and a plain number literal
 */

const WIN_SEP = String.fromCharCode(92); // backslash, written this way to survive heredocs

const MONEY_WORD =
  /(paisa|paise|price|amount|total|subtotal|discount|tendered|fee|charge|variance|grandtotal|taxtotal|change|payable|refund)/i;

/** Names that contain a money word but are not money. */
const NOT_MONEY =
  /(bps|count|qty|quantity|id$|_id|no$|index|seconds|millis|ms$|percent|ratio|flag|enabled|taxable|method|scope|status|key|label|name|type|class)/i;

function isMoneyName(name) {
  if (typeof name !== 'string') return false;
  return MONEY_WORD.test(name) && !NOT_MONEY.test(name);
}

/** A numeric literal that is not a bigint (bigints carry `bigint` typeof). */
function isPlainNumberLiteral(node) {
  return node?.type === 'Literal' && typeof node.value === 'number' && node.bigint === undefined;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Money must be bigint paisa (BUILD-PLAN §2 R1)',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          renderBoundary: {
            type: 'array',
            items: { type: 'string' },
            description: 'Path fragments where formatting a number for display is permitted.',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noParseFloat:
        'R1: parseFloat is banned. Money is bigint paisa — parse to bigint, never to a float.',
      noToFixed:
        'R1: .toFixed() formats a float. Format money only at the render boundary, from Paisa. See §6.10.',
      floatMoneyLiteral:
        'R1: `{{name}}` is money and must be bigint paisa. Write `{{suggest}}` (paisa), not `{{actual}}`.',
      floatMoneyArithmetic:
        'R1: arithmetic between money `{{name}}` and the number literal `{{actual}}`. Both operands must be bigint. Use `{{suggest}}`.',
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const renderBoundary = options.renderBoundary ?? [];
    const filename = context.filename.split(WIN_SEP).join('/');
    const atRenderBoundary = renderBoundary.some((frag) => filename.includes(frag));

    function paisaSuggestion(value) {
      if (!Number.isFinite(value)) return '0n';
      return `${Math.round(value * 100)}n`;
    }

    function checkAssignment(nameNode, valueNode) {
      const name = nameNode?.type === 'Identifier' ? nameNode.name : nameNode?.value;
      if (!isMoneyName(name)) return;
      if (!isPlainNumberLiteral(valueNode)) return;
      context.report({
        node: valueNode,
        messageId: 'floatMoneyLiteral',
        data: {
          name: String(name),
          actual: String(valueNode.value),
          suggest: paisaSuggestion(valueNode.value),
        },
      });
    }

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === 'Identifier' && callee.name === 'parseFloat') {
          context.report({ node, messageId: 'noParseFloat' });
          return;
        }
        if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'Number' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'parseFloat'
        ) {
          context.report({ node, messageId: 'noParseFloat' });
          return;
        }
        if (
          !atRenderBoundary &&
          callee.type === 'MemberExpression' &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'toFixed'
        ) {
          context.report({ node, messageId: 'noToFixed' });
        }
      },

      VariableDeclarator(node) {
        checkAssignment(node.id, node.init);
      },

      PropertyDefinition(node) {
        checkAssignment(node.key, node.value);
      },

      Property(node) {
        checkAssignment(node.key, node.value);
      },

      AssignmentExpression(node) {
        if (node.operator !== '=') return;
        checkAssignment(node.left, node.right);
      },

      BinaryExpression(node) {
        if (node.operator !== '*' && node.operator !== '/') return;
        const { left, right } = node;
        const pairs = [
          [left, right],
          [right, left],
        ];
        for (const [maybeName, maybeLiteral] of pairs) {
          if (
            maybeName.type === 'Identifier' &&
            isMoneyName(maybeName.name) &&
            isPlainNumberLiteral(maybeLiteral)
          ) {
            context.report({
              node,
              messageId: 'floatMoneyArithmetic',
              data: {
                name: maybeName.name,
                actual: String(maybeLiteral.value),
                suggest: `${maybeLiteral.value}n`,
              },
            });
            return;
          }
        }
      },
    };
  },
};
