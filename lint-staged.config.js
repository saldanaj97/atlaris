module.exports = {
  '*.{ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  '*.{css,md}': ['prettier --write'],
};
