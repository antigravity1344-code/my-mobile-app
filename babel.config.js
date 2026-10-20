const { readSourceIdentity } = require('./tools/sourceIdentity.cjs');
const identity = readSourceIdentity(__dirname);

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [[require.resolve('./tools/babelSourceIdentity.cjs'), { identity }]],
  };
};
