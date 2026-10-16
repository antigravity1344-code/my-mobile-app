const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DOCUMENT_ID = /^wd_[0-9a-f]{32}$/;
const EXTENSIONS = ['jpg', 'png', 'webp'];
const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function createWorkerDocumentStorage(directory) {
  const root = path.resolve(directory);

  function locate(documentId) {
    if (typeof documentId !== 'string' || !DOCUMENT_ID.test(documentId)) return null;
    for (const ext of EXTENSIONS) {
      const filename = documentId + '.' + ext;
      const absolute = path.join(root, filename);
      if (path.resolve(absolute) !== path.join(root, filename)) return null;
      if (fs.existsSync(absolute)) return { absolute, ext };
    }
    return null;
  }

  // A durable intent is written *before* the file, so failed database updates
  // and failed unlink operations cannot leave an untracked document behind.
  // Reconciliation must consult the database before removing a pending document.
  function pendingPath(documentId) {
    if (!DOCUMENT_ID.test(documentId)) throw new Error('INVALID_DOCUMENT_ID');
    return path.join(root, documentId + '.pending');
  }

  function trackPendingDocument(documentId) {
    fs.mkdirSync(root, { recursive: true });
    const fd = fs.openSync(pendingPath(documentId), 'wx', 0o600);
    try {
      fs.writeSync(fd, JSON.stringify({ version: 1, documentId, pendingCleanup: true }));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // POSIX needs the directory entry persisted too, not only the file bytes.
    // Directory fsync is not supported uniformly by Windows.
    if (process.platform !== 'win32') {
      const directoryFd = fs.openSync(root, 'r');
      try {
        fs.fsyncSync(directoryFd);
      } finally {
        fs.closeSync(directoryFd);
      }
    }
  }

  function finishPendingDocument(documentId) {
    try {
      fs.unlinkSync(pendingPath(documentId));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  function syncDirectory() {
    if (process.platform === 'win32') return;
    const fd = fs.openSync(root, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }

  // Only exact document-storage-owned basenames are eligible for recovery.
  // Never follow symlinks, traverse child directories, or delete unknown files.
  function checkedManagedFile(filename) {
    const absolute = path.join(root, filename);
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('D62_UNSAFE_STORAGE_ENTRY');
    return absolute;
  }

  function reconcilePendingDocuments(isReferenced, isLegacyReferenced) {
    if (typeof isReferenced !== 'function') throw new Error('REFERENCE_CHECK_REQUIRED');
    if (!fs.existsSync(root)) return { recovered: 0, referenced: 0, legacyRecovered: 0 };
    const groups = new Map();
    const legacy = [];
    for (const filename of fs.readdirSync(root)) {
      const match = /^(wd_[0-9a-f]{32})\.(jpg|png|webp|tmp|pending)$/.exec(filename);
      if (match) {
        checkedManagedFile(filename);
        if (!groups.has(match[1])) groups.set(match[1], new Set());
        groups.get(match[1]).add(match[2]);
      } else if (/^DOC-[A-Za-z0-9_-]{1,80}\.(jpg|png|webp)$/.test(filename)) {
        checkedManagedFile(filename);
        legacy.push(filename);
      }
    }
    let recovered = 0, referenced = 0, legacyRecovered = 0;
    for (const [id, extensions] of groups) {
      const committed = !!isReferenced(id);
      if (extensions.has('pending')) {
        let pending;
        try {
          pending = JSON.parse(fs.readFileSync(pendingPath(id), 'utf8'));
        } catch { throw Error('D62_INVALID_PENDING_INTENT'); }
        if (!pending || pending.version !== 1 ||
            pending.documentId !== id || pending.pendingCleanup !== true)
          throw Error('D62_INVALID_PENDING_INTENT');
      }
      const hasTemp = extensions.has('tmp');
      if (committed) {
        // Committed final files are never deleted. A stale .tmp has no DB
        // reference and can be removed without affecting the committed image.
        if (hasTemp) {
          if (!extensions.has('pending')) trackPendingDocument(id);
          fs.unlinkSync(path.join(root, id + '.tmp'));
          syncDirectory();
        }
        if (extensions.has('pending') || hasTemp) {
          finishPendingDocument(id);
          syncDirectory();
        }
        referenced++;
        continue;
      }
      // A crash may leave no journal at all (historical storage, an interrupted
      // cleanup, or a missing intent). Persist a new intent *before* unlinking.
      if (!extensions.has('pending')) trackPendingDocument(id);
      for (const ext of ['jpg', 'png', 'webp', 'tmp']) {
        if (extensions.has(ext)) fs.unlinkSync(path.join(root, id + '.' + ext));
      }
      // Make deletions durable before clearing the recovery evidence.
      syncDirectory();
      finishPendingDocument(id);
      syncDirectory();
      recovered++;
    }
    // Historical documents have a different storage-owned basename; only
    // remove them when the database explicitly confirms they are unreferenced.
    if (typeof isLegacyReferenced === 'function') {
      for (const filename of legacy) {
        if (isLegacyReferenced(filename)) continue;
        fs.unlinkSync(path.join(root, filename));
        syncDirectory();
        legacyRecovered++;
      }
    }
    return { recovered, referenced, legacyRecovered };
  }

  function uploadWorkerDocument({ buffer, ext }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0 || !EXTENSIONS.includes(ext)) {
      throw new Error('INVALID_DOCUMENT');
    }
    fs.mkdirSync(root, { recursive: true });
    const documentId = 'wd_' + crypto.randomBytes(16).toString('hex');
    const filename = documentId + '.' + ext;
    const finalPath = path.join(root, filename);
    const tempPath = path.join(root, documentId + '.tmp');
    trackPendingDocument(documentId);
    try {
      fs.writeFileSync(tempPath, buffer, { flag: 'wx' });
      fs.renameSync(tempPath, finalPath);
    } catch (error) {
      try {
        fs.unlinkSync(tempPath);
      } catch (cleanupError) {
        // فایل موقت اگر نمانده باشد، ذخیرهٔ اصلی انجام نشده است.
      }
      throw error;
    }
    return { documentId };
  }

  function getWorkerDocument(documentId) {
    const found = locate(documentId);
    if (!found) return null;
    return {
      documentId,
      mimeType: MIME_BY_EXT[found.ext],
      data: fs.readFileSync(found.absolute),
    };
  }

  function deleteWorkerDocument(documentId) {
    const found = locate(documentId);
    if (!found) return { deleted: false };
    fs.unlinkSync(found.absolute);
    return { deleted: true };
  }

  function discardLegacyPath(relativePath) {
    if (typeof relativePath !== 'string' || !relativePath.trim()) return false;
    const normalized = relativePath.replace(/\\/g, '/');
    const prefix = 'uploads/worker-docs/';
    if (!normalized.startsWith(prefix)) return false;
    const filename = path.basename(normalized);
    if (filename !== normalized.slice(prefix.length)) return false;
    if (!/^DOC-[A-Za-z0-9_-]{1,80}\.(jpg|png|webp)$/.test(filename)) return false;
    const absolute = path.join(root, filename);
    if (path.resolve(absolute) !== path.join(root, filename)) return false;
    if (!fs.existsSync(absolute)) return false;
    fs.unlinkSync(absolute);
    return true;
  }

  return {
    uploadWorkerDocument,
    trackPendingDocument,
    finishPendingDocument,
    reconcilePendingDocuments,
    getWorkerDocument,
    deleteWorkerDocument,
    discardLegacyPath,
  };
}

function rememberDocument(user) {
  return {
    idDoc: typeof user.idDoc === 'string' ? user.idDoc : '',
    hadPath: Object.prototype.hasOwnProperty.call(user, 'idDocPath'),
    idDocPath: user.idDocPath,
  };
}

function assignDocument(user, documentId) {
  user.idDoc = documentId;
  delete user.idDocPath;
}

function restoreDocument(user, previous) {
  user.idDoc = previous.idDoc;
  if (previous.hadPath) user.idDocPath = previous.idDocPath;
  else delete user.idDocPath;
}

module.exports = {
  createWorkerDocumentStorage,
  rememberDocument,
  assignDocument,
  restoreDocument,
};
