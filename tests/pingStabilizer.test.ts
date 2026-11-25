import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {
  AutoPingStabilizer,
  applyRouterPingFastLane,
  getRouterPingFastLaneStatus,
  removeRouterPingFastLane,
  runActivePingProbe,
  ZCTRL_QOS_COMMENT_TAG,
  ZCTRL_QOS_QUEUE_NAME,
  type RouterClientLike
} from '../src/server/ping-stabilizer';
import { MikroTikRequestThrottler } from '../src/server/mikrotik-api';
import { createSystemDiagnosticsRoutes } from '../src/server/routes/systemDiagnosticsRoutes';

test('AutoPingStabilizer computes EWMA/jitter and escalates & recovers automatically', () => {
  const stabilizer = new AutoPingStabilizer({ mode: 'auto', targetPingMs: 45, maxCpuThreshold: 60 });

  // Healthy baseline samples
  let snap = stabilizer.recordSample({ pingMs: 12, cpuLoad: 18, packetLoss: 0 });
  snap = stabilizer.recordSample({ pingMs: 14, cpuLoad: 20, packetLoss: 0 });
  assert.equal(snap.state, 'optimal');
  assert.equal(snap.recommendedMaxConcurrent, 2);
  assert.equal(snap.suppressHeavyTelemetry, false);
  assert.ok(snap.ewmaPingMs >= 12 && snap.ewmaPingMs <= 15);

  // Spike in ping & CPU -> should escalate to stabilizing or critical
  for (let i = 0; i < 6; i++) {
    snap = stabilizer.recordSample({ pingMs: 190, cpuLoad: 82, packetLoss: 10 });
  }
  assert.ok(snap.state === 'stabilizing' || snap.state === 'critical');
  assert.equal(snap.recommendedMaxConcurrent, 1);
  assert.equal(snap.suppressHeavyTelemetry, true);
  assert.ok(snap.recommendedWsIntervalMs >= 10000);
  assert.ok(snap.recommendedPacingMs >= 110);
  assert.ok(snap.recentActions.length > 0);
  assert.ok(snap.history.length === 8);

  // Recovery back to healthy RTT & CPU
  for (let i = 0; i < 15; i++) {
    snap = stabilizer.recordSample({ pingMs: 10, cpuLoad: 15, packetLoss: 0 });
  }
  assert.equal(snap.state, 'optimal');
  assert.equal(snap.recommendedMaxConcurrent, 2);
  assert.equal(snap.suppressHeavyTelemetry, false);
});

test('AutoPingStabilizer respects aggressive, balanced, off modes and resetStats', () => {
  const stabilizer = new AutoPingStabilizer({ mode: 'aggressive', targetPingMs: 30 });
  const aggSnap = stabilizer.recordSample({ pingMs: 20, cpuLoad: 25 });
  assert.equal(aggSnap.mode, 'aggressive');
  assert.equal(aggSnap.recommendedMaxConcurrent, 1);
  assert.ok(aggSnap.recommendedPacingMs >= 30);
  const aggElevated = stabilizer.recordSample({ pingMs: 42, cpuLoad: 40 });
  assert.ok(aggElevated.recommendedPacingMs >= 65);

  const offSnap = stabilizer.updateConfig({ mode: 'off' });
  assert.equal(offSnap.mode, 'off');
  assert.equal(offSnap.suppressHeavyTelemetry, false);

  const resetSnap = stabilizer.resetStats();
  assert.equal(resetSnap.samplesCount, 0);
  assert.equal(resetSnap.ewmaPingMs, 0);
  assert.equal(resetSnap.history.length, 0);
});

test('MikroTikRequestThrottler lowers concurrency and raises pacing under high ping or CPU', () => {
  const throttler = new MikroTikRequestThrottler();
  assert.equal(throttler.getStats().maxConcurrent, 2);

  // High ping triggers drop to 1 concurrent request
  throttler.updateNetworkMetrics(120, 30);
  assert.equal(throttler.getStats().maxConcurrent, 1);
  assert.ok(throttler.getEffectivePacingMs() >= 55);

  // Explicit stabilizer override
  throttler.updateNetworkMetrics(18, 2, 1, 160);
  assert.equal(throttler.getStats().maxConcurrent, 1);
  assert.equal(throttler.getEffectivePacingMs(), 160);

  // Healthy metrics restore limit to 2
  throttler.updateCpuLoad(20);
  throttler.updateNetworkMetrics(12, 2, 2, 20);
  assert.equal(throttler.getStats().maxConcurrent, 2);
  assert.equal(throttler.getEffectivePacingMs(), 20);
});

test('RouterOS QoS Fast-Lane apply is idempotent and remove cleans up all tagged rules', async () => {
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

  // First apply creates 5 mangle + 1 queue = 6 rules
  const firstApply = await applyRouterPingFastLane(mockClient, { prioritizeManagementApi: true });
  assert.equal(firstApply.success, true);
  assert.equal(firstApply.createdRules, 6);
  assert.equal(firstApply.status.active, true);
  assert.equal(firstApply.status.mangleRulesCount, 5);
  assert.equal(firstApply.status.queueRulesCount, 1);
  assert.equal(firstApply.status.fastLanePackets, 42);
  assert.ok(mangles.every((m) => String(m.comment).includes(ZCTRL_QOS_COMMENT_TAG)));
  assert.equal(queues[0].name, ZCTRL_QOS_QUEUE_NAME);

  // Second apply must be idempotent (0 new rules)
  const secondApply = await applyRouterPingFastLane(mockClient, { prioritizeManagementApi: true });
  assert.equal(secondApply.createdRules, 0);
  assert.equal(secondApply.status.mangleRulesCount, 5);
  assert.equal(secondApply.status.queueRulesCount, 1);

  // Status check matches
  const status = await getRouterPingFastLaneStatus(mockClient);
  assert.equal(status.active, true);

  // Remove cleans up all 6 rules
  const removed = await removeRouterPingFastLane(mockClient);
  assert.equal(removed.success, true);
  assert.equal(removed.removedRules, 6);
  assert.equal(removed.status.active, false);
  assert.equal(mangles.length, 0);
  assert.equal(queues.length, 0);
});

test('runActivePingProbe parses RouterOS /ping replies and falls back to socket RTT on ICMP failure', async () => {
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

  // Fallback test when /ping throws
  const fallbackClient: RouterClientLike = {
    isConnected: () => true,
    getPingStabilizer: () => new AutoPingStabilizer(),
    query: async () => {
      throw new Error('ICMP disabled');
    },
    querySafe: async () => [{ name: 'MockRouter' }]
  };

  const fallbackResult = await runActivePingProbe(fallbackClient, { target: '1.1.1.1', count: 2 });
  assert.equal(fallbackResult.source, 'socket_rtt');
  assert.equal(fallbackResult.samples.length, 2);
  assert.equal(fallbackResult.packetLoss, 0);
});

test('Express ping-stabilizer status and config routes respond cleanly when router is offline', async () => {
  const app = express();
  app.use(express.json());
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
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
