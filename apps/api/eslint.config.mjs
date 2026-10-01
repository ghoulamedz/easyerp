import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // The generated Prisma client is not ours to lint.
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/generated/**', 'test/**'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        // Type-aware rules: an un-awaited write to the stock ledger is a silent
        // corruption, and no syntax rule can see it.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // A forgotten await in a ledger write is a silent corruption.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
