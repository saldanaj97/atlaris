module.exports = {
  '*.{ts,tsx}': [
    // Suppress warnings for intentionally ignored files (e.g., src/components/ui/**)
    'eslint --fix --max-warnings=0 --no-warn-ignored',
    'prettier --write',
  ],
  '*.{css,md}': ['prettier --write'],
};
