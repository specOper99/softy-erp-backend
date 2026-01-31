/**
 * ESLint custom rule: no-unsafe-tenant-context
 *
 * Prevents unsafe tenant context retrieval patterns that can lead to data leaks.
 * Enforces use of getTenantIdOrThrow() instead of getTenantId() with fallback.
 *
 * ## Bad Patterns (will flag):
 * - `getTenantId() ?? 'default'`
 * - `getTenantId() ?? 'system'`
 * - `getTenantId() || 'default'`
 * - `const tenant = getTenantId(); if (!tenant) { tenant = 'default'; }`
 *
 * ## Good Patterns (allowed):
 * - `getTenantIdOrThrow()`
 * - `const tenantId = getTenantId(); if (!tenantId) throw new Error(...)`
 *
 * @type {import('eslint').Rule.RuleModule}
 */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow unsafe tenant context retrieval with default fallbacks',
            category: 'Security',
            recommended: true,
            url: 'https://docs.your-company.com/eslint-rules/no-unsafe-tenant-context',
        },
        messages: {
            unsafeFallback:
                'Unsafe tenant context fallback detected. Use `getTenantIdOrThrow()` instead of `getTenantId() ?? {{fallback}}` to prevent data leaks.',
            preferThrowMethod:
                'Prefer `getTenantIdOrThrow()` over manual null checks with tenant fallbacks for security.',
        },
        schema: [], // no options
        fixable: 'code',
    },

    create(context) {
        return {
            // Detect: getTenantId() ?? 'default'
            // Detect: getTenantId() || 'system'
            LogicalExpression(node) {
                if (node.operator !== '??' && node.operator !== '||') {
                    return;
                }

                // Check if left side is getTenantId() call
                if (
                    node.left.type === 'CallExpression' &&
                    node.left.callee.type === 'MemberExpression' &&
                    node.left.callee.property.name === 'getTenantId'
                ) {
                    // Check if right side is a string literal (the fallback)
                    if (node.right.type === 'Literal' && typeof node.right.value === 'string') {
                        context.report({
                            node,
                            messageId: 'unsafeFallback',
                            data: {
                                fallback: node.right.value,
                            },
                            fix(fixer) {
                                // Suggest replacing with getTenantIdOrThrow()
                                const sourceCode = context.getSourceCode();
                                const leftText = sourceCode.getText(node.left);
                                const replacement = leftText.replace('getTenantId()', 'getTenantIdOrThrow()');
                                return fixer.replaceText(node, replacement);
                            },
                        });
                    }
                }
            },

            // Detect pattern: const tenant = getTenantId(); if (!tenant) { tenant = 'default'; }
            // This is more complex but less common - we'll flag the reassignment
            AssignmentExpression(node) {
                // Check if we're assigning a string literal to a variable
                if (node.right.type === 'Literal' && typeof node.right.value === 'string') {
                    // Check if the variable might be a tenant ID (heuristic: variable name contains 'tenant')
                    const variableName =
                        node.left.type === 'Identifier' ? node.left.name : node.left.type === 'MemberExpression' ? node.left.property?.name : null;

                    if (variableName && variableName.toLowerCase().includes('tenant') && (node.right.value === 'default' || node.right.value === 'system')) {
                        context.report({
                            node,
                            messageId: 'preferThrowMethod',
                        });
                    }
                }
            },
        };
    },
};
