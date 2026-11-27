import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'node_modules/**',
      '.zctrl_data/**',
      'logs/**',
      'public/**',
      'docs/**',
      'scripts/**'
    ]
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      }
    },
    rules: {
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'max-lines': ['warn', { max: 900, skipBlankLines: true, skipComments: true }]
    }
  },
  {
    files: [
      'src/server/routes/subscribers/**/*.ts',
      'src/server/routes/subscribersRoutes.ts',
      'src/server/tlsPinStore.ts',
      'src/server/security-shield.ts',
      'src/server/rbac.ts',
      'src/server/services/credentialVault.ts',
      'src/server/services/httpUtil.ts'
    ],
    rules: {
      'max-lines': ['error', { max: 850, skipBlankLines: true, skipComments: true }]
    }
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs'
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-debugger': 'error',
      'no-eval': 'error'
    }
  }
];
