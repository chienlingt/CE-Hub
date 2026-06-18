// server/middleware/upload.js
// Multer file upload middleware for driver POD photos and report evidence.
const multer = require('multer');
const fs     = require('fs');
const path   = require('path');

/** Pick upload folder: issue evidence → report; POD / status updates → status. */
function resolveEvidenceSubDir(req) {
  if (req.path.endsWith('/report')) return 'report';
  if (req.body?.status === 'Issue') return 'report';
  return 'status';
}

function evidenceFilePath(orderId, subDir, filename) {
  return `/uploads/orders/del/${subDir}/${orderId}/${filename}`;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const orderId = req.params.orderId || req.params.id || 'unknown';
    const subDir  = resolveEvidenceSubDir(req);
    const dir     = path.join(__dirname, '..', 'uploads', 'orders', 'del', subDir, orderId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    // Strip spaces/special chars so URLs never need fragile %20 lookups on disk.
    const safe = path.basename(file.originalname).replace(/[^\w.\-()+]/g, '_');
    const unique = `${Date.now()}-${safe}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter(req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

module.exports = upload;
module.exports.resolveEvidenceSubDir = resolveEvidenceSubDir;
module.exports.evidenceFilePath = evidenceFilePath;
