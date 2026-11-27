import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {
  AutoPingStabilizer,
  applyRouterPingFastLane,
  getRouterPingFastLaneStatus,
  previewRouterPingFastLaneRules,
  removeRouterPingFastLane,
  runActivePingProbe,
  ZCTRL_QOS_COMMENT_TAG,
  ZCTRL_QOS_QUEUE_NAME,
  type RouterClientLike
} from '../src/server/ping-stabilizer';
import { MikroTikRequestThrottler } from '../src/server/mikrotik-api';
import { createSystemDiagnosticsRoutes } from '../src/server/routes/systemDiagnosticsRoutes';
import { routerClients } from '../src/server/runtimeContext';

test('AutoPingStabilizer uses 3-sample hysteresis, calm baseline pacing, and escalates/recovers smoothly', () => {
  const stabilizer = new AutoPingStabilizer({ mode: 'auto', targetPingMs: 45, maxCpuThreshold: 75 });

  // Healthy baseline samples (autoQosEnabled defaults to false)
  let snap = stabilizer.recordSample({ pingMs: 12, cpuLoad: 18, packetLoss: 0 });
  snap = stabilizer.recordSample({ pingMs: 14, cpuLoad: 20, packetLoss: 0 });
  assert.equal(snap.autoQosEnabled, false);
  assert.equal(snap.state, 'optimal');
  assert.equal(snap.recommendedMaxConcurrent, 2);
  assert.equal(snap.recommendedPacingMs, 8);
  assert.equal(snap.suppressHeavyTelemetry, false);
  assert.ok(snap.ewmaPingMs >= 12 && snap.ewmaPingMs <= 15);

  // Single transient spike must NOT flip state (hysteresis requires 3 consecutive readings)
  snap = stabilizer.recordSample({ pingMs: 190, cpuLoad: 88, packetLoss: 25 });
  assert.equal(snap.state, 'optimal');
  snap = stabilizer.recordSample({ pingMs: 195, cpuLoad: 89, packetLoss: 25 });
  assert.equal(snap.state, 'optimal');

  // 3rd consecutive reading in the same critical direction triggers transition
  snap = stabilizer.recordSample({ pingMs: 200, cpuLoad: 90, packetLoss: 25 });
  assert.ok(snap.state === 'stabilizing' || snap.state === 'critical');
  assert.equal(snap.recommendedMaxConcurrent, 1);
  assert.equal(snap.suppressHeavyTelemetry, true);
  assert.ok(snap.recommendedWsIntervalMs >= 10000);
  assert.ok(snap.recommendedPacingMs >= 75);
  assert.ok(snap.recentActions.length > 0);
  assert.equal(snap.history.length, 5);

  // Recovery back to healthy RTT & CPU
  for (let i = 0; i < 15; i++) {
    snap = stabilizer.recordSample({ pingMs: 10, cpuLoad: 15, packetLoss: 0 });
  }
  assert.equal(snap.state, 'optimal');
  assert.equal(snap.recommendedMaxConcurrent, 2);
  assert.equal(snap.recommendedPacingMs, 8);
  assert.equal(snap.suppressHeavyTelemetry, false);
});

test('AutoPingStabilizer respects aggressive, balanced, off modes and resetStats', () => {
  const stabilizer = new AutoPingStabilizer({ mode: 'aggressive', targetPingMs: 30 });
  const aggSnap = stabilizer.recordSample({ pingMs: 20, cpuLoad: 25 });
  assert.equal(aggSnap.mode, 'aggressive');
  assert.equal(aggSnap.recommendedMaxConcurrent, 1);
  assert.ok(aggSnap.recommendedPacingMs >= 15);

  // 3 consecutive elevated readings escalate aggressive mode to elevated/stabilizing
  let aggElevated = aggSnap;
  for (let i = 0; i < 3; i++) {
    aggElevated = stabilizer.recordSample({ pingMs: 42, cpuLoad: 40 });
  }
  assert.ok(aggElevated.state === 'elevated' || aggElevated.state === 'stabilizing');
  assert.ok(aggElevated.recommendedPacingMs >= 45);

  const offSnap = stabilizer.updateConfig({ mode: 'off' });
  assert.equal(offSnap.mode, 'off');
  assert.equal(offSnap.suppressHeavyTelemetry, false);

  const resetSnap = stabilizer.resetStats();
  assert.equal(resetSnap.samplesCount, 0);
  assert.equal(resetSnap.ewmaPingMs, 0);
  assert.equal(resetSnap.history.length, 0);
});

