import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { get, put } from '@vercel/blob';

const SECRETS_PATH = 'jornada/secrets.json';

type EncryptedValue = {
  iv: string;
  tag: string;
  ciphertext: string;
  last4: string;
  updatedAt: string;
};

type SecretsFile = {
  version: 1;
  groq?: EncryptedValue;
};

function encryptionKey() {
  const base = process.env.JORNADA_SESSION_SECRET;
  if (!base) throw new Error('JORNADA_SESSION_SECRET não configurado');
  return createHash('sha256')
    .update(`${base}:jornada-private-secrets:v1`)
    .digest();
}

function encrypt(value: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    last4: value.slice(-4),
    updatedAt: new Date().toISOString(),
  };
}

function decrypt(value: EncryptedValue) {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(value.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

const secretVersions = new WeakMap<SecretsFile, string | null>();

async function readSecrets(): Promise<SecretsFile> {
  try {
    const result = await get(SECRETS_PATH, { access: 'private', useCache: false });
    if (!result) {
      const empty: SecretsFile = { version: 1 };
      secretVersions.set(empty, null);
      return empty;
    }
    if (!result.blob?.etag) throw new Error('BLOB_ETAG_MISSING');
    const file = (await new Response(result.stream).json()) as SecretsFile;
    secretVersions.set(file, result.blob.etag);
    return file;
  } catch (error) {
    // Ausência do arquivo é o estado inicial; falha de rede, autorização ou
    // JSON inválido não pode ser tratada como cofre vazio, pois uma gravação
    // posterior poderia apagar o segredo existente.
    throw error;
  }
}

async function writeSecrets(file: SecretsFile) {
  if (!secretVersions.has(file)) throw new Error('SECRETS_VERSION_REQUIRED');
  const etag = secretVersions.get(file);
  await put(SECRETS_PATH, JSON.stringify(file), {
    access: 'private',
    allowOverwrite: Boolean(etag),
    ...(etag ? { ifMatch: etag } : {}),
    addRandomSuffix: false,
    contentType: 'application/json',
  });
}

export async function getGroqApiKey() {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;

  const file = await readSecrets();
  if (!file.groq) return null;

  try {
    return decrypt(file.groq);
  } catch {
    return null;
  }
}

export async function getGroqSecretStatus() {
  if (process.env.GROQ_API_KEY) {
    return {
      configured: true,
      source: 'environment' as const,
      last4: process.env.GROQ_API_KEY.slice(-4),
    };
  }

  const file = await readSecrets();
  let decryptable = false;
  if (file.groq) {
    try {
      decryptable = Boolean(decrypt(file.groq));
    } catch {
      // Do not call a stored key "configured" when it cannot be decrypted.
    }
  }
  return {
    configured: decryptable,
    source: file.groq ? ('encrypted-store' as const) : ('none' as const),
    last4: decryptable ? file.groq?.last4 || null : null,
    updatedAt: file.groq?.updatedAt || null,
  };
}

export async function saveGroqApiKey(apiKey: string) {
  const normalized = apiKey.trim();
  if (!normalized || normalized.length < 20) {
    throw new Error('INVALID_GROQ_KEY');
  }

  const file = await readSecrets();
  file.groq = encrypt(normalized);
  await writeSecrets(file);
}

export async function removeStoredGroqApiKey() {
  if (process.env.GROQ_API_KEY) {
    throw new Error('GROQ_KEY_MANAGED_BY_ENV');
  }
  const file = await readSecrets();
  delete file.groq;
  await writeSecrets(file);
}
