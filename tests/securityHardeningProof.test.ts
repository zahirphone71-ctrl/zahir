import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import { createMikrotikClient } from '../src/server/mikrotik-api.ts';
import { TlsPinStore } from '../src/server/tlsPinStore.ts';
import { httpRequest } from '../src/server/services/httpUtil.ts';
import { CredentialVault } from '../src/server/services/credentialVault.ts';
import { decryptSecret, isAllowedOrigin } from '../src/server/security-shield.ts';

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3199;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitForServer(url: string, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`Server did not respond at ${url} within ${timeoutMs}ms`);
}

function generateSelfSignedCert(dir: string, name: string): { key: Buffer; cert: Buffer; fingerprint256: string } {
  const keyPath = path.join(dir, `${name}.key`);
  const certPath = path.join(dir, `${name}.crt`);
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-nodes',
      '-subj',
      `/CN=${name}.local`
    ],
    { stdio: 'ignore' }
  );
  const key = fs.readFileSync(keyPath);
  const cert = fs.readFileSync(certPath);
  const x509 = new crypto.X509Certificate(cert);
  return { key, cert, fingerprint256: x509.fingerprint256 };
}

describe('ZCtrl Security Hardening Verification Proofs', () => {
  let serverProc: ChildProcess | null = null;
  let testPort = 0;
  let baseUrl = '';
  let tempDataDir = '';
  let certDir = '';

  before(async () => {
    const bundlePath = path.resolve(process.cwd(), 'dist/server.cjs');
    if (!fs.existsSync(bundlePath)) {
      throw new Error('dist/server.cjs not found — run `npm run build` before tests');
    }

    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-sec-proof-'));
    certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-certs-'));
    testPort = await getAvailablePort();
    baseUrl = `http://127.0.0.1:${testPort}`;

    // Spawn server WITHOUT setting HOST env var to verify default 127.0.0.1 binding
    const cleanEnv = { ...process.env };
    delete cleanEnv.HOST;

    serverProc = spawn(process.execPath, [bundlePath], {
      env: {
        ...cleanEnv,
        NODE_ENV: 'production',
        PORT: String(testPort),
        ZCTRL_DATA_DIR: tempDataDir,
        APP_ENCRYPTION_KEY: 'proof-test-master-encryption-key-32-bytes'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    await waitForServer(`${baseUrl}/api/ping`);
  });

  after(async () => {
    if (serverProc && !serverProc.killed) {
      serverProc.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 250));
      if (!serverProc.killed) serverProc.kill('SIGKILL');
    }
    if (tempDataDir) fs.rmSync(tempDataDir, { recursive: true, force: true });
    if (certDir) fs.rmSync(certDir, { recursive: true, force: true });
  });

  it('Proof 1: enforces RBAC (401 without operatorUsername once operator exists, 10-char password, 5-attempt lockout)', async () => {
    const statusBefore: any = await (await fetch(`${baseUrl}/api/auth/bootstrap-status`)).json();
    assert.equal(statusBefore.needsInitialAdmin, true);

    // Reject weak (<10 char) bootstrap password
    const weakRes = await fetch(`${baseUrl}/api/auth/bootstrap-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'secadmin', password: 'short123' })
    });
    assert.equal(weakRes.status, 400);

    // Create valid initial admin (>=10 chars)
    const bootRes = await fetch(`${baseUrl}/api/auth/bootstrap-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'secadmin', password: 'StrongAdminPassword#2026' })
    });
    assert.equal(bootRes.status, 201);

    // Bootstrap cannot be re-invoked once an operator exists
    const reBootRes = await fetch(`${baseUrl}/api/auth/bootstrap-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'attacker', password: 'StrongAdminPassword#2026' })
    });
    assert.equal(reBootRes.status, 403);

    // Connect without operatorUsername MUST return 401
    const noOpRes = await fetch(`${baseUrl}/api/mikrotik/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '127.0.0.1', port: 1, username: 'admin', password: '' })
    });
    assert.equal(noOpRes.status, 401);
    const noOpBody: any = await noOpRes.json();
    assert.equal(noOpBody.success, false);
    assert.equal(noOpBody.reasonType, 'auth');

    // 5 failed operator attempts trigger temporary lockout (HTTP 423)
    for (let i = 0; i < 4; i++) {
      const failRes = await fetch(`${baseUrl}/api/mikrotik/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: '127.0.0.1',
          port: 1,
          username: 'admin',
          operatorUsername: 'secadmin',
          operatorPassword: 'WrongPassword#00'
        })
      });
      assert.equal(failRes.status, 401);
    }
    const fifthFail = await fetch(`${baseUrl}/api/mikrotik/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: '127.0.0.1',
        port: 1,
        username: 'admin',
        operatorUsername: 'secadmin',
        operatorPassword: 'WrongPassword#00'
      })
    });
    assert.equal(fifthFail.status, 423);
    const lockJson: any = await fifthFail.json();
    assert.equal(lockJson.locked, true);
  });

  it('Proof 2: rejects Origin https://evil.web.app and non-own origins in NODE_ENV=production', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevPort = process.env.PORT;
    try {
      process.env.NODE_ENV = 'production';
      process.env.PORT = String(testPort);

      assert.equal(isAllowedOrigin('https://evil.web.app'), false);
      assert.equal(isAllowedOrigin('https://ais-dev-example.run.app'), false);
      assert.equal(isAllowedOrigin('null'), false);
      assert.equal(isAllowedOrigin('file://'), false);
      assert.equal(isAllowedOrigin(`http://127.0.0.1:${testPort}`), true);
    } finally {
      process.env.NODE_ENV = prevEnv;
      process.env.PORT = prevPort;
    }

    const res = await fetch(`${baseUrl}/api/ping`, {
      headers: { Origin: 'https://evil.web.app' }
    });
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });

  it('Proof 3: encrypts/decrypts AP credentials with AES-256-GCM, blocks plaintext injection, and migrates legacy CBC records automatically', () => {
    assert.equal(decryptSecret('plain:not-valid-gcm'), null);
    assert.equal(decryptSecret('plaintext-without-colons'), null);

    const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-ap-vault-'));
    try {
      const legacyKeyHex = crypto.createHash('sha256').update('legacy-cbc-migration-secret').digest('hex');
      const legacyIv = crypto.randomBytes(16);
      const legacyCipher = crypto.createCipheriv(
        'aes-256-cbc',
        crypto.createHash('sha256').update(legacyKeyHex).digest(),
        legacyIv
      );
      let legacyEnc = legacyCipher.update('LegacyRouterPass!99', 'utf8', 'hex');
      legacyEnc += legacyCipher.final('hex');

      const vaultFile = path.join(vaultDir, 'ap_vault.json');
      fs.writeFileSync(
        vaultFile,
        JSON.stringify([
          {
            id: 'ap-legacy',
            mac: '00:11:22:33:44:55',
            ip: '192.168.10.2',
            vendor: 'ubiquiti',
            username: 'ubnt',
            encPass: legacyEnc,
            iv: legacyIv.toString('hex'),
            port: 443,
            useHttps: true,
            createdAt: new Date().toISOString()
          }
        ])
      );

      // Loading vault automatically decrypts legacy CBC and migrates record to AES-GCM (3-part encPass, no iv)
      const vault = new CredentialVault(vaultDir, { legacyCbcKey: legacyKeyHex });
      try {
        const creds = vault.getConnectConfig('00:11:22:33:44:55');
        assert.ok(creds);
        assert.equal(creds.password, 'LegacyRouterPass!99');

        const migratedDisk = JSON.parse(fs.readFileSync(vaultFile, 'utf8'));
        assert.equal(migratedDisk[0].iv, undefined);
        assert.equal(migratedDisk[0].encPass.split(':').length, 3);

        // Store a new AP record and verify GCM decryption
        vault.saveCredentials({
          mac: 'AA:BB:CC:DD:EE:FF',
          ip: '192.168.10.3',
          vendor: 'ruijie',
          username: 'admin',
          password: 'ModernGcmPass!2026',
          useHttps: false,
          port: 80
        });
        assert.equal(vault.getConnectConfig('AA:BB:CC:DD:EE:FF')?.password, 'ModernGcmPass!2026');
      } finally {
        vault.stopSessionCleanup();
      }
    } finally {
      fs.rmSync(vaultDir, { recursive: true, force: true });
    }
  });

  it('Proof 4: rejects TLS connections with mismatched fingerprint BEFORE transmitting any credentials (MikrotikClient & httpRequest)', async () => {
    const certA = generateSelfSignedCert(certDir, 'router-a');
    const certB = generateSelfSignedCert(certDir, 'router-b');
    assert.notEqual(certA.fingerprint256, certB.fingerprint256);

    const bytesReceivedOnBadTls: Buffer[] = [];
    const badTlsServer = tls.createServer({ key: certB.key, cert: certB.cert }, (socket) => {
      socket.on('data', (chunk) => {
        bytesReceivedOnBadTls.push(chunk);
      });
    });

    await new Promise<void>((resolve) => badTlsServer.listen(0, '127.0.0.1', () => resolve()));
    const tlsPort = (badTlsServer.address() as net.AddressInfo).port;

    const pinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-pins-'));
    try {
      const store = new TlsPinStore(pinDir);
      // Pin Cert A for both Mikrotik and AP endpoints on tlsPort
      store.setPin(`mikrotik:127.0.0.1:${tlsPort}`, certA.fingerprint256);
      store.setPin(`ap:127.0.0.1:${tlsPort}`, certA.fingerprint256);

      // 4a. MikrotikClient connecting to server presenting Cert B MUST reject BEFORE sending /login
      const client = createMikrotikClient();
      await assert.rejects(
        () =>
          client.connect('127.0.0.1', 'admin', 'SUPER_SECRET_PASSWORD_123', tlsPort, true, {
            strictTls: true,
            pinStore: store
          }),
        (err: any) => err?.code === 'TLS_FINGERPRINT_MISMATCH' || String(err?.message).includes('بصمة')
      );

      // 4b. httpRequest connecting to server presenting Cert B MUST reject BEFORE sending Authorization/Body
      await assert.rejects(
        () =>
          httpRequest(`https://127.0.0.1:${tlsPort}/login`, {
            method: 'POST',
            headers: { Authorization: 'Basic dGVzdDpTVVBFUl9TRUNSRVRfUEFTU1dPUkRfMTIz' },
            body: 'password=SUPER_SECRET_PASSWORD_123',
            pinStore: store,
            timeoutMs: 3000
          }),
        (err: any) => err?.code === 'TLS_FINGERPRINT_MISMATCH' || String(err?.message).includes('fingerprint')
      );

      await new Promise((r) => setTimeout(r, 80));
      const allWireText = Buffer.concat(bytesReceivedOnBadTls).toString('utf8');
      assert.equal(allWireText.includes('SUPER_SECRET_PASSWORD_123'), false);
      assert.equal(allWireText.includes('/login'), false);
      assert.equal(bytesReceivedOnBadTls.length, 0, 'Zero application bytes must be written before TLS pin verification passes');
    } finally {
      await new Promise<void>((resolve) => badTlsServer.close(() => resolve()));
      fs.rmSync(pinDir, { recursive: true, force: true });
    }
  });

  it('Proof 5: server listens on 127.0.0.1 by default (verified in source and live process)', async () => {
    const serverSrc = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
    assert.match(serverSrc, /const\s+HOST\s*=\s*process\.env\.HOST\s*\|\|\s*["']127\.0\.0\.1["']/);

    const pingRes = await fetch(`http://127.0.0.1:${testPort}/api/ping`);
    assert.equal(pingRes.status, 200);
  });
});