test('MikroTikRequestThrottler respects 75% CPU / 100ms ICMP ping thresholds and calm 8ms default pacing', () => {
  const throttler = new MikroTikRequestThrottler();
  assert.equal(throttler.getStats().maxConcurrent, 2);
  assert.equal(throttler.getEffectivePacingMs(), 8);

  // Moderate CPU (e.g. 60%) no longer prematurely throttles to 1
  throttler.updateCpuLoad(60);
  assert.equal(throttler.getStats().maxConcurrent, 2);

  // CPU above 75% triggers throttling
  throttler.updateCpuLoad(78);
  assert.equal(throttler.getStats().maxConcurrent, 1);
  assert.ok(throttler.getEffectivePacingMs() >= 55);

  // High ICMP ping (> 100ms) drops to 1 concurrent request
  throttler.updateCpuLoad(30);
  throttler.updateNetworkMetrics(120, 10);
  assert.equal(throttler.getStats().maxConcurrent, 1);
  assert.ok(throttler.getEffectivePacingMs() >= 55);

  // Explicit stabilizer override
  throttler.updateNetworkMetrics(18, 2, 1, 160);
  assert.equal(throttler.getStats().maxConcurrent, 1);
  assert.equal(throttler.getEffectivePacingMs(), 160);

  // Healthy metrics restore limit to 2
  throttler.updateCpuLoad(20);
  throttler.updateNetworkMetrics(12, 2, 2, 15);
  assert.equal(throttler.getStats().maxConcurrent, 2);
  assert.equal(throttler.getEffectivePacingMs(), 15);
});

