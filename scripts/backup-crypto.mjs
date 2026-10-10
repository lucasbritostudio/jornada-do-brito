import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

export const PROJECT_ID = 'prj_nZMJzmOo0jsL9tFqfpT6lqdLm3c6';
const FORMAT = 'JORNADA_PRIVATE_BACKUP_V1';
const CONTEXT = Buffer.from(FORMAT + '|' + PROJECT_ID, 'utf8');
const MAX_BACKUP_BYTES = 64 * 1024 * 1024;

function keyFor(passphrase, salt) {
  if (typeof passphrase !== 'string' || passphrase.length < 16) {
    throw new Error('BACKUP_PASSWORD_TOO_SHORT');
  }
  return scryptSync(passphrase, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export function checksum(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function validateManifest(manifest) {
  if (manifest?.format !== FORMAT || manifest?.projectId !== PROJECT_ID ||
      !Array.isArray(manifest.objects) || manifest.objects.length < 1 ||
      manifest.objects.length > 1000) throw new Error('BACKUP_MANIFEST_INVALID');
  const paths = new Set();
  let totalBytes = 0;
  for (const record of manifest.objects) {
    if (typeof record?.pathname !== 'string' ||
        !record.pathname.startsWith('jornada/') ||
        record.pathname.includes('..') ||
        /[\\\r\n\0]/.test(record.pathname) ||
        paths.has(record.pathname) ||
        typeof record?.base64 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(record?.sha256 || '') ||
        !Number.isSafeInteger(record?.size) || record.size < 0 || record.size > MAX_BACKUP_BYTES) {
      throw new Error('BACKUP_MANIFEST_INVALID');
    }
    paths.add(record.pathname);
    const value = Buffer.from(record.base64, 'base64');
    if (value.length !== record.size || checksum(value) !== record.sha256) {
      throw new Error('BACKUP_INTEGRITY_INVALID');
    }
    totalBytes += value.length;
    if (totalBytes > MAX_BACKUP_BYTES) throw new Error('BACKUP_TOO_LARGE');
  }
  return { objects: paths.size, totalBytes };
}

export function encryptManifest(manifest, passphrase) {
  const info = validateManifest(manifest);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = keyFor(passphrase, salt);
  const cleartext = Buffer.from(JSON.stringify(manifest), 'utf8');
  let ciphertext;
  let tag;
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(CONTEXT);
    ciphertext = Buffer.concat([cipher.update(cleartext), cipher.final()]);
    tag = cipher.getAuthTag();
  } finally {
    key.fill(0);
    cleartext.fill(0);
  }
  return {
    format: FORMAT, algorithm: 'aes-256-gcm', kdf: 'scrypt-N32768-r8-p1',
    salt: salt.toString('base64'), iv: iv.toString('base64'),
    tag: tag.toString('base64'), payload: ciphertext.toString('base64'),
    counts: { objects: info.objects },
  };
}

export function decryptBackup(envelope, passphrase) {
  if (envelope?.format !== FORMAT || envelope?.algorithm !== 'aes-256-gcm' ||
      envelope?.kdf !== 'scrypt-N32768-r8-p1' || typeof envelope?.payload !== 'string' ||
      envelope.payload.length > MAX_BACKUP_BYTES * 2 ||
      typeof envelope?.salt !== 'string' || typeof envelope?.iv !== 'string' ||
      typeof envelope?.tag !== 'string') throw new Error('BACKUP_ENVELOPE_INVALID');
  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) {
    throw new Error('BACKUP_ENVELOPE_INVALID');
  }
  const key = keyFor(passphrase, salt);
  let plaintext;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(CONTEXT);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.payload, 'base64')),
      decipher.final(),
    ]);
    const manifest = JSON.parse(plaintext.toString('utf8'));
    const result = validateManifest(manifest);
    if (envelope.counts?.objects !== result.objects) throw new Error('BACKUP_COUNT_MISMATCH');
    return result;
  } finally {
    key.fill(0);
    plaintext?.fill(0);
  }
}

export function createManifest(objects) {
  return {
    format: FORMAT,
    projectId: PROJECT_ID,
    createdAt: new Date().toISOString(),
    objects: objects.map(({ pathname, content }) => ({
      pathname, size: content.length,
      sha256: checksum(content),
      base64: content.toString('base64'),
    })),
  };
}
