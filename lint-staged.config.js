export default {
  '*.{ts,tsx}': (files) =>
    [
      'eslint --fix --max-warnings=0',
      'prettier --write',
      files.length > 0 ? 'tsc --noEmit' : null,
    ].filter(Boolean),
  '*.{css,md}': ['prettier --write'],
};