test('RouterOS QoS Fast-Lane preview & apply are scoped, bounded, idempotent, exclude TCP ACK, and clean up cleanly', async () => {
  const preview = previewRouterPingFastLaneRules({
    prioritizeManagementApi: true,
    interfaceList: 'WAN-UPLINK',
    maxLimit: '15M'
  });
  assert.equal(preview.interfaceList, 'WAN-UPLINK');
  assert.equal(preview.maxLimit, '15M');
  assert.equal(preview.rules.length, 4);
  assert.ok(preview.rules.every((r) => !r.id.includes('TCP_ACK') && !r.id.includes('ICMP_POST')));
  assert.ok(preview.rules.some((r) => r.command.includes('in-interface-list=WAN-UPLINK')));
  assert.ok(preview.rules.some((r) => r.command.includes('max-limit=15M')));

  const mangles: Array<Record<string, any>> = [];
  const queues: Array<Record<string, any>> = [];
  let idSeq = 1;
  const stabilizer = new AutoPingStabilizer();

  const mockClient: RouterClientLike = {
    isConnected: () => true,
    getPingStabilizer: () => stabilizer,
    querySafe: async (cmd) => {
      if (cmd === '/ip/firewall/mangle/print') return [...mangles];
      if (cmd === '/queue/tree/print') return [...queues];
      return [];
    },
    query: async (cmd, params = []) => {
      const parsed: Record<string, string> = {};
      for (const p of params) {
        const idx = p.indexOf('=');
        if (idx === 0) {
          const sep = p.indexOf('=', 1);
          if (sep > 1) parsed[p.slice(1, sep)] = p.slice(sep + 1);
        }
      }
      if (cmd === '/ip/firewall/mangle/add') {
        mangles.push({ '.id': `*M${idSeq++}`, ...parsed, disabled: 'false', packets: '10', bytes: '640' });
        return [];
      }
      if (cmd === '/queue/tree/add') {
        queues.push({ '.id': `*Q${idSeq++}`, ...parsed, disabled: 'false', packets: '42', bytes: '4096' });
        return [];
      }
      if (cmd === '/ip/firewall/mangle/remove') {
        const idx = mangles.findIndex((m) => m['.id'] === parsed['.id']);
        if (idx >= 0) mangles.splice(idx, 1);
        return [];
      }
      if (cmd === '/queue/tree/remove') {
        const idx = queues.findIndex((q) => q['.id'] === parsed['.id']);
        if (idx >= 0) queues.splice(idx, 1);
        return [];
      }
      return [];
    }
  };

  // First apply creates 3 scoped mangle + 1 bounded queue = 4 rules (no TCP_ACK or ICMP_POST)
  const firstApply = await applyRouterPingFastLane(mockClient, {
    prioritizeManagementApi: true,
    interfaceList: 'WAN-UPLINK',
    maxLimit: '15M'
  });
  assert.equal(firstApply.success, true);
  assert.equal(firstApply.createdRules, 4);
  assert.equal(firstApply.status.active, true);
  assert.equal(firstApply.status.mangleRulesCount, 3);
  assert.equal(firstApply.status.queueRulesCount, 1);
  assert.equal(firstApply.status.interfaceList, 'WAN-UPLINK');
  assert.equal(firstApply.status.maxLimit, '15M');
  assert.equal(firstApply.status.fastLanePackets, 42);
  assert.ok(mangles.every((m) => String(m.comment).includes(ZCTRL_QOS_COMMENT_TAG)));
  assert.ok(mangles.every((m) => m['in-interface-list'] === 'WAN-UPLINK'));
  assert.ok(mangles.every((m) => !String(m.comment).includes('TCP_ACK') && !String(m.comment).includes('ICMP_POST')));
  assert.equal(queues[0].name, ZCTRL_QOS_QUEUE_NAME);
  assert.equal(queues[0]['max-limit'], '15M');

  // Second apply must be idempotent (0 new rules)
  const secondApply = await applyRouterPingFastLane(mockClient, {
    prioritizeManagementApi: true,
    interfaceList: 'WAN-UPLINK',
    maxLimit: '15M'
  });
  assert.equal(secondApply.createdRules, 0);
  assert.equal(secondApply.status.mangleRulesCount, 3);
  assert.equal(secondApply.status.queueRulesCount, 1);

  // Status check matches
  const status = await getRouterPingFastLaneStatus(mockClient);
  assert.equal(status.active, true);
  assert.equal(status.interfaceList, 'WAN-UPLINK');
  assert.equal(status.maxLimit, '15M');

  // Remove cleans up all 4 rules
  const removed = await removeRouterPingFastLane(mockClient);
  assert.equal(removed.success, true);
  assert.equal(removed.removedRules, 4);
  assert.equal(removed.status.active, false);
  assert.equal(mangles.length, 0);
  assert.equal(queues.length, 0);
});

