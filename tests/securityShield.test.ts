import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptSecret,
  decryptSecret,
  sanitizeSafePath,
  validateSafeFileName,
  sanitizeRouterOsParam,
  buildSafeScriptVar,
  isAllowedOrigin
} from '../src/server/security-shield.ts';

describe('Security Shield & Cryptographic Vault', () => {
  it('encrypts and decrypts secrets symmetrically using AES-256-GCM', () => {
    const plain = 'MikroTik_SuperSecret#2026!';
    const encrypted = encryptSecret(plain);
    assert.notEqual(encrypted, plain);
    assert.equal(encrypted.split(':').length, 3);

    const decrypted = decryptSecret(encrypted);
    assert.equal(decrypted, plain);
  });

  it('rejects tampered AES-256-GCM ciphertext', () => {
    const encrypted = encryptSecret('admin123');
    const [iv, tag, data] = encrypted.split(':');
    const tamperedTag = tag.slice(0, -2) + (tag.endsWith('00') ? 'ff' : '00');
    const result = decryptSecret(`${iv}:${tamperedTag}:${data}`);
    assert.equal(result, null);
  });

  it('blocks directory traversal and double URL-encoded attacks', () => {
    const traversal1 = sanitizeSafePath('../../etc/passwd', 'hotspot');
    assert.equal(traversal1.isSafe, false);

    const traversal2 = sanitizeSafePath('%252e%252e/system/script', 'hotspot');
    assert.equal(traversal2.isSafe, false);

    const validPath = sanitizeSafePath('login.html', 'hotspot');
    assert.equal(validPath.isSafe, true);
    assert.equal(validPath.safePath, 'hotspot/login.html');
  });

  it('validates safe filenames and strips RouterOS script injections', () => {
    assert.equal(validateSafeFileName('alogin.html'), true);
    assert.equal(validateSafeFileName('../evil.sh'), false);

    const dirtyParam = 'user1$[/system reboot]`rm -rf`';
    const cleanParam = sanitizeRouterOsParam(dirtyParam);
    assert.equal(cleanParam.includes('$['), false);
    assert.equal(cleanParam.includes('`'), false);

    const safeScriptVar = buildSafeScriptVar('my_var', 'val"with$quotes');
    assert.match(safeScriptVar, /^:global my_var /);
  });

  it('validates allowed origins for LAN and Cloud Run', () => {
    assert.equal(isAllowedOrigin('http://192.168.88.1:3000'), true);
    assert.equal(isAllowedOrigin('https://ais-dev-example.run.app'), true);
    assert.equal(isAllowedOrigin('https://malicious-attacker.example.org'), false);
  });
});
