import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['**/dist/**/*', '**/app/**/*', '**/scripts/**/*', '**/test-*.js', '**/*.rules']
  },
  {
    files: ['./firestore.rules', './DRAFT_firestore.rules'],
    plugins: {
      '@firebase/security-rules': firebaseRulesPlugin
    },
    rules: {
      ...firebaseRulesPlugin.configs['flat/recommended'].rules
    }
  }
];
