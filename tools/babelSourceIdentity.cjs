'use strict';

const path = require('node:path');

module.exports = function sourceIdentityPlugin({ types: t }) {
  return {
    name: 'paksho-source-identity',
    visitor: {
      VariableDeclarator(nodePath, state) {
        if (!t.isIdentifier(nodePath.node.id, { name: 'BUILD_IDENTITY' })) return;
        const expected = path.resolve(__dirname, '../src/config/buildIdentity.ts');
        if (path.resolve(state.file.opts.filename || '') !== expected) return;
        nodePath.node.init = t.valueToNode(state.opts.identity);
      },
    },
  };
};
