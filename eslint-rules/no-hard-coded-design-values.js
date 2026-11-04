// ESLint rule ddtc/no-hard-coded-design-values (CLAUDE.md section 3, DESIGN.md 17):
// components and pages use design tokens only. In src/components and src/pages it reports:
//   1. colour literals anywhere in a string or template (hex, rgb(), rgba(), hsl(), hsla(), oklch())
//   2. Tailwind arbitrary values that hard-code a size, colour or radius, for example
//      text-[13px], w-[320px], bg-[#fff], rounded-[10px], p-[1.5rem], shadow-[0_1px_2px_...]
//   3. hard-coded lengths in a JSX style prop (for example style={{ width: '320px', padding: 12 }})
// Allowed: token utilities, Tailwind's spacing scale (p-4, size-11), CSS variables
// (w-(--sidebar-width), var(--token)), percentages computed at runtime, and attribute or selector
// variants such as data-[state=open]: and [&_svg]: that do not carry a value.

const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i;
// A utility followed by [value] where the value holds a number with a unit, a colour or a bare number.
const ARBITRARY_VALUE = /(?:^|[\s:])-?[a-z][a-z0-9-]*-\[(?![&@])([^\]]*)\]/gi;
const HARD_VALUE = /\d(?:\.\d+)?(?:px|rem|em|vh|vw|dvh|svh|lvh|ch|pt|ms|s)\b|#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(|^\d+(?:\.\d+)?$/i;
const STYLE_LENGTH = /^-?\d+(?:\.\d+)?(?:px|rem|em|vh|vw|dvh|pt)$/i;
const LENGTH_PROPERTIES = /^(?:width|height|min(?:Width|Height)|max(?:Width|Height)|margin.*|padding.*|top|right|bottom|left|inset.*|gap|rowGap|columnGap|fontSize|lineHeight|letterSpacing|borderRadius.*|borderWidth.*|outlineOffset|outlineWidth|flexBasis)$/;

/**
 * @param {string} text
 * @returns {string | null} a description of the first problem, or null
 */
export function findHardCodedValue(text) {
  if (COLOUR_LITERAL.test(text)) return 'a colour literal';
  for (const match of text.matchAll(ARBITRARY_VALUE)) {
    const value = match[1];
    if (/^\(?--/.test(value) || /^var\(--[\w-]+\)$/.test(value)) continue;
    if (HARD_VALUE.test(value)) return `the arbitrary value "${match[0].trim()}"`;
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Use DDTC design tokens instead of hard-coded colours, sizes and radii.' },
    schema: [],
    messages: {
      hardCoded: 'Hard-coded design value ({{what}}). Use a design token or shared utility from src/styles (DESIGN.md 17).',
      styleLength: 'Hard-coded length in a style prop ({{what}}). Use a token class or a CSS variable.',
    },
  },
  create(context) {
    /**
     * @param {import('estree').Node} node
     * @param {string} text
     */
    const check = (node, text) => {
      const what = findHardCodedValue(text);
      if (what) context.report({ node, messageId: 'hardCoded', data: { what } });
    };

    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
      /** @param {any} node */
      JSXAttribute(node) {
        if (node.name?.name !== 'style' || node.value?.type !== 'JSXExpressionContainer') return;
        const expr = node.value.expression;
        if (expr?.type !== 'ObjectExpression') return;
        for (const prop of expr.properties) {
          if (prop.type !== 'Property' || prop.key.type !== 'Identifier' || !LENGTH_PROPERTIES.test(prop.key.name)) continue;
          const v = prop.value;
          const literal = v.type === 'Literal' ? v.value : null;
          if (typeof literal === 'number' && literal !== 0) {
            context.report({ node: v, messageId: 'styleLength', data: { what: `${prop.key.name}: ${literal}` } });
          } else if (typeof literal === 'string' && STYLE_LENGTH.test(literal.trim())) {
            context.report({ node: v, messageId: 'styleLength', data: { what: `${prop.key.name}: '${literal}'` } });
          }
        }
      },
    };
  },
};

export default rule;
