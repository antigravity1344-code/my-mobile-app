const { getDefaultConfig } = require('expo/metro-config');
const { readSourceIdentity, sourceIdentityCacheKey } = require('./tools/sourceIdentity.cjs');

const config = getDefaultConfig(__dirname);
config.cacheVersion = `${config.cacheVersion || ''}|paksho-source:${sourceIdentityCacheKey(readSourceIdentity(__dirname))}`;
module.exports = config;
