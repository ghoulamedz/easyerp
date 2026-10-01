import next from 'eslint-config-next';

/** Next ships its own flat config, React rules and accessibility rules included. */
export default [
  ...next,
  {
    ignores: ['.next/**', 'out/**', 'coverage/**', 'node_modules/**', 'next-env.d.ts'],
  },
];
