const js = require('@eslint/js');
const globals = require('globals');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  // Ignory zamiast .eslintignore (ESLint 9)
  {
    ignores: ['dist/**', 'test.js'],
  },

  // eslint:recommended
  js.configs.recommended,

  // TypeScript w src/
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
      },

      // To jest klucz: globals dla Node + ES2021
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // W TS to często robi false-positive, bo typy ogarnia TypeScript
      'no-undef': 'off',

      // Wyłącz core no-unused-vars i użyj TS-owej wersji
      'no-unused-vars': 'off',

      // Ignoruj NIEużyte parametry (częste w callbackach / wrapperach),
      // ale łap nieużyte importy i zmienne lokalne.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'none',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
];
