import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createManifest, encryptManifest, decryptBackup, validateManifest } from '../scripts/backup-crypto.mjs';
const passphrase = 'synthetic-secret-for-tests-only';
const objects = [
  { pathname: 'jornada/state.json', content: Buffer.from('{"synthetic":true}') },
  { pathname: 'jornada/auth.json', content: Buffer.from('{"synthetic":false}') },
  { pathname: 'jornada/secrets.json', content: Buffer.from('{"synthetic":null}') },
];
test('encrypts and validates all synthetic objects without cleartext in backup file', () => {
  const backup = encryptManifest(createManifest(objects), passphrase);
  assert.equal(decryptBackup(backup, passphrase).objects, 3);
  assert.doesNotMatch(JSON.stringify(backup), /synthetic|jornada\/state\.json/);
});
test('wrong password fails without exposing the plaintext', () => {
  const backup = encryptManifest(createManifest(objects), passphrase);
  assert.throws(() => decryptBackup(backup, 'different-secret-1234567890'));
});
test('corrupted backup fails authentication', () => {
  const backup = encryptManifest(createManifest(objects), passphrase);
  const data = Buffer.from(backup.payload, 'base64');
  data[0] ^= 1;
  assert.throws(() => decryptBackup({ ...backup, payload: data.toString('base64') }, passphrase));
});
test('a forged, duplicate or modified record cannot pass integrity checks', () => {
  const snapshot = createManifest(objects);
  assert.equal(validateManifest(snapshot).objects, 3);
  const copy = structuredClone(snapshot);
  copy.objects[0].sha256 = 'a'.repeat(64);
  assert.throws(() => validateManifest(copy), /INTEGRITY/);
  snapshot.objects.push({ ...snapshot.objects[0] });
  assert.throws(() => validateManifest(snapshot), /MANIFEST/);
});
test('a short passphrase or different project is rejected', () => {
  const manifest = createManifest(objects);
  assert.throws(() => encryptManifest(manifest, 'short'), /PASSWORD_TOO_SHORT/);
  manifest.projectId = 'prj_other';
  assert.throws(() => encryptManifest(manifest, passphrase), /MANIFEST/);
});
