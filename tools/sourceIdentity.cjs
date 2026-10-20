'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

function readSourceIdentity(root = path.join(__dirname, '..')) {
  const unknown = { commit: null, branch: null, detached: null, dirty: null };
  if (!fs.existsSync(path.join(root, '.git'))) return unknown;
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) {
    delete env[key];
  }
  const git = (args) => execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env, timeout: 5000,
  }).trim();
  try {
    const commit = git(['rev-parse', '--verify', 'HEAD']);
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)) return unknown;
    let branch = null;
    let detached = false;
    try {
      branch = git(['symbolic-ref', '--short', '-q', 'HEAD']);
    } catch (error) {
      if (error.status !== 1) throw error;
      detached = true;
    }
    const dirty = git(['status', '--porcelain=v1', '--untracked-files=normal']) !== '';
    if (git(['rev-parse', '--verify', 'HEAD']) !== commit) return unknown;
    return { commit, branch, detached, dirty };
  } catch (error) {
    return unknown;
  }
}

function sourceIdentityCacheKey(identity) {
  return crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

function sourceIdentityScriptJson(identity) {
  return JSON.stringify(identity).replace(/[<>&\u2028\u2029]/g, (character) => (
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  ));
}

module.exports = { readSourceIdentity, sourceIdentityCacheKey, sourceIdentityScriptJson };
