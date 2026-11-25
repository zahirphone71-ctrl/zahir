import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBytesFromText,
  parseDataLimitToBytes,
  resolveProfileLimits,
  getHotspotUserStatus,
  getPPPSecretStatus,
  getUsermanUserStatus,
  calculateSubscriberIdleInfo,
  calculateSubscriberDisconnectInfo
} from '../src/components/subscribers/subscriberUtils.ts';

describe('Subscribers Data Limits, Status Classification & 10,000-Subscriber Benchmark', () => {
  it('parses TB/GB/MB/KB and Arabic units accurately via parseBytesFromText and parseDataLimitToBytes', () => {
    assert.equal(parseBytesFromText('500 MB'), 500 * 1024 * 1024);
    assert.equal(parseBytesFromText('2.5 GB'), Math.round(2.5 * 1024 * 1024 * 1024));
    assert.equal(parseBytesFromText('1 TB'), 1024 * 1024 * 1024 * 1024);
    assert.equal(parseBytesFromText('512 KB'), 512 * 1024);
    assert.equal(parseBytesFromText('باقة 3 جيجا'), 3 * 1024 * 1024 * 1024);
    assert.equal(parseBytesFromText('500M'), 500 * 1024 * 1024);

    assert.equal(parseDataLimitToBytes('500 MB'), 500 * 1024 * 1024);
    assert.equal(parseDataLimitToBytes('1073741824'), 1073741824);
    assert.equal(parseDataLimitToBytes(2097152), 2097152);
    assert.equal(parseDataLimitToBytes(''), 0);
    assert.equal(parseDataLimitToBytes(null), 0);
  });

  it('resolveProfileLimits interprets unit-suffixed voucher dataLimit and profile dataQuotaMb instead of truncating to 500 bytes', () => {
    const resolvedVoucher = resolveProfileLimits(
      'BASIC',
      undefined,
      undefined,
      { timeLimit: '7d', dataLimit: '500 MB' }
    );
    assert.equal(resolvedVoucher.dataLimitBytes, 500 * 1024 * 1024);
    assert.equal(resolvedVoucher.hasDataLimit, true);
    assert.equal(resolvedVoucher.timeLimitSec, 7 * 86400);

    const resolvedProfileQuota = resolveProfileLimits(
      'GOLD',
      { dataQuotaMb: 2048, validity: '30d' },
      undefined,
      undefined
    );
    assert.equal(resolvedProfileQuota.dataLimitBytes, 2048 * 1024 * 1024);
    assert.equal(resolvedProfileQuota.timeLimitSec, 30 * 86400);
  });

  it('correctly classifies Hotspot, PPPoE, and Userman subscriber states (online, new, idle, suspended, expired)', () => {
    const hotspotActiveSet = new Set(['online_user']);
    assert.equal(getHotspotUserStatus({ name: 'online_user' } as any, hotspotActiveSet), 'online');
    assert.equal(getHotspotUserStatus({ name: 'disabled_user', disabled: true } as any, hotspotActiveSet), 'suspended');
    assert.equal(getHotspotUserStatus({ name: 'new_user', uptime: '0s', bytesIn: 0, bytesOut: 0 } as any, hotspotActiveSet), 'new');
    assert.equal(
      getHotspotUserStatus({ name: 'expired_user', uptime: '1h', limitUptime: '1h', bytesIn: 1000, bytesOut: 2000 } as any, hotspotActiveSet),
      'expired'
    );
    assert.equal(
      getHotspotUserStatus({ name: 'idle_user', uptime: '30m', limitUptime: '2h', bytesIn: 500, bytesOut: 500 } as any, hotspotActiveSet),
      'idle'
    );

    const pppActiveSet = new Set(['ppp_on']);
    assert.equal(getPPPSecretStatus({ name: 'ppp_on' } as any, pppActiveSet), 'online');
    assert.equal(getPPPSecretStatus({ name: 'ppp_off', disabled: true } as any, pppActiveSet), 'suspended');
    assert.equal(getPPPSecretStatus({ name: 'ppp_new' } as any, pppActiveSet), 'new');

    const umActiveSet = new Set(['um_on']);
    assert.equal(getUsermanUserStatus({ name: 'um_on' } as any, umActiveSet), 'online');
    assert.equal(getUsermanUserStatus({ name: 'um_off', disabled: true } as any, umActiveSet), 'suspended');
    assert.equal(getUsermanUserStatus({ name: 'um_new', actualProfile: '5GB' } as any, umActiveSet), 'new');
  });

  it('processes 10,000 subscribers (limit resolution, status classification, idle/disconnect metadata, filter & sort) under high-load speed budget', () => {
    const TOTAL = 10_000;
    const activeSet = new Set<string>();
    const users: any[] = [];
    const profileObj = { name: 'VIP-10G', price: 1000, dataQuotaMb: 10240, validity: '30d', rateLimit: '5M/10M' };

    for (let i = 0; i < TOTAL; i++) {
      const name = `CARD_${String(i).padStart(5, '0')}`;
      const mod = i % 5;
      if (mod === 0) activeSet.add(name.toLowerCase());
      users.push({
        id: `*${i}`,
        name,
        password: name,
        profile: 'VIP-10G',
        uptime: mod === 1 ? '0s' : mod === 3 ? '30d' : '2h',
        bytesIn: mod === 1 ? 0 : 1024 * 1024 * (i % 500),
        bytesOut: mod === 1 ? 0 : 512 * 1024 * (i % 200),
        limitUptime: '30d',
        disabled: mod === 2,
        lastLoggedOut: mod === 4 ? '2026-01-01 10:00:00' : undefined
      });
    }

    const start = performance.now();
    const counts = { online: 0, new: 0, suspended: 0, expired: 0, idle: 0 };
    const normalized: Array<{ name: string; status: string; dataBytes: number; timeSec: number; disconnectScore: number }> = new Array(TOTAL);

    for (let i = 0; i < TOTAL; i++) {
      const u = users[i];
      const status = getHotspotUserStatus(u, activeSet, profileObj, { dataLimit: '10 GB', timeLimit: '30d' });
      counts[status]++;
      const limits = resolveProfileLimits(
        u.profile,
        profileObj,
        { limitUptime: u.limitUptime },
        { timeLimit: '30d', dataLimit: '10 GB' }
      );
      calculateSubscriberIdleInfo({ status, idleTime: status === 'online' ? '0s' : '15m' });
      const disc = calculateSubscriberDisconnectInfo({ status, lastLoggedOut: u.lastLoggedOut });
      normalized[i] = {
        name: u.name,
        status,
        dataBytes: limits.dataLimitBytes,
        timeSec: limits.timeLimitSec,
        disconnectScore: disc.timestamp
      };
    }

    const filtered = normalized.filter((item) => item.status === 'online' || item.status === 'idle');
    filtered.sort((a, b) => b.disconnectScore - a.disconnectScore);
    const elapsedMs = performance.now() - start;

    assert.equal(counts.online, 2000);
    assert.equal(counts.new, 2000);
    assert.equal(counts.suspended, 2000);
    assert.equal(counts.expired, 2000);
    assert.equal(counts.idle, 2000);
    assert.equal(filtered.length, 4000);
    assert.equal(normalized[1].dataBytes, 10240 * 1024 * 1024);
    assert.ok(elapsedMs < 2000, `Expected 10k subscriber processing < 2000ms, got ${elapsedMs.toFixed(1)}ms`);
  });
});
