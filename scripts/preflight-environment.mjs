/**
 * Read-only environment presence check. Never prints or stores secret values.
 * Run only after scripts/verify-jornada-link.mjs succeeds.
 */
import { verifyJornadaLink } from './verify-jornada-link.mjs';

try {
  verifyJornadaLink();
} catch (err) {
  console.error(err instanceof Error ? err.message : 'PROJECT_LINK_INVALID');
  process.exit(4);
}

const needs = {
  storage: ['BLOB_READ_WRITE_TOKEN'],
  authentication: ['JORNADA_SESSION_SECRET', 'JORNADA_BOOTSTRAP_TOKEN'],
  whatsapp: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET'],
};

let missing = 0;
for (const [name, keys] of Object.entries(needs)) {
  const absent = keys.filter((key) => !process.env[key]?.trim());
  if (absent.length) missing += absent.length;
  console.log(JSON.stringify({
    integration: name,
    configured: absent.length === 0,
    missingVariableNames: absent,
  }));
}
console.log(JSON.stringify({
  integration: 'groq',
  environmentKeyPresent: Boolean(process.env.GROQ_API_KEY?.trim()),
  note: 'Encrypted Groq key may alternatively be stored in private Blob; this preflight cannot validate that vault.',
}));
if (missing) process.exitCode = 2;