test('runActivePingProbe feeds stabilizer ONLY on genuine router_icmp and never on socket_rtt fallback', async () => {
  const stabilizer = new AutoPingStabilizer();

  const icmpClient: RouterClientLike = {
    isConnected: () => true,
    getPingStabilizer: () => stabilizer,
    query: async (cmd) => {
      if (cmd === '/ping') {
        return [
          { sent: '1', received: '1', time: '14ms' },
          { sent: '2', received: '2', time: '22ms' },
          { sent: '3', received: '3', time: '18ms' }
        ];
      }
      return [];
    },
    querySafe: async () => []
  };

  const icmpResult = await runActivePingProbe(icmpClient, { target: '1.1.1.1', count: 3 });
  assert.equal(icmpResult.source, 'router_icmp');
  assert.equal(icmpResult.minPingMs, 14);
  assert.equal(icmpResult.maxPingMs, 22);
  assert.equal(icmpResult.avgPingMs, 18);
  assert.equal(icmpResult.packetLoss, 0);
  assert.ok(stabilizer.getSnapshot().samplesCount >= 3);

  // Fallback test when /ping throws — must NOT feed API socket RTT into stabilizer!
  const fallbackStabilizer = new AutoPingStabilizer();
  const fallbackClient: RouterClientLike = {
    isConnected: () => true,
    getPingStabilizer: () => fallbackStabilizer,
    query: async () => {
      throw new Error('ICMP disabled');
    },
    querySafe: async () => [{ name: 'MockRouter' }]
  };

  const fallbackResult = await runActivePingProbe(fallbackClient, { target: '1.1.1.1', count: 2 });
  assert.equal(fallbackResult.source, 'socket_rtt');
  assert.equal(fallbackResult.samples.length, 2);
  assert.equal(fallbackResult.packetLoss, 0);
  assert.equal(fallbackStabilizer.getSnapshot().samplesCount, 0);
});

test('Express ping-stabilizer status, qos-preview, config & 503 reconnecting routes respond cleanly when router is offline', async () => {
  const offlineToken = 'offline-test-token-' + Date.now();
  const offlineMockClient: any = {
    isConnected: () => false,
    getPingStabilizer: () => new AutoPingStabilizer()
  };
  routerClients.set(offlineToken, {
    client: offlineMockClient,
    host: '192.168.88.1',
    user: 'admin',
    role: 'admin',
    operatorId: 'root-admin',
    operatorName: 'admin',
    lastSeen: Date.now()
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).routerClient = offlineMockClient;
    next();
  });
  app.use(createSystemDiagnosticsRoutes());

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    const statusRes = await fetch(`${baseUrl}/api/mikrotik/ping-stabilizer/status`);
    assert.equal(statusRes.status, 200);
    const statusJson: any = await statusRes.json();
    assert.equal(statusJson.success, true);
    assert.ok(statusJson.stabilizer);
    assert.equal(typeof statusJson.stabilizer.targetPingMs, 'number');

    const previewRes = await fetch(`${baseUrl}/api/mikrotik/ping-stabilizer/qos-preview?interfaceList=ether1-wan&maxLimit=20M`);
    assert.equal(previewRes.status, 200);
    const previewJson: any = await previewRes.json();
    assert.equal(previewJson.success, true);
    assert.equal(previewJson.interfaceList, 'ether1-wan');
    assert.equal(previewJson.maxLimit, '20M');
    assert.equal(previewJson.rules.length, 4);
    assert.ok(Array.isArray(previewJson.rules[0].params));

    // Offline router action routes must return 503 with reconnecting: true (NOT 401!)
    const offlineLogsRes = await fetch(`${baseUrl}/api/mikrotik/system/logs`);
    assert.equal(offlineLogsRes.status, 503);
    const offlineLogsJson: any = await offlineLogsRes.json();
    assert.equal(offlineLogsJson.success, false);
    assert.equal(offlineLogsJson.reconnecting, true);

    const cfgRes = await fetch(`${baseUrl}/api/mikrotik/ping-stabilizer/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'aggressive', targetPingMs: 35 })
    });
    assert.equal(cfgRes.status, 200);
    const cfgJson: any = await cfgRes.json();
    assert.equal(cfgJson.success, true);
    assert.equal(cfgJson.stabilizer.mode, 'aggressive');
    assert.equal(cfgJson.stabilizer.targetPingMs, 35);

    // Restore default auto mode after test
    await fetch(`${baseUrl}/api/mikrotik/ping-stabilizer/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'auto', targetPingMs: 45 })
    });
  } finally {
    routerClients.delete(offlineToken);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
