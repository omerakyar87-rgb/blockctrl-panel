import js from '@eslint/js'
import nextPlugin from '@next/eslint-plugin-next'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      'no-empty': 'off',
      'no-useless-assignment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      'no-dupe-else-if': 'off',
      'prefer-const': 'off',
      'no-control-regex': 'off',
      'no-extra-boolean-cast': 'off',
      '@typescript-eslint/prefer-as-const': 'off',
    },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  { ignores: ['.next/**', 'node_modules/**', '_archive/**', '**/*.before-*.ts', '**/*.before-*.tsx', '**/*duplicate*.ts', '**/*duplicate*.tsx'] },
]
