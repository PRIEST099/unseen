import tseslint from 'typescript-eslint'

// The classifier is pure: it must never import the browser runner (structure.md).
export default tseslint.config({
  files: ['packages/core/src/classifier/**/*.ts'],
  languageOptions: {
    parser: tseslint.parser,
  },
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/runner/*', '../runner/*', './runner/*', '**/runner'],
            message: 'classifier must not import runner (structure.md)',
          },
        ],
      },
    ],
  },
})
