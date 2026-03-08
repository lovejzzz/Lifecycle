import nextConfig from 'eslint-config-next';

const config = [
  ...nextConfig,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      // React 19 compiler rules — warn for now, fix incrementally
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    ignores: ['.next/', 'node_modules/'],
  },
];

export default config;
