import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  RbacService,
  hashPassword,
  verifyPassword,
  isAuthorizedForRequest
} from '../src/server/rbac.ts';

describe('Operator Role-Based Access Control (RBAC)', () => {
  it('hashes and verifies operator passwords using scrypt and timingSafeEqual', () => {
    const hash = hashPassword('CashierPass#99');
    assert.equal(verifyPassword('CashierPass#99', hash), true);
    assert.equal(verifyPassword('WrongPass', hash), false);
  });

  it('manages operator lifecycle and enforces role permissions', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-rbac-test-'));
    try {
      const service = new RbacService(tempDir);
      assert.equal(service.hasCustomOperators(), false);

      const cashier = service.createOperator({
        username: 'sales1',
        password: 'password123',
        role: 'cashier',
        displayName: 'نقطة مبيعات 1'
      });

      assert.equal(cashier.username, 'sales1');
      assert.equal(cashier.role, 'cashier');
      assert.equal(service.hasCustomOperators(), true);

      const authOk = service.authenticateOperator('sales1', 'password123');
      assert.ok(authOk);
      assert.equal(authOk?.role, 'cashier');

      const authFail = service.authenticateOperator('sales1', 'badpass');
      assert.equal(authFail, null);

      // Permission Matrix Verification
      assert.equal(isAuthorizedForRequest('admin', 'POST', '/api/mikrotik/firewall/quick-harden').allowed, true);
      assert.equal(isAuthorizedForRequest('cashier', 'POST', '/api/vouchers/generate').allowed, true);
      assert.equal(isAuthorizedForRequest('cashier', 'POST', '/api/mikrotik/hotspot/active/disconnect').allowed, true);
      assert.equal(isAuthorizedForRequest('cashier', 'POST', '/api/mikrotik/firewall/quick-harden').allowed, false);
      assert.equal(isAuthorizedForRequest('viewer', 'GET', '/api/mikrotik/status').allowed, true);
      assert.equal(isAuthorizedForRequest('viewer', 'POST', '/api/vouchers/generate').allowed, false);
      assert.equal(isAuthorizedForRequest('cashier', 'GET', '/api/auth/operators').allowed, false);

      // Disable operator
      service.updateOperator(cashier.id, { disabled: true });
      assert.equal(service.authenticateOperator('sales1', 'password123'), null);

      // Delete operator
      assert.equal(service.deleteOperator(cashier.id), true);
      assert.equal(service.listOperators().length, 0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
