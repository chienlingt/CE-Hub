// server/services/odooProofFiles.js
//
// FRD §12 data points 26-27 (customer signature, delivery photo/proof) and the damaged
// units' evidence, as files for Odoo. Outbox rows store only references; the worker reads
// the files here when it sends them, so a 5 MB photo never sits in integration_outbox.
//
//   RPC mode  -> ir.attachment on the stock.picking (odooService.attachOdooFiles)
//   HTTP mode -> inline base64 in the callback envelope (odooCallbackEnvelope.js)
//
// Nothing here makes /uploads public: Odoo receives its own copy of each file.

const fs = require('fs/promises');
const path = require('path');
const prisma = require('../prismaClient');

const UPLOADS_ROOT = path.resolve(__dirname, '..', 'uploads');
const MIME_BY_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic' };

/** Absolute path for a stored `/uploads/...` reference, or null if it escapes the uploads folder. */
function resolveUploadPath(reference) {
  if (typeof reference !== 'string' || !reference.startsWith('/uploads/')) return null;
  const absolute = path.resolve(UPLOADS_ROOT, `.${reference.slice('/uploads'.length)}`);
  return absolute.startsWith(UPLOADS_ROOT + path.sep) ? absolute : null;
}

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/[\w.+-]+);base64,(.+)$/s.exec(dataUrl || '');
  return match ? { mimetype: match[1], base64: match[2] } : null;
}

// Stable, readable name: the same file always gets the same name, so a retried
// RPC upload can find it on the picking instead of attaching it twice.
function attachmentName(payload, kind, basename) {
  const order = String(payload.ce_hub_order_ref || 'order').slice(0, 8);
  return `cehub-${order}-a${payload.attempt_no || 1}-${kind}-${basename}`;
}

async function readUpload(reference) {
  const absolute = resolveUploadPath(reference);
  if (!absolute) return null;
  try {
    const content = await fs.readFile(absolute);
    return {
      basename: path.basename(absolute),
      mimetype: MIME_BY_EXT[path.extname(absolute).toLowerCase()] || 'application/octet-stream',
      base64: content.toString('base64'),
    };
  } catch (error) {
    console.warn(`[OdooProof] ${reference} could not be read (${error.code || error.message}); sending without it.`);
    return null;
  }
}

/**
 * The proof files one Odoo event carries.
 *
 * @param {object} payload - an outbox payload from odooPayloadBuilder.buildOdooEventPayload
 * @returns {Promise<Array<{ kind: 'signature'|'photo'|'damage'|'failure_evidence', filename: string,
 *   mimetype: string, base64: string, source: string }>>}
 */
async function proofFilesFor(payload, db = prisma) {
  if (!payload || !['Delivered', 'Failed'].includes(payload.status)) return [];
  const files = [];
  const seen = new Set();
  const add = async (kind, reference) => {
    if (!reference || seen.has(reference)) return;
    seen.add(reference);
    const file = await readUpload(reference);
    if (file) files.push({ kind, filename: attachmentName(payload, kind, file.basename), mimetype: file.mimetype, base64: file.base64, source: reference });
  };

  if (payload.status === 'Delivered' && payload.signature_captured && payload.ce_hub_order_ref) {
    const order = await db.orders.findUnique({ where: { id: payload.ce_hub_order_ref }, select: { proof_of_delivery_url: true } });
    const signature = parseDataUrl(order?.proof_of_delivery_url);
    if (signature) {
      const extension = signature.mimetype.split('/')[1].replace('jpeg', 'jpg');
      files.push({ kind: 'signature', filename: attachmentName(payload, 'signature', `signature.${extension}`), ...signature, source: 'orders.proof_of_delivery_url' });
    }
  }
  // Damage photos first: on a failure they are also in the attempt's evidence list, and
  // each file is sent once, under its most specific kind.
  for (const line of payload.order_lines || []) {
    for (const exception of line.exceptions || []) {
      for (const reference of exception.evidence_paths || []) await add('damage', reference);
    }
  }
  for (const reference of payload.proof_photo_paths || []) await add('photo', reference);
  for (const reference of payload.evidence_paths || []) await add('failure_evidence', reference);
  return files;
}

module.exports = { proofFilesFor, resolveUploadPath, parseDataUrl, attachmentName };
