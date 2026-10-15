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
  }

  function finishPendingDocument(documentId) {
    try {
      fs.unlinkSync(pendingPath(documentId));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  function reconcilePendingDocuments(isReferenced) {
    if (typeof isReferenced !== 'function') throw new Error('REFERENCE_CHECK_REQUIRED');
    if (!fs.existsSync(root)) return { recovered: 0, referenced: 0 };
    let recovered = 0, referenced = 0;
    for (const filename of fs.readdirSync(root)) {
      const match = /^(wd_[0-9a-f]{32})\.pending$/.exec(filename);
      if (!match) continue;
      const documentId = match[1];
      if (isReferenced(documentId)) {
        // The DB transaction committed; only the stale intent remains.
        finishPendingDocument(documentId);
        referenced++;
        continue;
      }
      // If unlink fails this throws and the durable pending record remains.
      deleteWorkerDocument(documentId);
      finishPendingDocument(documentId);
      recovered++;
    }
    return { recovered, referenced };
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
