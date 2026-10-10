/**
 * One synthetic Groq request, authorized owner only. No personal data leaves
 * Jornada. Uses existing local Vercel CLI credential injection; never
 * outputs the API key, decrypted vault or provider response body.
 */
import { get } from '@vercel/blob';
import { createHash, createDecipheriv } from 'node:crypto';
import { verifyJornadaLink } from './verify-jornada-link.mjs';

function readVaultKey(encrypted, secret) {
  const key = createHash('sha256').update(`${secret}:jornada-private-secrets:v1`).digest();
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } finally {
    key.fill(0);
  }
}

async function probe() {
  verifyJornadaLink();
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
  let key = process.env.GROQ_API_KEY || '';
  let keySource = key ? 'environment' : 'encrypted-store';

  if (!key) {
    // Read only the Groq vault of the explicitly linked Jornada project.
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.log(JSON.stringify({ status: 'KEY_UNAVAILABLE', reason: 'BLOB_ENV_NOT_AVAILABLE' }));
      return;
    }
    const result = await get('jornada/secrets.json', { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) {
      console.log(JSON.stringify({ status: 'KEY_UNAVAILABLE', reason: 'VAULT_NOT_FOUND' }));
      return;
    }
    const file = await new Response(result.stream).json();
    if (!file?.groq) {
      console.log(JSON.stringify({ status: 'KEY_UNAVAILABLE', reason: 'GROQ_NOT_STORED' }));
      return;
    }
    if (!process.env.JORNADA_SESSION_SECRET) {
      console.log(JSON.stringify({ status: 'KEY_UNAVAILABLE', reason: 'SESSION_SECRET_NOT_IN_CLI_ENV' }));
      return;
    }
    try {
      key = readVaultKey(file.groq, process.env.JORNADA_SESSION_SECRET);
    } catch {
      console.log(JSON.stringify({ status: 'KEY_UNAVAILABLE', reason: 'VAULT_DECRYPTION_FAILED' }));
      return;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Teste técnico sintético. Responda só com a palavra OK.' }],
        max_completion_tokens: 128,
        temperature: 0,
      }),
      signal: controller.signal,
      cache: 'no-store',
    });
    let usage;
    if (response.ok) {
      const parsed = await response.json();
      usage = Number.isFinite(parsed?.usage?.total_tokens) ? parsed.usage.total_tokens : null;
    } else {
      // Ignore response body; provider messages may contain identifying data.
      await response.body?.cancel();
    }
    console.log(JSON.stringify({
      provider: 'groq',
      status: response.ok ? 'SYNTHETIC_REQUEST_OK' : 'SYNTHETIC_REQUEST_FAILED',
      httpStatus: response.status,
      model, keySource,
      totalTokens: usage ?? null,
      privateJornadaDataSent: false,
      productionStateModified: false,
    }));
    if (!response.ok) process.exitCode = 2;
  } catch {
    console.log(JSON.stringify({ provider: 'groq', status: 'SYNTHETIC_REQUEST_FAILED',
      reason: 'NETWORK_OR_TIMEOUT', productionStateModified: false }));
    process.exitCode = 2;
  } finally {
    clearTimeout(timeout);
    key = '';
  }
}

probe().catch(() => {
  // Do not expose error messages from failed authenticated storage reads.
  console.error('GROQ_PROBE_BLOCKED');
  process.exitCode = 1;
});
