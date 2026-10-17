'use strict';

// The dev tools are plain Node scripts outside the TypeScript project (with their own packages),
// so they get a lint of their own rather than the repo's typed one.
module.exports = {
  'root': true,
  'env': {
    'browser': true,
    'es2022': true,
    'node': true,
  },
  'extends': ['eslint:recommended'],
  'parserOptions': {
    'ecmaVersion': 2022,
    'sourceType': 'module',
  },
  'rules': {
    'no-empty': ['error', { 'allowEmptyCatch': true }],
    'no-unused-vars': ['error', { 'args': 'none' }],
  },
};
