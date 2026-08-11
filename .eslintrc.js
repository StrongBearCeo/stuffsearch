// Minimal ESLint config extending Expo's. Add stricter rules as the project matures.
module.exports = {
  extends: ['expo', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: [
    '/dist/*',
    '/web-build/*',
    '/.expo/*',
    '/node_modules/*',
    '/supabase/functions/*', // Deno runtime: separate lint config
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
};
